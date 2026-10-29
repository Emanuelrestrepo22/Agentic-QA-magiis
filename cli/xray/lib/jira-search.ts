/**
 * Xray CLI - Jira Search & Mutation Module (Fase 3, hierarchy repair)
 *
 * Broad-JQL search with correct pagination, plus the handful of Jira-layer
 * primitives `hierarchy` needs to read and repair the `parent` (Epic Link)
 * field. Deliberately separate from `jira.ts` (issue-link / key-resolution
 * helpers) and `rest.ts` (Xray REST, not Jira REST).
 */

import { loadConfig } from './config.js';

interface JiraCreds {
  baseUrl: string
  email: string
  token: string
}

function getCreds(): JiraCreds {
  const config = loadConfig();
  const baseUrl = config?.jira_base_url || process.env.ATLASSIAN_URL;
  const email = config?.jira_email || process.env.ATLASSIAN_EMAIL;
  const token = config?.jira_api_token || process.env.ATLASSIAN_API_TOKEN;
  if (!baseUrl || !email || !token) {
    throw new Error(
      'Jira credentials not configured. Set ATLASSIAN_URL / ATLASSIAN_EMAIL / ATLASSIAN_API_TOKEN '
      + 'or run \'bun xray auth login --jira-url <url> --jira-email <email> --jira-token <token>\'.',
    );
  }
  return { baseUrl: baseUrl.replace(/\/$/, ''), email, token };
}

/**
 * Raw fetch against `/rest/api/3` with Basic auth and 429 backoff honoring
 * `Retry-After`. A `429` is retried (does not count as a caller-visible
 * failure); any other non-OK status throws.
 */
