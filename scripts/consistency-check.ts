#!/usr/bin/env bun
/**
 * scripts/consistency-check.ts
 *
 * Valida los repos de automatización del portafolio QA MAGIIS contra el
 * "contrato de consistencia" (docs/qa-standard/portfolio-consistency.md).
 *
 * Uso:
 *   bun scripts/consistency-check.ts <ruta-repo> [<ruta-repo> ...]
 *   CONSISTENCY_REPOS="/a,/b" bun scripts/consistency-check.ts
 *   bun scripts/consistency-check.ts              # audita el repo actual (cwd)
 *
 * Exit code ≠ 0 si algún check falla → usable como gate en CI.
 */

import type { Dirent } from 'node:fs';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

interface CheckResult {
  label: string
  pass: boolean
  detail: string
}

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'reports',
  'test-results',
  'playwright-report',
  'allure-results',
  'allure-report',
  'evidence',
  'refs',
  '.venv',
  'dist',
  '.hypothesis',
  'storage',
  'coverage',
  '.playwright',
  '.playwright-mcp',
]);

function walk(dir: string, onFile: (p: string) => void, depth = 0): void {
  if (depth > 8) { return; }
  let entries: Dirent<string>[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  }
  catch {
    return;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (IGNORE_DIRS.has(e.name)) { continue; }
      walk(full, onFile, depth + 1);
    }
    else {
      onFile(full);
    }
  }
}

function readText(p: string): string {
  try {
    return readFileSync(p, 'utf-8');
  }
  catch {
    return '';
  }
}

function checkRepo(repo: string): CheckResult[] {
  const results: CheckResult[] = [];

  // 1. Identidad — .agents/project.yaml con project_key + environments
  const pyaml = readText(join(repo, '.agents', 'project.yaml'));
  results.push({
    label: '.agents/project.yaml (project_key + environments)',
    pass: !!pyaml && /project_key:/.test(pyaml) && /environments:/.test(pyaml),
    detail: pyaml ? 'presente' : 'FALTA',
  });

  // 2. Contrato de repo — CLAUDE.md
  const hasClaude = existsSync(join(repo, 'CLAUDE.md'));
  results.push({
    label: 'CLAUDE.md (contrato de repo)',
    pass: hasClaude,
    detail: hasClaude ? 'presente' : 'FALTA',
  });

  // 3. Higiene — sin duplicados OneDrive "(1)"
  const dups: string[] = [];
  walk(repo, (p) => {
    if (/\(1\)/.test(basename(p))) { dups.push(p); }
  });
  results.push({
    label: 'Sin duplicados OneDrive "(1)"',
    pass: dups.length === 0,
    detail: dups.length ? `${dups.length} encontrados` : 'limpio',
  });

  // 4. Secretos — .mcp.json sin keys en claro
  const mcp = readText(join(repo, '.mcp.json'));
  const hasSecret
    = /PMAK-[A-Za-z0-9]/.test(mcp)
      // [A-Za-z0-9] no incluye '$' ni '{', así que un valor "${VAR}" nunca matchea.
      || /(?:api[_-]?key|token|secret)"\s*:\s*"[A-Z0-9]{16,}/i.test(mcp);
  results.push({
    label: 'Sin secretos en claro en .mcp.json',
    pass: !hasSecret,
    detail: mcp ? (hasSecret ? 'SECRET EN CLARO' : 'ok / usa placeholders de entorno') : 'sin .mcp.json',
  });

  // 5. Trazabilidad — annotation type:'tms' presente (helper o specs)
  let tmsFiles = 0;
  walk(repo, (p) => {
    if (/\.(?:spec|test)\.ts$/.test(p) || /traceability\.ts$/.test(p)) {
      if (/type:\s*['"]tms['"]/.test(readText(p))) { tmsFiles++; }
    }
  });
  results.push({
    label: 'Trazabilidad type:\'tms\' presente',
    pass: tmsFiles > 0,
    detail: tmsFiles ? `${tmsFiles} archivo(s)` : 'AUSENTE',
  });

  // 6. Gate CI — workflow con lint/typecheck
  let gate = false;
  walk(join(repo, '.github', 'workflows'), (p) => {
    if (/\.ya?ml$/.test(p)) {
      const t = readText(p);
      if (/typecheck|tsc --noEmit|\blint\b/.test(t)) { gate = true; }
    }
  });
  results.push({
    label: 'Gate de calidad en CI (lint/typecheck)',
    pass: gate,
    detail: gate ? 'presente' : 'ausente',
  });

  return results;
}

function resolveRepos(): string[] {
  const argv = process.argv.slice(2).filter(a => !a.startsWith('-'));
  if (argv.length > 0) { return argv.map(p => resolve(p)); }
  const env = process.env.CONSISTENCY_REPOS;
  if (env) { return env.split(',').map(s => resolve(s.trim())).filter(Boolean); }
  return [resolve(process.cwd())];
}

function main(): void {
  const repos = resolveRepos();
  let anyFail = false;

  console.log('\n\x1B[1m🔎 Portfolio Consistency Check\x1B[0m');
  console.log('   Contrato: docs/qa-standard/portfolio-consistency.md\n');

  for (const repo of repos) {
    const name = basename(repo);
    if (!existsSync(repo)) {
      console.log(`\x1B[31m✗ ${name} — ruta inexistente: ${repo}\x1B[0m\n`);
      anyFail = true;
      continue;
    }
    console.log(`\x1B[1m📦 ${name}\x1B[0m  (${repo})`);
    const results = checkRepo(repo);
    for (const r of results) {
      const icon = r.pass ? '\x1B[32m✓\x1B[0m' : '\x1B[31m✗\x1B[0m';
      console.log(`   ${icon} ${r.label} — ${r.detail}`);
      if (!r.pass) { anyFail = true; }
    }
    const passed = results.filter(r => r.pass).length;
    console.log(`   → ${passed}/${results.length} checks OK\n`);
  }

  if (anyFail) {
    console.log('\x1B[31m%s\x1B[0m', '❌ Consistencia INCOMPLETA — revisar los ✗ arriba.');
    process.exit(1);
  }
  console.log('\x1B[32m%s\x1B[0m', '✅ Portafolio consistente con el contrato.');
}

main();
