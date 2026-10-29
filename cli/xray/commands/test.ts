/**
 * Xray CLI - Test Commands
 *
 * Commands: create, get, list, add-step
 */

import type { Flags, JiraFields, PreconditionResult, TestResult, TestStepResponse } from '../types/index.js';
import { ensureParentStuck, printBirthParent, resolveBirthParent } from '../lib/birth-parent.js';
import { loadConfig } from '../lib/config.js';
import { graphql, MUTATIONS, QUERIES } from '../lib/graphql.js';
import { ISSUETYPE } from '../lib/hierarchy-model.js';
import { log } from '../lib/logger.js';
import { getFlag, getFlagArray, requireFlag } from '../lib/parser.js';

// ============================================================================
// CREATE
// ============================================================================

export async function create(flags: Flags): Promise<void> {
  const config = loadConfig();
  const projectKey = getFlag(flags, 'project') || config?.default_project;
  if (!projectKey) {
    throw new Error('Missing required flag: --project');
  }
  const summary = requireFlag(flags, 'summary');
  const testType = getFlag(flags, 'type', 'Manual');
  const description = getFlag(flags, 'description');
  const labelsStr = getFlag(flags, 'labels');
  const labels = labelsStr ? labelsStr.split(',').map(l => l.trim()) : undefined;
  const folderPath = getFlag(flags, 'folder');
  // Some Jira projects (e.g. MAGIIS MX) forbid unassigned issues and have no
  // assignable default assignee -> createTest fails unless we pass an assignee.
  // Accept --assignee <accountId> (or ASSIGNEE_ACCOUNT_ID env).
  const assigneeId = getFlag(flags, 'assignee') || process.env.ASSIGNEE_ACCOUNT_ID;

  // Manual steps are NOT created here. Xray Cloud's `createTest` mutation
  // accepts a `steps` argument but does not persist it reliably (steps silently
  // drop — observed stepCount:0 after a "Test created" success). The reliable
  // path is the dedicated `addTestStep` mutation. We therefore create the test
  // WITHOUT inline steps and require a follow-up `test add-step` per step.
  const stepsFlags = getFlagArray(flags, 'step');

  let unstructured: string | undefined;
  let gherkin: string | undefined;

  if (testType === 'Generic') {
    unstructured = getFlag(flags, 'definition') || summary;
  }
  else if (testType === 'Cucumber') {
    gherkin = getFlag(flags, 'gherkin');
    if (!gherkin) {
      throw new Error('Cucumber tests require --gherkin flag with feature definition');
    }
  }

  // 3-axis at birth: resolve the QA-process epic BEFORE any network call, so a
  // cross-project or unresolvable destination aborts with zero side effects.
  const birth = resolveBirthParent(flags, ISSUETYPE.xrayTest, projectKey);

  log.dim(`Creating ${testType} test in project ${projectKey}...`);

  const jiraFields: Record<string, unknown> = {
    summary,
    description,
    labels,
    project: { key: projectKey },
  };
  if (assigneeId) {
    jiraFields.assignee = { id: assigneeId };
  }
  if (birth.parentKey) {
    jiraFields.parent = { key: birth.parentKey };
  }

  const result = await graphql<{ createTest: { test: { jira: JiraFields, testType: { name: string }, issueId: string }, warnings: string[] } }>(MUTATIONS.createTest, {
    testType: { name: testType },
    unstructured,
    gherkin,
    jira: { fields: jiraFields },
    folderPath,
  });

  const test = result.createTest.test;
  const warnings = result.createTest.warnings;

  log.success(`Test created: ${test.jira.key}`);
  console.log(`  Summary: ${test.jira.summary}`);
  console.log(`  Type: ${test.testType.name}`);
  console.log(`  Issue ID: ${test.issueId}`);
  printBirthParent(birth);

  if (birth.parentKey && test.jira.key) {
    await ensureParentStuck(test.jira.key, birth.parentKey, test.jira.parent?.key ?? null);
  }

  if (warnings && warnings.length > 0) {
    log.warn('Warnings:');
    warnings.forEach((w: string) => console.log(`  - ${w}`));
  }

  // Surface the two-step requirement loudly so the operator never assumes the
  // steps they passed on `create` were persisted (they are not).
  if (stepsFlags.length > 0) {
    log.warn(`${stepsFlags.length} --step value(s) were NOT added — Xray Cloud does not persist steps on create.`);
    log.warn('Add each step explicitly, e.g.:');
    stepsFlags.forEach((s) => {
      const parts = s.split('|');
      const action = parts[0] ?? s;
      const hasData = parts.length >= 3;
      const data = hasData ? parts[1] : '';
      const expected = hasData ? parts[2] : (parts[1] ?? '');
      const dataFlag = data ? ` --data "${data}"` : '';
      const resultFlag = expected ? ` --result "${expected}"` : '';
      console.log(`  bun xray test add-step --test ${test.issueId} --action "${action}"${dataFlag}${resultFlag}`);
    });
  }
}