export async function jiraRequest<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { baseUrl, email, token } = getCreds();
  const auth = Buffer.from(`${email}:${token}`).toString('base64');

  for (;;) {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('Retry-After') ?? '2');
      await new Promise(resolve => setTimeout(resolve, Math.max(1, retryAfter) * 1000));
      continue;
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Jira ${init.method ?? 'GET'} ${path} -> ${response.status}: ${text.slice(0, 500)}`);
    }

    if (response.status === 204) { return undefined as T; }
    const text = await response.text();
    if (!text) { return undefined as T; }
    return JSON.parse(text) as T;
  }
}

export interface JiraSearchIssue {
  id: string
  key: string
  fields: Record<string, unknown>
}

interface JiraSearchResponse {
  issues: JiraSearchIssue[]
  isLast?: boolean
  nextPageToken?: string
}

/**
 * Broad-JQL search with CORRECT pagination (`nextPageToken`, not `startAt` —
 * `startAt` is silently ignored by `/rest/api/3/search/jql` and returns page 1
 * forever; see `scripts/xray-release-gate.ts` for the landmine this fixes).
 *
 * Per CLAUDE.md rule #17 (MG name-collision landmine): callers MUST filter
 * client-side on `fields.issuetype.id` / `fields.status.id` (numeric), never
 * pass `issuetype = "Name"` / `status = "Name"` inside `jql`.
 */
export async function searchAll(
  jql: string,
  fields: string[],
  maxResults = 100,
): Promise<JiraSearchIssue[]> {
  const all: JiraSearchIssue[] = [];
  let nextPageToken: string | undefined;

  for (;;) {
    const body: Record<string, unknown> = nextPageToken
      ? { jql, fields, maxResults, nextPageToken }
      : { jql, fields, maxResults };

    const page = await jiraRequest<JiraSearchResponse>('/rest/api/3/search/jql', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    all.push(...page.issues);

    if (page.isLast || !page.nextPageToken) { break; }
    nextPageToken = page.nextPageToken;
  }

  return all;
}

export interface Myself {
  accountId: string
  displayName: string
}

/** `GET /myself` — the authenticated user. Never hardcode this; resolve it live. */
export async function getMyself(): Promise<Myself> {
  return jiraRequest<Myself>('/rest/api/3/myself');
}

export interface EditMeta {
  fields: Record<string, unknown>
}

/** `GET /issue/{key}/editmeta` — used to confirm `parent` is writable before attempting it. */
export async function getEditMeta(key: string): Promise<EditMeta> {
  return jiraRequest<EditMeta>(`/rest/api/3/issue/${key}/editmeta`);
}

/**
 * Set (or clear, with `parentKey = null`) an issue's `parent` field.
 *
 * Tries the plain `fields.parent` shape first; on a 400 (some instances
 * require the `update.parent` operation shape instead) falls back to that
 * form once. If NEITHER works when clearing (`parentKey === null`), throws —
 * per the remediation plan, that is a hard stop: the rollback path is not
 * mechanical and must not be treated as if it were.
 */
export async function setParent(key: string, parentKey: string | null): Promise<void> {
  const primaryBody = parentKey === null
    ? { fields: { parent: null } }
    : { fields: { parent: { key: parentKey } } };

  try {
    await jiraRequest(`/rest/api/3/issue/${key}`, {
      method: 'PUT',
      body: JSON.stringify(primaryBody),
    });
    return;
  }
  catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes('-> 400')) { throw err; }
  }

  const fallbackBody = parentKey === null
    ? { update: { parent: [{ set: null }] } }
    : { update: { parent: [{ set: { key: parentKey } }] } };

  await jiraRequest(`/rest/api/3/issue/${key}`, {
    method: 'PUT',
    body: JSON.stringify(fallbackBody),
  });
}

/** Minimal shape of a single issue, read for snapshot/verify purposes. */
export interface IssueSnapshot {
  key: string
  id: string
  issuetypeId: string
  issuetypeName: string
  statusId: string
  statusName: string
  assigneeAccountId: string | null
  assigneeDisplayName: string | null
  labels: string[]
  parentKey: string | null
  summary: string
  issuelinksCount: number
  updated: string
  resolution: string | null
  resolutiondate: string | null
}

const SNAPSHOT_FIELDS = [
  'issuetype',
  'status',
  'assignee',
  'labels',
  'parent',
  'summary',
  'issuelinks',
  'updated',
  'resolution',
  'resolutiondate',
];

interface RawIssueFields {
  issuetype?: { id?: string, name?: string }
  status?: { id?: string, name?: string }
  assignee?: { accountId?: string, displayName?: string } | null
  labels?: unknown
  parent?: { key?: string } | null
  summary?: string
  issuelinks?: unknown[]
  updated?: string
  resolution?: { name?: string } | null
  resolutiondate?: string | null
}

export function toSnapshot(issue: JiraSearchIssue): IssueSnapshot {
  const f = issue.fields as RawIssueFields;
  return {
    key: issue.key,
    id: issue.id,
    issuetypeId: f.issuetype?.id ?? '',
    issuetypeName: f.issuetype?.name ?? '',
    statusId: f.status?.id ?? '',
    statusName: f.status?.name ?? '',
    assigneeAccountId: f.assignee?.accountId ?? null,
    assigneeDisplayName: f.assignee?.displayName ?? null,
    labels: Array.isArray(f.labels) ? f.labels as string[] : [],
    parentKey: f.parent?.key ?? null,
    summary: f.summary ?? '',
    issuelinksCount: Array.isArray(f.issuelinks) ? f.issuelinks.length : 0,
    updated: f.updated ?? '',
    resolution: f.resolution?.name ?? null,
    resolutiondate: f.resolutiondate ?? null,
  };
}

/** Fetch every issue in `project`, snapshot-shaped, via broad JQL + the standard field set. */
export async function snapshotProject(project: string): Promise<IssueSnapshot[]> {
  const issues = await searchAll(`project = ${project}`, SNAPSHOT_FIELDS);
  return issues.map(toSnapshot);
}

/** Re-fetch a specific set of keys, snapshot-shaped (used by `verify` and rollback rehearsal). */
export async function snapshotKeys(keys: string[]): Promise<IssueSnapshot[]> {
  if (keys.length === 0) { return []; }
  const out: IssueSnapshot[] = [];
  for (let i = 0; i < keys.length; i += 50) {
    const batch = keys.slice(i, i + 50);
    const issues = await searchAll(`key in (${batch.join(',')})`, SNAPSHOT_FIELDS);
    out.push(...issues.map(toSnapshot));
  }
  return out;
}
