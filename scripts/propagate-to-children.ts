#!/usr/bin/env bun
/**
 * Light-layer propagation: parent -> automation children (TD-7)
 *
 * MAGIIS's three automation children (magiis-playwright, magiis-carrier-v2-e2e,
 * magiis-api-e2e) are pre-existing Playwright repos, NOT KATA/boilerplate
 * consumers -- they have no `kata-manifest.json` / `.template/`, so the full
 * `bun run up` updater (cli/update-boilerplate.ts) does not apply to them
 * (README.md "Multi-repo orchestration").
 *
 * This script is the minimal, real mechanism for TD-7: it copies a small,
 * fixed set of parent-owned artifacts (`.claude/skills/`, `.context/ADR/`)
 * into each child, and reuses two patterns already proven in the full
 * updater (cli/lib/updater-core.ts, cli/update-boilerplate.ts):
 *
 *   - PROTECTED_WATCHLIST  -> here: VARIANT_MARKERS. If a child declares its
 *     own convention doc (a marker path), the script never silently
 *     overwrites anything for that child's variant surface -- it reports the
 *     marker and leaves the decision to a human (ADR-0002 "Regla de
 *     convivencia": a documented, measured variant is not corrected in
 *     transit by an agent that finds it).
 *   - dry-run by default (bootstrapOnlyPaths / excludePaths style gating)
 *     -> here: nothing is written unless --write is passed explicitly.
 *
 * Usage:
 *   bun run propagate:children               # dry-run, all children
 *   bun run propagate:children --write        # apply for real
 *   bun run propagate:children --child magiis-carrier-v2-e2e
 *   bun run propagate:children --write --child magiis-api-e2e
 *
 * Scope (deliberately minimal -- see README.md TD-7):
 *   - .claude/skills/   -> copied as a whole tree (skills are read-only for children)
 *   - .context/ADR/     -> copied as a whole tree (append-only decision log)
 * Nothing else is propagated by this script. CI (Jenkins vs GitHub Actions,
 * TD-9) and full framework sync (bun run up, gh-only) are explicitly out of
 * scope here.
 */

import { execSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

// ============================================================================
// Config
// ============================================================================

interface ChildRepo {
  name: string
  /** Absolute path to the child repo's working tree on this machine. */
  path: string
  /**
   * Marker paths (relative to the child root) whose mere existence means
   * "this child has declared its own conventions for this surface -- do not
   * assume the parent's copy should win silently." Mirrors
   * PROTECTED_WATCHLIST in cli/update-boilerplate.ts.
   */
  variantMarkers: string[]
}

const CHILDREN: ChildRepo[] = [
  {
    name: 'magiis-playwright',
    path: 'C:\\Users\\Erika\\OneDrive - MAGIIS USA LLC (1)\\Escritorio\\automation-projects\\magiis-playwright',
    variantMarkers: ['docs/architecture/CONVENTIONS.md', 'ARCHITECTURE.md'],
  },
  {
    name: 'magiis-carrier-v2-e2e',
    path: 'C:\\Users\\Erika\\OneDrive - MAGIIS USA LLC (1)\\Escritorio\\automation-projects\\magiis-carrier-v2-e2e',
    variantMarkers: ['docs/architecture/CONVENTIONS.md'],
  },
  {
    name: 'magiis-api-e2e',
    path: 'C:\\Users\\Erika\\OneDrive - MAGIIS USA LLC (1)\\Escritorio\\automation-projects\\magiis-api-e2e',
    variantMarkers: ['docs/architecture/CONVENTIONS.md', 'docs/ARCHITECTURE.md'],
  },
];

/** What this script propagates, relative to the parent repo root. */
const PROPAGATED_PATHS = ['.claude/skills', '.context/ADR'];

const REPO_ROOT = process.cwd();
const LOCK_FILE_NAME = '.parent-sync.lock.json';

// ============================================================================
// Types
// ============================================================================

type FileAction = 'copy-new' | 'update' | 'skip-identical' | 'skip-variant';

interface FilePlan {
  relPath: string
  action: FileAction
  reason?: string
}

interface ChildPlan {
  child: ChildRepo
  exists: boolean
  declaredVariantMarkers: string[]
  /** Markers absent from the working tree but present on the child's default branch. */
  offBranchVariantMarkers: string[]
  files: FilePlan[]
}

interface LockFile {
  /** ISO date of the last successful --write run. */
  lastSyncedAt: string
  /** Parent git HEAD short SHA at sync time (best-effort, informational). */
  parentCommit: string
  /** relPath -> content hash (sha256) copied, for idempotency + drift detection. */
  entries: Record<string, string>
}

// ============================================================================
// Helpers
// ============================================================================

function sha256(content: Buffer): string {
  // Bun/Node both expose the Web Crypto API subtle digest synchronously via
  // node:crypto's createHash for this size of file set; keep it dependency-free.
  return createHash('sha256').update(content).digest('hex');
}

function walkFiles(root: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    if (!existsSync(dir)) { continue; }
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        stack.push(full);
      }
      else if (stat.isFile()) {
        out.push(full);
      }
    }
  }
  return out;
}