// ============================================================================
// GET
// ============================================================================

export async function get(flags: Flags, positional: string[]): Promise<void> {
  const key = positional[0] || getFlag(flags, 'key');
  if (!key) {
    throw new Error('Test key required. Usage: xray test get PROJ-123');
  }

  const result = await graphql<{ getTests: { results: TestResult[] } }>(QUERIES.getTest, {
    jql: `key = ${key}`,
  });

  if (!result.getTests.results || result.getTests.results.length === 0) {
    throw new Error(`Test not found: ${key}`);
  }

  const test = result.getTests.results[0];

  log.title(`Test: ${test.jira.key}`);
  console.log(`Summary: ${test.jira.summary}`);
  console.log(`Type: ${test.testType.name}`);
  const testStatus = typeof test.jira.status === 'object' && test.jira.status !== null ? test.jira.status.name : (test.jira.status || 'Unknown');
  console.log(`Status: ${testStatus}`);
  console.log(`Issue ID: ${test.issueId}`);

  if (test.jira.labels && test.jira.labels.length > 0) {
    console.log(`Labels: ${test.jira.labels.join(', ')}`);
  }

  if (test.steps && test.steps.length > 0) {
    console.log(`\nSteps (${test.steps.length}):`);
    test.steps.forEach((s: TestStepResponse, i: number) => {
      // The step id is printed because `test remove-step --step <id>` needs it and the
      // GraphQL query already returns it — without it here, rewriting a Manual test's steps
      // means dropping to a raw GraphQL call just to read ids the CLI already had.
      console.log(`  ${i + 1}. [${s.id}] ${s.action}`);
      if (s.data) {
        console.log(`     Data: ${s.data}`);
      }
      if (s.result) {
        console.log(`     Expected: ${s.result}`);
      }
    });
  }

  if (test.gherkin) {
    console.log('\nGherkin:');
    console.log(`  ${test.gherkin.split('\n').join('\n  ')}`);
  }

  if (test.unstructured) {
    console.log('\nDefinition:');
    console.log(`  ${test.unstructured}`);
  }

  if (test.preconditions?.results?.length) {
    console.log('\nPreconditions:');
    test.preconditions.results.forEach((p: PreconditionResult) => {
      console.log(`  - ${p.jira.key}: ${p.jira.summary}`);
    });
  }
}

// ============================================================================
// LIST
// ============================================================================

export async function list(flags: Flags): Promise<void> {
  const config = loadConfig();
  const project = getFlag(flags, 'project') || config?.default_project;
  const limit = Number.parseInt(getFlag(flags, 'limit', '20') || '20', 10);
  const jql = getFlag(flags, 'jql')
    || (project ? `project = ${project} AND issuetype = Test` : 'issuetype = Test');

  const result = await graphql<{ getTests: { total: number, results: TestResult[] } }>(QUERIES.getTests, { jql, limit });

  log.title(`Tests (${result.getTests.total} total, showing ${result.getTests.results.length})`);

  if (result.getTests.results.length === 0) {
    log.warn('No tests found');
    return;
  }

  result.getTests.results.forEach((t: TestResult) => {
    const rawStatus = t.jira.status;
    const status = typeof rawStatus === 'object' && rawStatus !== null ? rawStatus.name : (rawStatus || 'Unknown');
    console.log(`${t.jira.key}  [${t.testType.name}]  ${status}  ${t.jira.summary}`);
  });
}

// ============================================================================
// ADD STEP
// ============================================================================

export async function addStep(flags: Flags): Promise<void> {
  const issueId = requireFlag(flags, 'test');
  const action = requireFlag(flags, 'action');
  const data = getFlag(flags, 'data');
  const result = getFlag(flags, 'result');

  log.dim(`Adding step to test ${issueId}...`);

  const response = await graphql<{ addTestStep: TestStepResponse }>(MUTATIONS.addTestStep, {
    issueId,
    step: { action, data, result },
  });

  const step = response.addTestStep;
  log.success(`Step added (ID: ${step.id})`);
  console.log(`  Action: ${step.action}`);
  if (step.data) {
    console.log(`  Data: ${step.data}`);
  }
  if (step.result) {
    console.log(`  Expected: ${step.result}`);
  }
}

// ============================================================================
// REMOVE STEP
// ============================================================================

