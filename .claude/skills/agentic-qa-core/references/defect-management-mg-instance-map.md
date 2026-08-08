# Defect-Management — MG instance map (MAGIIS Jira Cloud)

> **This file changes NO doctrine.** `defect-management-doctrine.md` stays the
> canonical, portable authority. This file records what the **MG** instance
> (`https://magiis.atlassian.net`, project key `MG`) *actually exposes*, and what
> each doctrine assumption resolves to there. Read it **together with** the
> doctrine before filing anything in MG — several doctrine primitives (the
> `Defect` / `Improvement` issue types, `components`, the Defect process epic) do
> not exist in this instance, and discovering that mid-run costs a full pass.

**Provenance.** Every row below was verified live against MG via Jira REST v3 on
**2026-07-28** (`/field/search`, `/issue/createmeta/MG/issuetypes`,
`/issue/createmeta/MG/issuetypes/10004`, `/project/MG/components`, JQL on the QA
epics). Re-verify with the same calls before trusting this file after an
instance-configuration change.

---

## Part 0 — The governing constraint (read this first)

> **In MG, QA manages ONLY Xray entities.** On general issues (`Historia`,
> `Error`, `Epic`, `Tarea`) QA is **forbidden to create, edit, transition, delete
> or link** — **read and comment only**.

This is a **self-governance rule agreed with the user** (confirmed 2026-07-17,
re-confirmed 2026-07-28), *not* a permission boundary: the authenticated
technical account **does** hold write scope, so nothing in the API will stop a
violation. The AI must stop itself.

> **2026-08-06 — this rule was violated in production.** A release close-out
> transitioned **7 tickets belonging to three other engineers** into the terminal
> status `Finalizada` (10001) and set their `resolution`. Write-up:
> `.context/reports/prod-cutover-jira-incident-postmortem.md`. Canonical rules:
> `CLAUDE.md` #16 and #17. Parts 0.1 and 0.2 below are the hardening.

### Part 0.1 — Ownership gate on ANY issue mutation (binding, on top of Part 0)

1. **Scope by membership, never by status or board column.** The set of a bulk
   operation = campaign membership (label / Test Plan / issue-link) + issue type.
   "Everything sitting in column X" is not a scope — it is an accident.
2. **Ownership gate (hard stop).** Before any mutation, list
   `key · type · assignee · current status`. Any assignee other than the
   authenticated user → **STOP**, name the person and their tickets, ask. A
   generic "close them all" does **not** authorize third-party tickets — only
   what was previewed *with owners visible* is authorized.
3. **Previews must show the assignee.** A preview without the owner column is
   invalid consent: the user cannot approve what they cannot see.
4. **Irreversibility check.** `GET /issue/{key}/transitions` on an issue already
   in the target status. Empty list = terminal = one-way door → say so and
   confirm first. In MG, `Finalizada` (10001) **is terminal**: only a Jira admin
   can undo it.
5. **Declare side effects.** The `En Producción - Verificación` transition also
   writes `resolution` + `resolutiondate` and notifies watchers.
6. **No silent scope growth.** Any widening beyond the approved set re-triggers
   the full preview and a new approval.

### Part 0.2 — ⚠ MG JQL is unreliable: duplicate status and issue-type names

MG has **two statuses sharing one display name**, and issue-type names collide too:

| id | name | category |
|---|---|---|
| **10001** | Finalizada | Listo (**terminal**) |
| **10102** | Finalizada | En curso |
| 10024 | LISTO PARA RELEASE | En curso |
| 10231 | Listo para Produccion | Listo |

Measured failures (2026-08-06): `status = "Tareas por hacer"` → **0** rows with 65
real; `issuetype in (Historia, Tarea, …)` → **4** rows with 68 real;
`status CHANGED TO "Finalizada"` → 0, because the changelog stores the target as
`Done`; `approximate-count` inherits the same defect.

**Never filter or verify by status / issue-type NAME in MG.** Fetch with a broad
JQL (`project = MG`) and filter client-side on `fields.status.id` /
`fields.issuetype.id`, or query by numeric ID. Reliable per-issue checks:
`GET /rest/api/3/issue/{KEY}?fields=status` and, for authorship and history,
`GET /rest/api/3/issue/{KEY}/changelog`.

Consequence that reshapes the whole doctrine in MG: **filing a new `Error` is not
the default output of a QA finding.** The default is a **structured comment on
the relevant Xray entities** (Part 7). Everything else in this file follows from
that.

---

## Part 1 — Mapping table (doctrine ↔ MG)

