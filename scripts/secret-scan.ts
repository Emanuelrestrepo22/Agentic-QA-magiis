#!/usr/bin/env bun
/**
 * secret-scan — gate anti-secretos en pre-commit (self-contained, sin binarios externos).
 *
 * Escanea SOLO las líneas AGREGADAS en el staging (git diff --cached) buscando
 * patrones de secretos reales de alta señal. Bloquea el commit si encuentra uno.
 *
 * Bypass puntual (falso positivo): agregar el marcador `secret-scan:allow` en la línea,
 * o exportar SKIP_SECRET_SCAN=1 para saltar el gate por completo (usar con criterio).
 *
 * Filosofía: alta señal, bajo falso-positivo. Placeholders (<...>, {{...}}, ${...},
 * tu_password, YOUR_KEY, example, changeme) NO disparan.
 */
import { execSync } from 'node:child_process';

interface Rule { name: string, re: RegExp }
const RULES: Rule[] = [
  { name: 'Atlassian API token', re: /\bATATT[\w\-=]{20,}/ },
  { name: 'GitLab PAT', re: /\bglpat-[\w\-]{20,}/ },
  { name: 'Postman API key', re: /\bPMAK-[A-Za-z0-9]{20,}/ },
  { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Google API key', re: /\bAIza[\w\-]{35}\b/ },
  { name: 'Stripe live key', re: /\bsk_live_[A-Za-z0-9]{16,}/ },
  { name: 'Private key block', re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP |DSA )?PRIVATE KEY-----/ },
  { name: 'JWT (3 partes, firma real)', re: /\beyJ[\w\-]{10,}\.eyJ[\w\-]{10,}\.[\w\-]{20,}/ },
  // connection string con password NO-placeholder (>=8 chars, sin <, {{, ${, palabras de ejemplo)
  { name: 'DB connection string con credencial', re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^:@/\s]+:(?!<|\{\{|\$\{)(?![^@]*(?:password|passwd|pass|example|changeme|your|xxxx))[^@/\s]{8,}@/i },
];

const PLACEHOLDER = /<[^>]+>|\{\{[^}]+\}\}|\$\{[^}]+\}|tu_|your_|your-|example|changeme|xxxx|redacted|placeholder/i;

if (process.env.SKIP_SECRET_SCAN === '1') {
  console.log('secret-scan: SKIP_SECRET_SCAN=1 → gate omitido.');
  process.exit(0);
}

let diff = '';
try {
  diff = execSync('git diff --cached --no-color -U0 --diff-filter=ACMR', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}
catch {
  process.exit(0); // sin staging o sin git → no bloquear
}

interface Hit { file: string, line: string, rule: string }
const hits: Hit[] = [];
let curFile = '';
for (const raw of diff.split('\n')) {
  if (raw.startsWith('+++ b/')) { curFile = raw.slice(6).trim(); continue; }
  if (!raw.startsWith('+') || raw.startsWith('+++')) { continue; }
  const line = raw.slice(1);
  if (line.includes('secret-scan:allow')) { continue; }
  if (PLACEHOLDER.test(line)) { continue; }
  for (const r of RULES) {
    if (r.re.test(line)) { hits.push({ file: curFile, line: line.trim().slice(0, 120), rule: r.name }); break; }
  }
}

if (hits.length === 0) { process.exit(0); }

console.error('\n\x1B[41m\x1B[97m  ⛔ secret-scan: posible(s) secreto(s) en el staging  \x1B[0m\n');
for (const h of hits) {
  console.error(`  • [${h.rule}] ${h.file}`);
  console.error(`    ${h.line}`);
}
console.error('\nQué hacer:');
console.error('  1. Sacá el secreto del código → moverlo a .env (gitignored) y referenciarlo por variable.');
console.error('  2. Si es un EJEMPLO de doc, usá un placeholder: <password>, {{VAR}} o variables de entorno.');
console.error('  3. Falso positivo puntual → agregá "secret-scan:allow" al final de la línea.');
console.error('  4. Si YA se pusheó un secreto real → ROTALO (no basta con borrarlo del repo).');
console.error('  Bypass total (evitar salvo emergencia):  SKIP_SECRET_SCAN=1 git commit ...\n');
process.exit(1);