export async function removeStep(flags: Flags): Promise<void> {
  const issueId = requireFlag(flags, 'test');
  const stepId = requireFlag(flags, 'step');

  log.dim(`Removing step ${stepId} from test ${issueId}...`);

  await graphql<{ removeTestStep: boolean }>(MUTATIONS.deleteTestStep, {
    stepId,
  });

  log.success(`Step ${stepId} removed from test ${issueId}`);
}

// ============================================================================
// UPDATE STEP (rewrite a step IN PLACE, keeping its id)
// ============================================================================

/**
 * Rewrites one Manual step without changing its id.
 *
 * Why this exists instead of remove-step + add-step: a Test Run references the Test's step
 * ids directly (a run of a 5-step test lists those same 5 ids). Removing a step therefore
 * damages the historical record of every execution that already ran it — the run loses the
 * step it reported a status and a comment against. Updating in place keeps the id, so past
 * executions stay coherent while the wording gets corrected.
 *
 * Omitted flags are MERGED from the step's current values, read back before writing. Xray's
 * UpdateStepInput takes a whole step, so sending only --action would otherwise risk blanking
 * the data and expected-result fields; read-merge-write removes that footgun.
 */
export async function updateStep(flags: Flags): Promise<void> {
  const issueId = requireFlag(flags, 'test');
  const stepId = requireFlag(flags, 'step');
  const action = getFlag(flags, 'action');
  const data = getFlag(flags, 'data');
  const result = getFlag(flags, 'result');

  if (action === undefined && data === undefined && result === undefined) {
    throw new Error('Nothing to update: pass at least one of --action / --data / --result.');
  }

  // Read current values so omitted flags survive the write.
  const current = await graphql<{ getTests: { results: TestResult[] } }>(QUERIES.getTest, {
    jql: `issue in (${issueId})`,
  });
  const test = current.getTests.results?.[0];
  if (!test) {
    throw new Error(`Test not found: ${issueId}`);
  }
  const existing = (test.steps ?? []).find((s: TestStepResponse) => s.id === stepId);
  if (!existing) {
    const ids = (test.steps ?? []).map((s: TestStepResponse) => s.id).join(', ');
    throw new Error(`Step ${stepId} does not belong to test ${issueId}. Steps present: ${ids || '(none)'}`);
  }

  const step = {
    action: action ?? existing.action,
    data: data ?? existing.data ?? '',
    result: result ?? existing.result ?? '',
  };

  log.dim(`Updating step ${stepId} of test ${issueId}...`);

  const response = await graphql<{ updateTestStep: { warnings?: string[] } }>(MUTATIONS.updateTestStep, {
    stepId,
    step,
  });

  // The mutation returns only attachment deltas and warnings — never the new field values —
  // so the caller verifies with `test get` when it needs to see them.
  for (const w of response.updateTestStep?.warnings ?? []) {
    log.warn(w);
  }

  log.success(`Step ${stepId} updated (id preserved)`);
  console.log(`  Action: ${step.action}`);
  if (step.data) {
    console.log(`  Data: ${step.data}`);
  }
  if (step.result) {
    console.log(`  Expected: ${step.result}`);
  }
}

// ============================================================================
// UPDATE DEFINITION (enrich an EXISTING test — Gherkin / unstructured / type)
// ============================================================================

export async function updateGherkin(flags: Flags): Promise<void> {
  const issueId = requireFlag(flags, 'test');
  const gherkin = requireFlag(flags, 'gherkin');

  log.dim(`Updating Gherkin definition of test ${issueId}...`);

  const response = await graphql<{ updateGherkinTestDefinition: { issueId: string } }>(
    MUTATIONS.updateGherkinTestDefinition,
    { issueId, gherkin },
  );

  log.success(`Gherkin definition updated (issueId: ${response.updateGherkinTestDefinition.issueId})`);
}

export async function updateDefinition(flags: Flags): Promise<void> {
  const issueId = requireFlag(flags, 'test');
  const unstructured = requireFlag(flags, 'definition');

  log.dim(`Updating unstructured definition of test ${issueId}...`);

  const response = await graphql<{ updateUnstructuredTestDefinition: { issueId: string } }>(
    MUTATIONS.updateUnstructuredTestDefinition,
    { issueId, unstructured },
  );

  log.success(`Definition updated (issueId: ${response.updateUnstructuredTestDefinition.issueId})`);
}

export async function updateType(flags: Flags): Promise<void> {
  const issueId = requireFlag(flags, 'test');
  const typeName = requireFlag(flags, 'type');

  log.dim(`Updating test type of ${issueId} to ${typeName}...`);

  const response = await graphql<{ updateTestType: { issueId: string, testType: { name: string } } }>(
    MUTATIONS.updateTestType,
    { issueId, testType: { name: typeName } },
  );

  log.success(`Test type updated to ${response.updateTestType.testType.name} (issueId: ${response.updateTestType.issueId})`);
}