function readLock(childPath: string): LockFile | null {
  const lockPath = join(childPath, LOCK_FILE_NAME);
  if (!existsSync(lockPath)) { return null; }
  try {
    return JSON.parse(readFileSync(lockPath, 'utf-8')) as LockFile;
  }
  catch {
    return null;
  }
}

function gitShortSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: REPO_ROOT }).toString().trim();
  }
  catch {
    return 'unknown';
  }
}

// ============================================================================
// Planning (pure -- no writes)
// ============================================================================

/**
 * Whether `relPath` exists on the child's default branch, regardless of which
 * branch its working tree currently has checked out. Best-effort: any git
 * failure (not a repo, no remote, git missing) returns false rather than
 * throwing -- this is an advisory warning, never a gate.
 */
function existsOnDefaultBranch(repoPath: string, relPath: string): boolean {
  try {
    const head = spawnSync('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], {
      cwd: repoPath,
      encoding: 'utf-8',
    });
    const ref = head.status === 0 ? head.stdout.trim() : 'origin/main';
    const ls = spawnSync('git', ['ls-tree', '-r', '--name-only', ref, '--', relPath], {
      cwd: repoPath,
      encoding: 'utf-8',
    });
    return ls.status === 0 && ls.stdout.trim().length > 0;
  }
  catch {
    return false;
  }
}

function planForChild(child: ChildRepo): ChildPlan {
  const exists = existsSync(child.path);
  if (!exists) {
    return { child, exists: false, declaredVariantMarkers: [], offBranchVariantMarkers: [], files: [] };
  }

  const declaredVariantMarkers = child.variantMarkers.filter(m =>
    existsSync(join(child.path, m)),
  );

  // A marker can be absent from the working tree simply because the child is
  // checked out on a feature branch that predates it -- the variant still
  // exists on the repo's default branch. Detecting only what is on disk would
  // stay silent about a documented variant, which is exactly the failure this
  // guard is meant to prevent.
  const offBranchVariantMarkers = child.variantMarkers
    .filter(m => !declaredVariantMarkers.includes(m))
    .filter(m => existsOnDefaultBranch(child.path, m));

  const files: FilePlan[] = [];

  for (const propagated of PROPAGATED_PATHS) {
    const srcRoot = join(REPO_ROOT, propagated);
    if (!existsSync(srcRoot)) { continue; }

    for (const srcFile of walkFiles(srcRoot)) {
      const relPath = relative(REPO_ROOT, srcFile).replace(/\\/g, '/');
      const destFile = join(child.path, relPath);

      if (!existsSync(destFile)) {
        files.push({ relPath, action: 'copy-new' });
        continue;
      }

      const srcContent = readFileSync(srcFile);
      const destContent = readFileSync(destFile);

      if (sha256(srcContent) === sha256(destContent)) {
        files.push({ relPath, action: 'skip-identical' });
        continue;
      }

      // Destination exists and differs from the parent's copy. Per
      // ADR-0002's "regla de convivencia", a documented + measured variant
      // is never corrected in transit -- report it, never overwrite.
      files.push({
        relPath,
        action: 'skip-variant',
        reason: 'el destino ya existe con contenido distinto al del padre (variante local no declarada explícitamente, pero presente en disco) -- no se sobrescribe; revisar a mano',
      });
    }
  }

  return { child, exists, declaredVariantMarkers, offBranchVariantMarkers, files };
}

// ============================================================================
// Apply (writes -- only called with --write)
// ============================================================================

