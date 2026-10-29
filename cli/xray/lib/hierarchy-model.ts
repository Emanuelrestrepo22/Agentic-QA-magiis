/**
 * Xray CLI - Hierarchy Destination Model (Fase 3, Epic Link repair)
 *
 * The destination epic for a Xray entity is a PURE FUNCTION of its
 * `issuetype.id` — never of campaign, label, or which script created it.
 * This module is the ONLY place that mapping is allowed to live; every
 * consumer (`hierarchy audit/plan/apply`, and later "3-axis at birth" on
 * create) resolves through here, so there is exactly one table to keep
 * correct instead of N copies drifting apart.
 *
 * Fail-closed by design: an issuetype.id this table does not recognize
 * resolves to `null`, and callers MUST treat `null` as "abort this issue",
 * never as "pick a default epic".
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const PROJECT_YAML_PATH = resolve(ROOT, '.agents/project.yaml');

// Xray/Jira issuetype ids on the MAGIIS instance (verified live 2026-08-12 —
// see .agents/xray-key-migration.json / defect-management-mg-instance-map.md).
// Numeric ids ONLY — CLAUDE.md rule #17 (MG name-collision landmine) forbids
// resolving these by issuetype NAME anywhere in this repo.
export const ISSUETYPE = {
  epic: '10000',
  historia: '10001',
  tarea: '10002',
  subtarea: '10003',
  error: '10004',
  xrayTest: '10144',
  testSet: '10145',
  testPlan: '10146',
  testExecution: '10147',
  precondition: '10148',
  subTestExecution: '10149',
} as const;

export type QaEpicSlot = 'master_test_plan_epic' | 'test_repository_epic' | 'test_artifacts_epic' | 'defect_epic';

export interface QaEpics {
  master_test_plan_epic: string | null
  test_repository_epic: string | null
  test_artifacts_epic: string | null
  defect_epic: string | null
}

/**
 * Reads `qa.qa_epics.*.key` from `.agents/project.yaml`. Throws if the file
 * or the block is missing — a hierarchy operation with no epic table to read
 * has nothing safe to do.
 */
export function loadQaEpics(): QaEpics {
  if (!existsSync(PROJECT_YAML_PATH)) {
    throw new Error(`Missing ${PROJECT_YAML_PATH} -- cannot resolve QA-process epic keys.`);
  }
  const parsed = parseYaml(readFileSync(PROJECT_YAML_PATH, 'utf8')) as Record<string, unknown>;
  const qa = parsed?.qa as Record<string, unknown> | undefined;
  const epics = qa?.qa_epics as Record<string, unknown> | undefined;
  if (!epics) {
    throw new Error('Missing qa.qa_epics block in .agents/project.yaml -- cannot resolve QA-process epic keys.');
  }
  const keyOf = (slot: QaEpicSlot): string | null => {
    const entry = epics[slot] as Record<string, unknown> | undefined;
    const key = entry?.key;
    return typeof key === 'string' && key.trim() !== '' ? key.trim() : null;
  };
  return {
    master_test_plan_epic: keyOf('master_test_plan_epic'),
    test_repository_epic: keyOf('test_repository_epic'),
    test_artifacts_epic: keyOf('test_artifacts_epic'),
    defect_epic: keyOf('defect_epic'),
  };
}

/** The 5 Xray entity issuetype ids this repair operates on. Epics are the destinations, never the scope. */
export const REPAIRABLE_ISSUETYPE_IDS: readonly string[] = [
  ISSUETYPE.xrayTest,
  ISSUETYPE.testSet,
  ISSUETYPE.testPlan,
  ISSUETYPE.testExecution,
  ISSUETYPE.precondition,
];

/** issuetype ids that must NEVER be auto-parented by this tool — mg-scope-xray-only. */
export const PROHIBITED_ISSUETYPE_IDS: readonly string[] = [
  ISSUETYPE.error, // Bug/Defect/Improvement in this instance's scheme
];

/**
 * Which QA-epic slot a given issuetype belongs under. THE table — everything
 * else here delegates to it, so the mapping exists exactly once.
 *
 * Returns `null` (fail-closed) for: Epics themselves, product issue types
 * (Historia/Tarea/Subtarea), the prohibited `Error` type, or any unknown id.
 */
export function resolveDestinationSlot(issuetypeId: string): QaEpicSlot | null {
  switch (issuetypeId) {
    case ISSUETYPE.testPlan:
      return 'master_test_plan_epic';
    case ISSUETYPE.xrayTest:
      return 'test_repository_epic';
    case ISSUETYPE.testExecution:
    case ISSUETYPE.precondition:
    case ISSUETYPE.testSet:
      return 'test_artifacts_epic';
    default:
      return null;
  }
}

/**
 * Resolve the destination epic KEY for a given issuetype.id. `null` means
 * either "no slot for this type" or "the slot is empty in project.yaml" —
 * callers that need to tell those apart ask `resolveDestinationSlot` too.
 */
export function resolveDestination(issuetypeId: string, epics: QaEpics): string | null {
  const slot = resolveDestinationSlot(issuetypeId);
  return slot === null ? null : epics[slot];
}

export function isProhibitedIssuetype(issuetypeId: string): boolean {
  return PROHIBITED_ISSUETYPE_IDS.includes(issuetypeId);
}