| Doctrine assumption | MG reality |
|---|---|
| Issue types `Defect` / `Improvement` exist (Part 1) | **They do not.** Available types: `Epic` (10000), `Historia` (10001), `Tarea` (10002), `Subtarea` (10003), `Error` (10004), plus the Xray types `Xray Test` (10144), `Test Set` (10145), `Test Plan` (10146), `Test Execution` (10147), `Precondition` (10148), `Sub Test Execution` (10149). A pre-release defect goes as **`Error`** carrying the *Defect (pre-release)* classification **explicitly in the body**. |
| `components` = affected product module, mandatory (Part 3) | **`components` is empty in MG** (`/project/MG/components` → 0) and is **not even on the `Error` create screen.** The real product-module axis is **`SubProject` (`customfield_10146`)**, and it is **required on create**. |
| Parent to the QA process epic **"QA Defect Management"** (Part 4) | **That epic does not exist**, and per Part 0 it **must not be created.** The three that do exist: **QA Master Test Plan = MG-134**, **QA Test Repository = MG-135**, **QA Test Artifacts = MG-509**. |
| Mandatory field matrix — severity, actual/expected result, error_type, test_environment, qa_assignee, evidence (Part 5) | **None of them are on the `Error` create screen.** Required there: `project`, `issuetype`, `summary`, `reporter`, `SubProject`. Setting the rest needs a **REST `PUT` after create** (Part 6 mechanics) or the structured-comment fallback. |

### Part 1.1 — `Error` create screen, as actually configured

Required (`required: true`): `project` · `issuetype` · `summary` · `reporter` ·
`SubProject` (`customfield_10146`).

Available but optional: `description` · `priority` · `parent` · `issuelinks` ·
`labels` · `assignee` · `attachment` · `Sprint` (`customfield_10010`) ·
`Story Points` (`customfield_10014`) · `Story Points QA` (`customfield_10353`) ·
`Scripts` (`customfield_10218`) · `Team` (`customfield_10001`) ·
`Fecha de inicio` (`customfield_10025`) · `duedate` · `fixVersions`.

**Absent from the screen entirely**: `components`, and every doctrine Part-5
custom field (`severity`, `actual_result`, `expected_result`, `root_cause`,
`error_type`, `test_environment`, `qa_assignee`, `evidence`, `workaround`,
`fix`). Treat the doctrine's Part-5 matrix in MG as *body content*, not as
create-time fields.

### Part 1.2 — `SubProject` options (the `components` substitute)

| Value | id | | Value | id |
|---|---|---|---|---|
| Carrier | 10121 | | API Public | 10130 |
| CarrierV2 | 10216 | | BE AI | 10131 |
| App Pax | 10122 | | Python Services | 10149 |
| App Driver | 10123 | | DRL | 10183 |
| BE MAGIIS | 10124 | | Driver Allocation | 10184 |
| Contractor | 10125 | | messagingservice | 10249 |
| Admin | 10126 | | emailrecognition | 10282 |
| Owner | 10127 | | multichannel | 10315 |
| **Gateway Pagos** | **10128** | | | |
| Message Center | 10129 | | | |

The doctrine's Part-3 reasoning still holds — one value = one product module, set
the module the issue *affects* — it just reads `SubProject` instead of
`components`. The three-axis model (Part 4) survives with the middle axis
renamed:

```
parent      -> QA process epic   (in MG: only MG-134 / MG-135 / MG-509 exist)
issue link  -> source Story      (traceability; unchanged)
SubProject  -> product module    (replaces `components` in MG)
```

---

## Part 7 — Default reporting channel in MG: structured comment on Xray entities

Because of Part 0, a QA finding in MG is reported as a **structured comment**, on
**both**:

1. **The Xray `Test` that covers the finding** — the TC whose execution surfaced
   it. This is where the detail lives: repro steps, actual vs expected, evidence,
   severity, environment, and the explicit Bug/Defect classification the missing
   issue type can no longer carry.
2. **The `Test Plan` of the campaign** — so the finding is visible at
   campaign/release level and feeds the GO / NO-GO reading without anyone having
   to open individual Tests.

Both targets are Xray entities, so commenting on them is fully inside the Part-0
boundary. The comment body should carry the doctrine's Part-5 matrix as
labelled sections (`## Severity`, `## Actual result`, `## Expected result`,
`## Test environment`, `## Evidence`, `## Classification`) — the same
structured-comment fallback shape `.agents/jira-required.yaml` defines for
missing fields, applied here to a missing *issue type*.

**Do NOT** additionally comment on the source `Historia` unless the user asks:
commenting on a general issue is permitted by Part 0, but the Xray pair is the
channel of record, and duplicating the report fragments it.

### Part 7.1 — Precedent (a well-formed report on this channel)

The **Discover** finding of 2026-07-28 is the reference example: *MAGIIS blocks
the Discover brand on card enrolment even though Authorize.net approves it* —
confirmed by two independent routes.

