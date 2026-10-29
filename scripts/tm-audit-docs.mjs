const R = 'c:/Users/Erika/OneDrive - MAGIIS USA LLC (1)/Documentos/agentic-qa-boilerplate';
const { graphql, QUERIES, fetchAllAttachedTestIds } = await import(`${R}/cli/xray/lib/graphql.ts`);
const JIRA = (process.env.ATLASSIAN_URL || '').replace(/\/$/, '');
const AUTH = `Basic ${Buffer.from(`${process.env.ATLASSIAN_EMAIL}:${process.env.ATLASSIAN_API_TOKEN}`).toString('base64')}`;
const j = async p => (await fetch(`${JIRA}${p}`, { headers: { Authorization: AUTH, Accept: 'application/json' } })).json();

const atrId = (await j('/rest/api/3/issue/TM-617?fields=summary')).id;
const ids = new Set(await fetchAllAttachedTestIds(QUERIES.getTestExecutionTestsPage, 'getTestExecution', atrId));
console.log('tests en TM-617:', ids.size);

// traer todos los tests de la campaña y quedarnos con los del ATR
const all = [];
for (let s = 0; s < 400; s += 100) {
  const r = await graphql(QUERIES.getTestsFullDataNoCoverage, { jql: 'project = TM AND labels = "atp-mg-altaviaje"', limit: 100, start: s });
  const res = r?.getTests?.results ?? []; all.push(...res); if (res.length < 100) { break; }
}
const scope = all.filter(t => ids.has(t.issueId));
console.log('resueltos:', scope.length);

// descripciones por REST v2 (texto plano)
const keys = scope.map(t => t.jira.key);
const desc = new Map();
for (let i = 0; i < keys.length; i += 50) {
  const r = await j(`/rest/api/3/search/jql?jql=${encodeURIComponent(`key in (${keys.slice(i, i + 50).join(',')})`)}&fields=description,issuetype&maxResults=50`);
  for (const is of r.issues) { desc.set(is.key, { d: '', t: is.fields.issuetype.name }); }
}
for (let i = 0; i < keys.length; i += 25) {
  await Promise.all(keys.slice(i, i + 25).map(async (k) => {
    const v = await j(`/rest/api/2/issue/${k}?fields=description`);
    const e = desc.get(k) || {}; e.d = v.fields.description || ''; desc.set(k, e);
  }));
}

const has = (s, ...pats) => pats.some(p => new RegExp(p, 'i').test(s));
const rows = scope.map((t) => {
  const k = t.jira.key; const d = desc.get(k)?.d || ''; const st = t.steps || [];
  return {
    key: k,
    tipo: (t.testType?.name) || '?',
    pasos: st.length,
    conData: st.filter(s => (s.data || '').trim()).length,
    conResult: st.filter(s => (s.result || '').trim()).length,
    desc: d.length,
    userStory: has(d, 'Como operador', 'User Story', 'Historia de usuario', 'h3\. Historia'),
    precond: has(d, 'Precondicion', 'Pre-?Condition', 'h3\. Precondiciones'),
    casoUso: has(d, 'Caso de uso', 'Caso de Uso'),
    gherkin: has(d, 'Scenario|Given .*When|Feature:'),
  };
});

const n = rows.length; const pct = c => `${c}/${n} (${(100 * c / n).toFixed(0)}%)`;
console.log('\n===== AUDITORIA DOCUMENTAL — 6 requisitos =====');
console.log('  tipo de test        :', JSON.stringify(rows.reduce((a, r) => { a[r.tipo] = (a[r.tipo] || 0) + 1; return a; }, {})));
console.log('  1 pasos (action)    :', pct(rows.filter(r => r.pasos > 0).length));
console.log('  2 resultado esperado:', pct(rows.filter(r => r.conResult > 0).length));
console.log('  3 precondiciones    :', pct(rows.filter(r => r.precond).length));
console.log('  4 user story        :', pct(rows.filter(r => r.userStory).length));
console.log('  5 caso de uso       :', pct(rows.filter(r => r.casoUso).length));
console.log('  6 gherkin           :', pct(rows.filter(r => r.gherkin).length));
console.log('  (extra) test data   :', pct(rows.filter(r => r.conData > 0).length));
console.log('  descripcion vacia   :', pct(rows.filter(r => r.desc < 50).length));
console.log('\n  pasos: total', rows.reduce((a, r) => a + r.pasos, 0), '| min', Math.min(...rows.map(r => r.pasos)), '| max', Math.max(...rows.map(r => r.pasos)));
console.log('\n--- casos sin user story (muestra) ---');
for (const r of rows.filter(r => !r.userStory).slice(0, 8)) { console.log('   ', r.key, 'desc', r.desc, 'ch'); }
console.log('\n--- casos sin caso de uso (muestra) ---');
for (const r of rows.filter(r => !r.casoUso).slice(0, 8)) { console.log('   ', r.key, 'desc', r.desc, 'ch'); }
