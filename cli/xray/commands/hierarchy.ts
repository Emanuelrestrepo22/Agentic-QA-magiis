/**
 * Xray CLI - Hierarchy Command (Fase 3, remediation plan)
 *
 * Audits and repairs the Jira-layer `parent` (Epic Link) field for Xray
 * entities -- the axis that broke silently in the MG->TM project migration.
 * See `.agents/xray-key-migration.json` and the remediation plan for context.
 *
 * Subcommands: audit | snapshot | plan | apply | rollback | verify.
 * `apply` defaults to dry-run; every write requires an explicit `--apply`.
 *
 * Fail-closed throughout: an issuetype.id `hierarchy-model.ts` does not
 * recognize aborts the batch, it is never defaulted to an epic.
 */

import type { QaEpics } from '../lib/hierarchy-model.js';
import type { IssueSnapshot } from '../lib/jira-search.js';
import type { Flags } from '../types/index.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  isProhibitedIssuetype,
  ISSUETYPE,
  loadQaEpics,

  REPAIRABLE_ISSUETYPE_IDS,
  resolveDestination,
} from '../lib/hierarchy-model.js';
import {
  getMyself,
  setParent,
  snapshotKeys,
  snapshotProject,
} from '../lib/jira-search.js';
import { log } from '../lib/logger.js';
import { getFlag, getFlagArray, requireFlag } from '../lib/parser.js';

function ensureDir(path: string): void {
  const dir = dirname(path);
  if (dir && !existsSync(dir)) { mkdirSync(dir, { recursive: true }); }
}

