# Segment Prompt Template — parallel manual-execution sessions

> Use this template to author the prompt for each parallel Claude session in a split execution
> campaign (cases already exist in Xray; the session executes with `playwright-cli` and reports
> with `xray-cli`). Formalized from the MG-19 Round-1 segment prompts (2026-08-24) plus the
> lessons in [`execution-token-efficiency.md`](./execution-token-efficiency.md).
>
> The instantiated prompt is written in the USER'S language (these are conversation
> instructions, not repo artifacts). Placeholders use `{{...}}`.
>
> **The one rule that pays for everything else:** every case row MUST carry its ENTRY
> CONDITION. This applies to **every conditional action of the website** — any button, tab, or
> flow that renders/enables only under state (a quote button gated by fare, a submit disabled
> by time slot, a flight control gated by airport match, a screen reachable only through one
> navigation path). A case whose entry condition is unknown does NOT go into an execution
> segment — it goes to an exploration session first. Measured cost of violating this: one
> unspecified case ≈ 5× the tokens of a specified one, plus a retracted false FAILED.

---

## 1. Segment identity

```
# Segmento {{segmento}} — {{n}} casos de {{tema}} de {{story}} (ATR {{exec_key}})

Sos una sesión paralela de QA. Hay otras {{N-1}} sesiones trabajando en el MISMO repo y la MISMA
máquina. Ejecutá SOLO estos {{n}} casos y registrá resultados en Xray.
**No comentes en {{story}}, {{plan_key}} ni {{exec_key}}** — la sesión principal consolida.
(Adjuntar evidencia a los tickets de Test sí corresponde.) Conversá en {{idioma}}.

**Repo — cwd para TODO comando `bun xray`:** {{ruta_repo}}
```

## 2. Minimal context

- Story, plan, execution keys; environment name + URL; carrier/tenant + timezone.
- **Expected build + the exact command to read it** (e.g. from the FOOTER, never a regex over
  `body.innerText`), and the stop rule: wrong build → report and STOP.
- Side-effect disclosure: do these cases create real data? What must be left in place, what
  must be listed in the final summary.

## 3. Case table — one row per case, ALL columns mandatory

| # | TC | Test | runId | stepIds | Valida | **CONDICIÓN DE ENTRADA** |
|---|----|------|-------|---------|--------|--------------------------|

- `stepIds` inline saves one `run get` per case.
- `CONDICIÓN DE ENTRADA` states how to make the case's target state reachable *as a user
  would* — which toggle, which time slot, which navigation path, which data shape. "N/A
  (siempre visible)" is an acceptable value; an empty cell is not.
- Cite the Xray Precondition key when one exists (e.g. TM-761 for the Cotizar button).

## 4. Order dependencies

Declare chains explicitly (e.g. "TC-A leaves you on the assignment screen, which is the ONLY
known route to TC-B; if TC-A fails, mark TC-B `TODO` with reason X and continue with TC-C").

## 5. Gates — pre-resolved

Any human authorization (actions that notify real users, irreversible dispatches) is resolved
IN THIS PROMPT ("autorizado por {{owner}} el {{fecha}}") or at plan approval — never mid-run.
If unresolved, the case ships as `TODO` + reason.

## 6. Data recipe + reusable scripts

- Exact, verified-on-this-build data: client, passenger/authorizer, addresses (and which
  prediction to pick), payment, vehicle/fare expectation.
- Point to the form-fill script: `npx playwright cli -s={{sesion}} run-code
  --filename=scripts/{{alta-script}}.js` — edit its CONFIG block per case instead of re-typing
  the form (≈10 calls → 1). The script stops BEFORE the irreversible action; the session makes
  that click.

## 7. Browser

- Open command with the session's own profile (`-s={{sesion}} open --profile
  .playwright/user-data-{{sesion}} {{url}}`) — `-s=` alone does NOT isolate the profile.
- If a login screen appears: never type credentials; ask the user to log in manually.
- Current gotcha list (refs renumber, getByRole over refs, fill vs click+type, network log
  clears on navigation, screenshot needs absolute --filename).

## 8. Xray registration protocol

1. Read before writing (`run get`) — `run status`/`run comment` REPLACE.
2. Steps first, run status second (run status propagates down).
3. Enum `TODO` (no space); `BLOCKED`/`ABORTED` rejected by the instance → blocked = `TODO` +
   reason in comment.
4. Comment always via `--comment-file` (multiline `--comment` aborts on Windows); include:
   build read from footer, environment, data used, created artifact codes, step-by-step
   observations, and — on FAILED — what would refute the finding.
5. Evidence at both levels (run + decisive step) AND the decisive capture attached to the Test
   ticket **on every PASS too** (owner policy).
6. Captures under `{{evidence_dir}}`, prefix `{{Rx}}-`, short names (Windows 260-char limit).

## 9. Budget & exit rules

- Budget ≈ 20k tokens per mechanical case. A case exceeding ~2× budget without a verdict →
  STOP probing, mark `TODO` + what was tried, move on. Exploration is the owner's decision.
- Verify by extraction (`--raw eval` returning small JSON; find rows by artifact code, never by
  tab totals). Read a screenshot back at most once per case, only to adjudicate pixels.
- One batched Bash call per case for the whole Xray registration.

## 10. Hard rules (copy verbatim, adjust keys)

- A state not reachable with mouse and keyboard is NOT a manual-QA finding.
- On network failure read the status first: 4xx is your request, 5xx is the server.
- Don't touch shared carrier/tenant config; don't create/transition/edit tracker issues;
  don't cancel or modify other people's data.
- Final summary: table TC → verdict → evidence, codes of created artifacts, what was left
  unexecuted and why.

---

## ACT checklist (after the segment — closes the PDCA loop)

- [ ] Entry conditions discovered during the run → pushed into the Xray test
      (Precondition issue + `test update-step` on the affected step, id preserved).
- [ ] New gotchas (selectors, timing, environment) → saved to memory once, with selectors.
- [ ] Recipe changes → folded back into the alta script's CONFIG/steps.
- [ ] New measured lever → added to `execution-token-efficiency.md`.