| Target | Entity | Comment |
|---|---|---|
| `MG-527` | `Xray Test` — TC23, Discover UI (the Test that covers it) | `#34511` |
| `MG-178` | `Test Plan` — ATP · Release Pasarelas de Pago (Gateway) — 4 PSP (the campaign) | `#34512` |

**No `Error` ticket was created** — an explicit user decision to honour Part 0,
not an omission. Read those two comments before authoring a new report on this
channel; they set the expected depth and shape.

---

## Part 8 — Creating an `Error` (exception path, per-case authorization)

Creating an `Error` in MG is an **exception**, never the default, and requires
**explicit user authorization for that specific case**. A general "report the
bugs you find" instruction is **not** authorization — Part 0 overrides it. Ask,
name the finding, and wait for a clear yes.

Once authorized, the minimum viable create payload is:

```
project      = MG
issuetype    = Error            (id 10004 — there is no Defect/Improvement type)
summary      = <SubProject>: <what failed>
reporter     = <authenticated account>
SubProject   = customfield_10146 -> { "id": "<see Part 1.2>" }   # REQUIRED
```

Then, post-create:

- **`description`** carries the full doctrine Part-5 matrix (classification,
  actual/expected, severity, error type, environment, evidence) — those fields do
  not exist to be set.
- **`parent`**: leave unset. The doctrine's Defect epic does not exist in MG and
  Part 0 forbids creating it. **Do not invent a key, and do not repurpose
  MG-134 / MG-135 / MG-509** — they hold Test Plans, Tests, and Test
  Executions/Preconditions/Test Sets respectively, not quality issues.
- **`priority`** is settable at create; derive it from severity per doctrine
  Part 5.1 even though `severity` itself has no field.
- Any further custom field would need REST `PUT /rest/api/3/issue/{KEY}` — but
  note that per Part 0 **editing a general issue is itself outside QA's lane**,
  so fold the content into the create-time `description` instead of planning a
  follow-up `PUT`.

---

## Part 9 — Filing gate, MG variant

Replaces the doctrine's Part-9 checklist while working in MG.

```
[ ] SCOPE  Am I about to touch a general issue (Historia/Error/Epic/Tarea)?
           -> read/comment only. Create/edit/transition/link needs explicit,
              per-case user authorization. (Part 0)
[ ] TYPE   Classified Bug vs Defect vs Improvement by FEATURE lifecycle, and
           written that classification into the BODY (no issue type carries it)?
[ ] CHAN   Reported as a structured comment on BOTH the covering Xray Test AND
           the campaign Test Plan? (Part 7)
[ ] MOD    Product module named via SubProject (customfield_10146), not
           components? (Part 1.2)
[ ] FIELD  Severity + derived Priority + Error Type + Environment +
           Actual/Expected + Evidence present as comment SECTIONS? (Part 1.1)
[ ] EPIC   Did NOT invent a "QA Defect Management" key and did NOT reparent to
           MG-134/135/509? (Part 8)
```

---

## Part 10 — Known catalog drift (fix before it bites)

`.agents/jira-fields.json` maps `customfield_10146` to a slug **`test_analysis`**
named `"🔬 Test Analysis"`. That is **wrong**: live, `customfield_10146` is
**`SubProject `** (note the trailing space in its name), and **no field named
"Test Analysis" exists in the instance at all** (`/field/search?query=Test
Analysis` → 0 results).

Nothing else in the repo references the `test_analysis` slug, so the entry is
inert — but it means **the required-on-create `SubProject` field is missing from
the catalog under any usable slug**, which is exactly how a session ends up
building an invalid `Error` payload.

`jira-fields.json` is **generated** by `scripts/sync-jira-fields.ts` — do not
hand-edit it. Refresh with:

```bash
bun run jira:sync-fields
```

Verify afterwards that the catalog gained a `SubProject` entry on
`customfield_10146` and dropped `test_analysis`.

---

## Part 11 — Anti-patterns specific to MG

```
[x] Filing an `Error` because "the doctrine says file a Defect"  -> Part 0: comment on Xray entities
[x] Looking for / creating a `Defect` or `Improvement` type        -> they do not exist (Part 1)
[x] Setting `components` on an MG issue                            -> empty + not on screen; use SubProject
[x] Creating a "QA Defect Management" epic to satisfy Part 4       -> forbidden by Part 0; leave parent unset
[x] Guessing a key for the missing Defect epic                     -> only MG-134/135/509 exist
[x] Transitioning or editing a Historia/Error as part of a QA run  -> read/comment only
[x] Treating "report the bugs you find" as create authorization    -> per-case explicit yes required
```