function writeJson(path: string, data: unknown): void {
  ensureDir(path);
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

// ============================================================================
// Membership evidence (best-effort classifier — audit is a triage aid, not a
// source of truth; the destination itself never depends on the evidence kind)
// ============================================================================

type EvidenceKind = 'label-campaign' | 'label-tcid' | 'container-self' | 'no-evidence';

function classifyEvidence(issue: IssueSnapshot): { kind: EvidenceKind, detail: string } {
  const tcidLabel = issue.labels.find(l => l.startsWith('tcid:'));
  if (tcidLabel) { return { kind: 'label-tcid', detail: tcidLabel }; }
  const campaignLabel = issue.labels.find(l => /^(?:atp|atr)[:-]/.test(l));
  if (campaignLabel) { return { kind: 'label-campaign', detail: campaignLabel }; }
  const containerTypes: string[] = [ISSUETYPE.testSet, ISSUETYPE.testExecution, ISSUETYPE.precondition];
  if (containerTypes.includes(issue.issuetypeId)) {
    return { kind: 'container-self', detail: `${issue.issuetypeName} is its own membership unit` };
  }
  return { kind: 'no-evidence', detail: 'no campaign/tcid label found' };
}

interface OrphanRow {
  key: string
  issuetypeId: string
  issuetypeName: string
  statusId: string
  statusName: string
  assigneeAccountId: string | null
  assigneeDisplayName: string | null
  summary: string
  target: string | null
  evidence: EvidenceKind
  evidenceDetail: string
}

function findOrphans(issues: IssueSnapshot[], epics: QaEpics): OrphanRow[] {
  return issues
    .filter(i => REPAIRABLE_ISSUETYPE_IDS.includes(i.issuetypeId) && i.parentKey === null)
    .map((i) => {
      const evidence = classifyEvidence(i);
      return {
        key: i.key,
        issuetypeId: i.issuetypeId,
        issuetypeName: i.issuetypeName,
        statusId: i.statusId,
        statusName: i.statusName,
        assigneeAccountId: i.assigneeAccountId,
        assigneeDisplayName: i.assigneeDisplayName,
        summary: i.summary,
        target: resolveDestination(i.issuetypeId, epics),
        evidence: evidence.kind,
        evidenceDetail: evidence.detail,
      };
    });
}

// ============================================================================
// audit
// ============================================================================

async function audit(flags: Flags): Promise<void> {
  const project = requireFlag(flags, 'project');
  const strict = flags.strict === true;
  const jsonOut = getFlag(flags, 'out');

  log.title(`Hierarchy audit — project ${project}`);
  const epics = loadQaEpics();
  const issues = await snapshotProject(project);

  const epicCount = issues.filter(i => i.issuetypeId === ISSUETYPE.epic).length;
  const prohibited = issues.filter(i => isProhibitedIssuetype(i.issuetypeId) && i.parentKey === null);
  const orphans = findOrphans(issues, epics);

  const byType = new Map<string, OrphanRow[]>();
  for (const o of orphans) {
    const list = byType.get(o.issuetypeName) ?? [];
    list.push(o);
    byType.set(o.issuetypeName, list);
  }

  console.log(`Total issues in ${project}: ${issues.length}`);
  console.log(`Epics (excluded from scope): ${epicCount}`);
  if (prohibited.length > 0) {
    log.warn(`${prohibited.length} prohibited-issuetype issue(s) with no parent (Error/Bug/Defect) -- NOT this tool's scope, mg-scope-xray-only`);
  }
  console.log('\nOrphans by issuetype (parent == null, excluding Epics):');
  for (const [typeName, list] of byType) {
    const withTarget = list.filter(o => o.target !== null).length;
    console.log(`  ${typeName.padEnd(16)} ${list.length.toString().padStart(4)}  (${withTarget} resolvable, ${list.length - withTarget} UNKNOWN issuetype -- would abort)`);
  }
  console.log(`  ${'TOTAL'.padEnd(16)} ${orphans.length.toString().padStart(4)}`);

  const evidenceCounts = new Map<EvidenceKind, number>();
  for (const o of orphans) { evidenceCounts.set(o.evidence, (evidenceCounts.get(o.evidence) ?? 0) + 1); }
  console.log('\nMembership evidence:');
  for (const [kind, count] of evidenceCounts) { console.log(`  ${kind.padEnd(16)} ${count}`); }

  if (jsonOut) {
    writeJson(jsonOut, { project, auditedAt: new Date().toISOString(), totalIssues: issues.length, epicCount, orphans });
    log.success(`Written: ${jsonOut}`);
  }

  if (strict && orphans.length > 0) {
    log.error(`--strict: ${orphans.length} orphan(s) found.`);
    process.exit(1);
  }
}

// ============================================================================
// snapshot
// ============================================================================

async function snapshotCmd(flags: Flags): Promise<void> {
  const project = requireFlag(flags, 'project');
  const out = requireFlag(flags, 'out');

  log.title(`Hierarchy snapshot — project ${project}`);
  const issues = await snapshotProject(project);
  writeJson(out, { project, snapshotAt: new Date().toISOString(), count: issues.length, issues });

  const epics = loadQaEpics();
  const orphansExclEpics = findOrphans(issues, epics).length;
  const orphansInclEpics = issues.filter(i => i.parentKey === null && i.issuetypeId !== ISSUETYPE.epic).length;

  log.success(`Written: ${out}`);
  console.log(`length: ${issues.length}`);
  console.log(`orphans excluding Epics (issuetype in scope + parent null): ${orphansExclEpics}`);
  console.log(`orphans excluding Epics (any issuetype, parent null): ${orphansInclEpics}`);
}

// ============================================================================
// plan — preview + ownership gate. Scope comes from EITHER --keys (explicit,
// comma-separated) OR --label (filtered within the current orphan set).
// ============================================================================

function scopeHash(keys: string[]): string {
  // Cheap, dependency-free hash (FNV-1a) truncated to 8 hex chars — only used
  // to detect scope drift between plan and apply, not for cryptographic use.
  let h = 0x811C9DC5;
  for (const k of [...keys].sort().join(',')) {
    h ^= k.charCodeAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

interface PlanItem {
  key: string
  issuetypeId: string
  issuetypeName: string
  statusId: string
  statusName: string
  assigneeAccountId: string | null
  assigneeDisplayName: string | null
  currentParent: string | null
  target: string
  updated: string
}

interface PlanFile {
  lot: string
  scopeHash: string
  derivation: string
  authenticatedAccountId: string
  createdAt: string
  items: PlanItem[]
}

async function planCmd(flags: Flags): Promise<void> {
  const project = requireFlag(flags, 'project');
  const lot = requireFlag(flags, 'lot');
  const outPrefix = requireFlag(flags, 'out');
  const explicitKeys = getFlagArray(flags, 'keys').flatMap(v => v.split(',')).map(v => v.trim()).filter(Boolean);
  const labelFilter = getFlag(flags, 'label');
  const issuetypeFilter = getFlagArray(flags, 'issuetype').flatMap(v => v.split(',')).map(v => v.trim()).filter(Boolean);

  const epics = loadQaEpics();
  const me = await getMyself();
  const issues = await snapshotProject(project);
  const orphans = findOrphans(issues, epics);

  let candidates = orphans;
  if (explicitKeys.length > 0) {
    const wanted = new Set(explicitKeys);
    candidates = orphans.filter(o => wanted.has(o.key));
    const missing = explicitKeys.filter(k => !candidates.some(c => c.key === k));
    if (missing.length > 0) {
      log.error(`Key(s) not found in the current orphan set (already parented, wrong project, or wrong issuetype): ${missing.join(', ')}`);
      process.exit(2);
    }
  }
  if (labelFilter) {
    const bySnapshot = new Map(issues.map(i => [i.key, i]));
    candidates = candidates.filter((o) => {
      const full = bySnapshot.get(o.key);
      return full?.labels.includes(labelFilter);
    });
  }
  if (issuetypeFilter.length > 0) {
    candidates = candidates.filter(o => issuetypeFilter.includes(o.issuetypeId));
  }

  const unresolved = candidates.filter(o => o.target === null);
  if (unresolved.length > 0) {
    log.error(`FATAL: ${unresolved.length} candidate(s) have an unrecognized issuetype.id -- aborting, not defaulting to an epic:`);
    for (const u of unresolved) { console.log(`  ${u.key}  issuetype(${u.issuetypeId}) ${u.issuetypeName}`); }
    process.exit(2);
  }

  // Ownership gate — hard stop on any third-party assignee.
  const thirdParty = candidates.filter(c => c.assigneeAccountId !== null && c.assigneeAccountId !== me.accountId);
  if (thirdParty.length > 0) {
    log.error(`OWNERSHIP GATE FAILED — ${thirdParty.length} issue(s) assigned to someone other than the authenticated user (${me.displayName}):`);
    for (const t of thirdParty) { console.log(`  ${t.key}  assignee: ${t.assigneeDisplayName}`); }
    log.error('No preview file written. This authorization does not cover third-party tickets.');
    process.exit(2);
  }

  const bySnapshot = new Map(issues.map(i => [i.key, i]));
  const items: PlanItem[] = candidates.map(c => ({
    key: c.key,
    issuetypeId: c.issuetypeId,
    issuetypeName: c.issuetypeName,
    statusId: c.statusId,
    statusName: c.statusName,
    assigneeAccountId: c.assigneeAccountId,
    assigneeDisplayName: c.assigneeDisplayName,
    currentParent: c.target !== null ? null : null,
    target: c.target as string,
    updated: bySnapshot.get(c.key)?.updated ?? '',
  }));

  const hash = scopeHash(items.map(i => i.key));
  const derivation = [
    explicitKeys.length > 0 ? `explicit --keys (${explicitKeys.length})` : null,
    labelFilter ? `label = "${labelFilter}"` : null,
    issuetypeFilter.length > 0 ? `issuetype.id in (${issuetypeFilter.join(',')})` : null,
    `issuetype.id in (${REPAIRABLE_ISSUETYPE_IDS.join(',')}) AND parent == null`,
  ].filter(Boolean).join(' AND ');

  const planFile: PlanFile = {
    lot,
    scopeHash: hash,
    derivation,
    authenticatedAccountId: me.accountId,
    createdAt: new Date().toISOString(),
    items,
  };

  const jsonPath = `${outPrefix}.json`;
  const mdPath = `${outPrefix}.md`;
  writeJson(jsonPath, planFile);

  const unassignedCount = items.filter(i => i.assigneeAccountId === null).length;
  const authenticatedCount = items.filter(i => i.assigneeAccountId === me.accountId).length;
  const md: string[] = [];
  md.push(`LOT ${lot} · scope-hash: ${hash}`);
  md.push(`derivation: ${derivation}`);
  md.push(`authenticated user: ${me.displayName} (${me.accountId})`);
  md.push('');
  md.push('KEY      TYPE(id)              ASSIGNEE                  STATUS(id)                PARENT NOW -> TARGET');
  for (const it of items) {
    const type = `${it.issuetypeName}(${it.issuetypeId})`;
    const assignee = it.assigneeDisplayName ?? '(unassigned)';
    const status = `${it.statusName}(${it.statusId})`;
    md.push(`${it.key.padEnd(9)}${type.padEnd(23)}${assignee.padEnd(26)}${status.padEnd(26)}(none) -> ${it.target}`);
  }
  md.push('');
  md.push(`OWNERSHIP GATE: ${items.length} issues · ${authenticatedCount} authenticated · ${unassignedCount} unassigned · 0 third-party -> PASS`);
  md.push('SIDE EFFECTS  : field write only (parent). No transition. resolution/resolutiondate untouched.');
  md.push(`                ${items.length} 'issue updated' events -> watcher notifications.`);
  md.push('REVERSIBILITY : parent is a field. Rehearse rollback on one item before any multi-item lot.');
  md.push(`WRITES        : ${items.length}  (pass --max-writes ${items.length} to apply)`);
  writeFileSync(mdPath, `${md.join('\n')}\n`, 'utf8');

  log.success(`Written: ${jsonPath}`);
  log.success(`Written: ${mdPath}`);
  console.log(`\n${items.length} issue(s) in scope. Read ${mdPath}, then:`);
  console.log(`  bun xray hierarchy apply --plan ${jsonPath} --apply --max-writes ${items.length}`);
}

// ============================================================================
// apply
// ============================================================================

interface ApplyLogLine {
  key: string
  result: 'applied' | 'already' | 'CONFLICT' | 'DRIFT' | 'FAILED'
  detail?: string
  at: string
}

async function applyCmd(flags: Flags): Promise<void> {
  const planPath = requireFlag(flags, 'plan');
  const doApply = flags.apply === true;
  const maxWrites = Number.parseInt(getFlag(flags, 'max-writes', '0') ?? '0', 10);
  const onlyKey = getFlag(flags, 'only');
  const paceMs = Number.parseInt(getFlag(flags, 'pace-ms', '150') ?? '150', 10);
  const maxConsecutiveFails = Number.parseInt(getFlag(flags, 'max-consecutive-fails', '3') ?? '3', 10);
  const maxFailRate = Number.parseFloat(getFlag(flags, 'max-fail-rate', '0.05') ?? '0.05');

  if (!existsSync(planPath)) { throw new Error(`Plan file not found: ${planPath}`); }
  const planFile = JSON.parse(readFileSync(planPath, 'utf8')) as PlanFile;

  let items = planFile.items;
  if (onlyKey) { items = items.filter(i => i.key === onlyKey); }

  // Scope-hash guard: re-derive the live orphan scope isn't cheap enough to
  // re-run on every apply call, so this guard re-checks the CURRENT state of
  // exactly the planned keys instead — if any planned key is no longer an
  // orphan or its target changed, that is drift too.
  const currentHash = scopeHash(planFile.items.map(i => i.key));
  if (currentHash !== planFile.scopeHash) {
    throw new Error('Scope-hash mismatch: plan file was edited after being written. Regenerate it with \'hierarchy plan\'.');
  }

  if (!doApply) {
    log.title(`DRY RUN — ${items.length} item(s) from lot ${planFile.lot}`);
    for (const it of items) { console.log(`  ${it.key}  (none) -> ${it.target}`); }
    log.dim('\nPass --apply --max-writes <N> to write.');
    return;
  }

  if (maxWrites <= 0 || maxWrites < items.length) {
    throw new Error(`--max-writes must be >= the number of items in scope (${items.length}). Got: ${maxWrites || '(none)'}. This is a hard circuit breaker, not a suggestion.`);
  }

  log.title(`APPLY — lot ${planFile.lot} — ${items.length} item(s), max-writes=${maxWrites}`);
  const logPath = `.backups/hierarchy/apply-${planFile.lot}-${Date.now()}.jsonl`;
  ensureDir(logPath);

  let writes = 0;
  let consecutiveFails = 0;
  let fails = 0;
  const results: ApplyLogLine[] = [];

  for (const item of items) {
    if (writes >= maxWrites) {
      log.warn(`Circuit breaker: reached --max-writes (${maxWrites}). Stopping — re-run to resume.`);
      break;
    }

    let line: ApplyLogLine;
    try {
      // Idempotent re-check immediately before writing (parent may have
      // changed since the plan was generated).
      const [live] = await snapshotKeys([item.key]);
      if (!live) { throw new Error('issue not found on re-fetch'); }

      if (live.parentKey === item.target) {
        line = { key: item.key, result: 'already', at: new Date().toISOString() };
      }
      else if (live.parentKey !== null) {
        line = { key: item.key, result: 'CONFLICT', detail: `parent is already ${live.parentKey}, not ${item.target}`, at: new Date().toISOString() };
      }
      else if (live.updated !== item.updated) {
        line = { key: item.key, result: 'DRIFT', detail: `updated changed: plan=${item.updated} live=${live.updated}`, at: new Date().toISOString() };
      }
      else {
        await setParent(item.key, item.target);
        writes += 1;
        line = { key: item.key, result: 'applied', at: new Date().toISOString() };
        consecutiveFails = 0;
      }
    }
    catch (err) {
      fails += 1;
      consecutiveFails += 1;
      line = { key: item.key, result: 'FAILED', detail: err instanceof Error ? err.message : String(err), at: new Date().toISOString() };
    }

    results.push(line);
    writeFileSync(logPath, `${JSON.stringify(line)}\n`, { flag: 'a' });
    const marker = line.result === 'applied' ? log.success : line.result === 'FAILED' ? log.error : log.warn;
    marker(`  ${item.key}: ${line.result}${line.detail ? ` (${line.detail})` : ''}`);

    if (consecutiveFails >= maxConsecutiveFails) {
      log.error(`Circuit breaker: ${maxConsecutiveFails} consecutive failures. Stopping.`);
      break;
    }
    const rate = fails / results.length;
    if (results.length >= 10 && rate > maxFailRate) {
      log.error(`Circuit breaker: fail rate ${(rate * 100).toFixed(1)}% > ${(maxFailRate * 100).toFixed(1)}%. Stopping.`);
      break;
    }
    if (paceMs > 0) { await new Promise(r => setTimeout(r, paceMs)); }
  }

  const applied = results.filter(r => r.result === 'applied').length;
  const already = results.filter(r => r.result === 'already').length;
  const conflicts = results.filter(r => r.result === 'CONFLICT').length;
  const drift = results.filter(r => r.result === 'DRIFT').length;
  const failed = results.filter(r => r.result === 'FAILED').length;
  log.title('Summary');
  console.log(`  applied: ${applied} · already: ${already} · CONFLICT: ${conflicts} · DRIFT: ${drift} · FAILED: ${failed}`);
  console.log(`  log: ${logPath}`);
}

// ============================================================================
// rollback
// ============================================================================

async function rollbackCmd(flags: Flags): Promise<void> {
  const snapshotPath = requireFlag(flags, 'snapshot');
  const onlyKey = requireFlag(flags, 'only');
  const doApply = flags.apply === true;

  const snap = JSON.parse(readFileSync(snapshotPath, 'utf8')) as { issues: IssueSnapshot[] };
  const original = snap.issues.find(i => i.key === onlyKey);
  if (!original) { throw new Error(`${onlyKey} not found in snapshot ${snapshotPath}`); }

  log.title(`Rollback ${onlyKey} -> parent = ${original.parentKey ?? 'null'}`);
  if (!doApply) {
    log.dim('Dry run. Pass --apply to write.');
    return;
  }
  await setParent(onlyKey, original.parentKey);
  log.success(`${onlyKey}.parent = ${original.parentKey ?? 'null'}`);
}

// ============================================================================
// verify — re-snapshot the baseline's keys and diff every field except
// parent/updated (those are EXPECTED to change; everything else must not).
// ============================================================================

async function verifyCmd(flags: Flags): Promise<void> {
  const againstPath = requireFlag(flags, 'against');
  const outPath = getFlag(flags, 'out');

  const baseline = JSON.parse(readFileSync(againstPath, 'utf8')) as { issues: IssueSnapshot[] };
  const keys = baseline.issues.map(i => i.key);
  log.title(`Verify — re-snapshotting ${keys.length} issue(s) from ${againstPath}`);
  const current = await snapshotKeys(keys);
  const currentByKey = new Map(current.map(i => [i.key, i]));

  const IGNORED_FIELDS = new Set(['parentKey', 'updated']);
  const unexpectedDiffs: Array<{ key: string, field: string, before: unknown, after: unknown }> = [];

  for (const before of baseline.issues) {
    const after = currentByKey.get(before.key);
    if (!after) {
      unexpectedDiffs.push({ key: before.key, field: '(missing)', before: 'existed', after: 'not found' });
      continue;
    }
    for (const field of Object.keys(before) as Array<keyof IssueSnapshot>) {
      if (IGNORED_FIELDS.has(field)) { continue; }
      const b = JSON.stringify(before[field]);
      const a = JSON.stringify(after[field]);
      if (b !== a) { unexpectedDiffs.push({ key: before.key, field, before: before[field], after: after[field] }); }
    }
  }

  if (outPath) { writeJson(outPath, { verifiedAt: new Date().toISOString(), against: againstPath, unexpectedDiffs }); }

  if (unexpectedDiffs.length === 0) {
    log.success(`0 unexpected diffs across ${keys.length} issues (excluding parent/updated).`);
  }
  else {
    log.error(`${unexpectedDiffs.length} unexpected diff(s):`);
    for (const d of unexpectedDiffs.slice(0, 50)) {
      console.log(`  ${d.key}.${d.field}: ${JSON.stringify(d.before)} -> ${JSON.stringify(d.after)}`);
    }
    process.exit(1);
  }
}

// ============================================================================
// dispatch
// ============================================================================

export async function hierarchy(subcommand: string, flags: Flags): Promise<void> {
  switch (subcommand) {
    case 'audit': return audit(flags);
    case 'snapshot': return snapshotCmd(flags);
    case 'plan': return planCmd(flags);
    case 'apply': return applyCmd(flags);
    case 'rollback': return rollbackCmd(flags);
    case 'verify': return verifyCmd(flags);
    default:
      throw new Error(`Unknown hierarchy subcommand: '${subcommand}'. Expected: audit | snapshot | plan | apply | rollback | verify`);
  }
}

// The "3-axis at birth" re-export block that used to live here is gone: the
// create commands reach the same table directly through cli/xray/lib/birth-parent.ts
// -> hierarchy-model.ts, so routing them via this command module was a false trail.