function applyPlan(plan: ChildPlan): { applied: number, skipped: number } {
  if (!plan.exists) { return { applied: 0, skipped: 0 }; }

  let applied = 0;
  let skipped = 0;
  const lock: LockFile = readLock(plan.child.path) ?? {
    lastSyncedAt: '',
    parentCommit: '',
    entries: {},
  };

  for (const f of plan.files) {
    if (f.action === 'skip-identical') {
      skipped++;
      continue;
    }
    if (f.action === 'skip-variant') {
      skipped++;
      continue;
    }
    // copy-new or update
    const srcFile = join(REPO_ROOT, f.relPath);
    const destFile = join(plan.child.path, f.relPath);
    mkdirSync(dirname(destFile), { recursive: true });
    copyFileSync(srcFile, destFile);
    lock.entries[f.relPath] = sha256(readFileSync(srcFile));
    applied++;
  }

  lock.lastSyncedAt = new Date().toISOString();
  lock.parentCommit = gitShortSha();

  const lockPath = join(plan.child.path, LOCK_FILE_NAME);
  writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`, 'utf-8');

  return { applied, skipped };
}

// ============================================================================
// Reporting
// ============================================================================

function printPlan(plan: ChildPlan): void {
  console.log(`\n=== ${plan.child.name} ===`);
  console.log(`  ruta: ${plan.child.path}`);

  if (!plan.exists) {
    console.log('  [SKIP] el repo no existe en esta máquina (solo lectura, nada que hacer)');
    return;
  }

  if (plan.offBranchVariantMarkers.length > 0) {
    console.log(
      '  ⚠ variante declarada en la rama por defecto pero AUSENTE del árbol de trabajo actual: '
      + `${plan.offBranchVariantMarkers.join(', ')} — el hijo está en otra rama; `
      + 'los archivos que esa variante cubre NO serán reconocidos como tales en esta corrida.',
    );
  }

  if (plan.declaredVariantMarkers.length > 0) {
    console.log(`  variantes declaradas detectadas: ${plan.declaredVariantMarkers.join(', ')}`);
    console.log('    -> el mecanismo NO pisa nada de este hijo sin revisión humana adicional');
  }

  const copyNew = plan.files.filter(f => f.action === 'copy-new');
  const updated = plan.files.filter(f => f.action === 'update');
  const identical = plan.files.filter(f => f.action === 'skip-identical');
  const variants = plan.files.filter(f => f.action === 'skip-variant');

  console.log(`  copiaría (nuevo):     ${copyNew.length}`);
  console.log(`  actualizaría:         ${updated.length}`);
  console.log(`  ya sincronizado:      ${identical.length}`);
  console.log(`  respeta como variante: ${variants.length}`);

  if (copyNew.length > 0) {
    console.log('  -- nuevos (primeros 10) --');
    for (const f of copyNew.slice(0, 10)) { console.log(`     + ${f.relPath}`); }
    if (copyNew.length > 10) { console.log(`     ... (${copyNew.length - 10} más)`); }
  }

  if (variants.length > 0) {
    console.log('  -- variantes respetadas --');
    for (const f of variants) { console.log(`     ~ ${f.relPath} (${f.reason})`); }
  }
}

// ============================================================================
// Main
// ============================================================================

function main(): void {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const childFilterIdx = args.indexOf('--child');
  const childFilter = childFilterIdx >= 0 ? args[childFilterIdx + 1] : undefined;

  const targets = childFilter
    ? CHILDREN.filter(c => c.name === childFilter)
    : CHILDREN;

  if (targets.length === 0) {
    console.error(`No se encontró ningún hijo con nombre "${childFilter}". Disponibles: ${CHILDREN.map(c => c.name).join(', ')}`);
    process.exit(1);
  }

  console.log(`Modo: ${write ? 'ESCRITURA (--write)' : 'SIMULACIÓN (dry-run, por defecto)'}`);
  console.log(`Propagando: ${PROPAGATED_PATHS.join(', ')}`);

  let totalApplied = 0;
  let totalSkipped = 0;
  let anyPlanned = false;

  for (const child of targets) {
    const plan = planForChild(child);
    printPlan(plan);

    const wouldChange = plan.files.some(f => f.action === 'copy-new' || f.action === 'update');
    if (wouldChange) { anyPlanned = true; }

    if (write && plan.exists) {
      const { applied, skipped } = applyPlan(plan);
      totalApplied += applied;
      totalSkipped += skipped;
      console.log(`  [WRITE] aplicados=${applied} saltados=${skipped} -> ${LOCK_FILE_NAME} actualizado`);
    }
  }

  console.log('\n=== Resumen ===');
  if (write) {
    console.log(`Aplicados: ${totalApplied} · Saltados/variantes: ${totalSkipped}`);
  }
  else {
    console.log(
      anyPlanned
        ? 'Simulación: hay cambios pendientes. Correr con --write para aplicarlos.'
        : 'Simulación: nada pendiente (todo sincronizado o respetado como variante) -- idempotente.',
    );
  }
}

main();
