/**
 * Xray CLI - "3-axis at birth"
 *
 * Every Xray artifact this CLI creates is born under its QA-process epic, so
 * axis 1 of the 3-axis model (parent = QA bucket · link = source Story ·
 * components = product module) is never left for a later repair pass. A corpus
 * of 577 orphans accumulated precisely because `parent` was set afterwards, or
 * not at all.
 *
 * Resolution is offline: `.agents/project.yaml` plus the static table in
 * `hierarchy-model.ts`. Only the unhappy path (Xray dropped the parent) needs
 * Jira REST, which keeps `create` working for callers configured with Xray
 * credentials alone.
 */

import type { Flags } from '../types/index.js';
import {
  loadQaEpics,
  resolveDestination,
  resolveDestinationSlot,
} from './hierarchy-model.js';
import { setParent } from './jira-search.js';
import { log } from './logger.js';
import { getFlag } from './parser.js';

export interface BirthParent {
  /** Epic key to write into `jira.fields.parent`. `null` ONLY when the operator opted out. */
  parentKey: string | null
  source: 'qa-epic-table' | 'explicit-flag' | 'opted-out'
}

/**
 * Refuse a parent that lives in another Jira project. `loadQaEpics()` returns
 * the TMS project's epics unconditionally, so a `--project` pointing elsewhere
 * would otherwise send a cross-project parent to Jira and fail there. Compared
 * by key prefix on purpose: free, offline, deterministic, and it fires before
 * a single write. It also catches a mistyped `--epic MG-5`.
 */
function assertSameProject(epicKey: string, projectKey: string, what: string): void {
  const epicProject = epicKey.split('-')[0];
  if (epicProject !== projectKey) {
    throw new Error(
      `Cross-project parent refused: a ${what} in project ${projectKey} cannot parent to ${epicKey} `
      + `(project ${epicProject}). The QA-process epics live in the TMS project `
      + '(.agents/project.yaml -> testing.tms_project_key). '
      + `Re-run with --project ${epicProject}, or --no-epic to create it unparented.`,
    );
  }
}

/**
 * Decide the birth parent. Pure and offline — throws rather than returning a
 * wrong answer, and never falls back to a "default" epic.
 *
 * @param flags       the parsed CLI flags (`--epic` / `--no-epic` are read here)
 * @param issuetypeId one of `ISSUETYPE.*` from hierarchy-model.ts
 * @param projectKey  the already-resolved target project (`--project` || config default)
 */
export function resolveBirthParent(
  flags: Flags,
  issuetypeId: string,
  projectKey: string,
): BirthParent {
  // `--no-epic` is detected by PRESENCE, not with getBoolFlag: parseArgs treats
  // `--no-epic <token-without-dash>` as a value flag, so the value may be `true`
  // OR a swallowed string. Presence covers `--no-epic`, `--no-epic --summary X`
  // and `--no-epic TM` identically. No create command reads positionals, so a
  // swallowed token cannot corrupt anything else. Do NOT "clean this up".
  const optedOut = flags['no-epic'] !== undefined;
  const explicit = getFlag(flags, 'epic');

  if (optedOut && explicit) {
    throw new Error('Contradictory flags: --no-epic and --epic <KEY> cannot be combined.');
  }

  if (optedOut) {
    return { parentKey: null, source: 'opted-out' };
  }

  if (explicit) {
    assertSameProject(explicit, projectKey, 'Xray artifact');
    return { parentKey: explicit, source: 'explicit-flag' };
  }

  const slot = resolveDestinationSlot(issuetypeId);
  if (slot === null) {
    throw new Error(
      `Unrecognized issuetype.id ${issuetypeId} -- refusing to guess an epic (fail-closed). `
      + 'See cli/xray/lib/hierarchy-model.ts.',
    );
  }

  const parentKey = resolveDestination(issuetypeId, loadQaEpics());
  if (parentKey === null) {
    throw new Error(
      `qa.qa_epics.${slot}.key is null in .agents/project.yaml -- refusing to invent or reuse `
      + 'an epic. Fill it, or pass --no-epic to create an intentional orphan.',
    );
  }

  assertSameProject(parentKey, projectKey, 'Xray artifact');
  return { parentKey, source: 'qa-epic-table' };
}

/** Report the birth parent on stdout, in the same shape for all five create commands. */
export function printBirthParent(birth: BirthParent): void {
  if (birth.parentKey === null) {
    log.warn(
      '--no-epic: created WITHOUT a parent (deliberate orphan). '
      + 'It will be reported by `bun run xray:hierarchy:check`.',
    );
    return;
  }
  console.log(`  Parent: ${birth.parentKey}  (${birth.source})`);
}

/**
 * Confirm the parent actually stuck, using the value Xray already echoed back in
 * the create response — no extra round trip on the happy path.
 *
 * Xray has historically dropped `jira.fields.parent` on some create paths (see
 * scripts/mg19-suite-materialize.mjs, which repairs it with a PUT). When that
 * happens the artifact exists but is orphaned, so this repairs it once. Failing
 * to repair EXITS NON-ZERO: the operation genuinely did not complete, and an
 * exit 0 plus a warning is exactly the shape that let orphans accumulate
 * unnoticed. The created key is printed before this runs, so nothing is lost.
 */
export async function ensureParentStuck(
  issueKey: string,
  wantParent: string,
  observedParentKey: string | null | undefined,
): Promise<'born-parented' | 'repaired'> {
  if (observedParentKey === wantParent) {
    return 'born-parented';
  }

  log.warn(
    `Xray did not persist the parent on ${issueKey} `
    + `(wanted ${wantParent}, got ${observedParentKey ?? 'none'}). Repairing...`,
  );

  try {
    await setParent(issueKey, wantParent);
  }
  catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `${issueKey} was created but its parent did NOT stick `
      + `(want ${wantParent}, got ${observedParentKey ?? 'none'}). `
      + 'Xray credentials alone cannot repair this -- Jira REST credentials are required. Fix it with:\n'
      + `  bun xray hierarchy plan --project ${wantParent.split('-')[0]} --lot fix-${issueKey} `
      + `--keys ${issueKey} --out .backups/hierarchy/fix-${issueKey}\n`
      + `  bun xray hierarchy apply --plan .backups/hierarchy/fix-${issueKey}.json --apply --max-writes 1\n`
      + `Original error: ${detail}`,
    );
  }

  log.success(`  Parent repaired: ${issueKey} -> ${wantParent}`);
  return 'repaired';
}
