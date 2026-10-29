# Execution-Stage Token Efficiency — standing rules (PDCA)

> Scope: the **execution stage** only — test cases already exist in Xray, the session's job is
> to drive `playwright-cli` and report with `xray-cli`. Analysis, test design, and triage are NOT
> covered here and may justify richer context.
>
> Origin: measured on the MG-19 Round-1 parallel campaign (2026-08-24, 3 concurrent sessions).
> Measured costs, not estimates:
> - **Fixed session overhead ≈ 120k tokens** (system prompt + CLAUDE.md + memory + MCP roster +
>   plan mode) — paid once per session, so N parallel sessions pay N×.
> - **A well-scripted mechanical case ≈ 7–20k tokens** (execute + register + evidence).
> - **An exploratory case ≈ 100k tokens** (TC38: unknown entry condition for the Cotizar button
>   → 2 wrong hypotheses, ~15 probing calls, 5 image reads, a retracted FAILED). One
>   under-specified case cost as much as five specified ones.

The single biggest lever is not output compression — it is **removing exploration from the
execution stage** by front-loading determinism into the prompt and the test case itself.

---

## PLAN — before the session starts

1. **Segment prompt must be a recipe, not a goal.** Inline: runIds AND stepIds, exact data
   (client, addresses, vehicle, date/time), expected build, evidence naming, and — critically —
   **the entry condition of every screen/control the case touches** (e.g. "Cotizar only renders
   when the simulated fare for the time slot is degenerate — use 00:00"). This applies to
   EVERY conditional action of the website — any button/tab/flow gated by state — not just the
   one that already bit us. If an entry condition is unknown, that case belongs to an
   exploration session, not an execution segment. Template:
   [`segment-prompt-template.md`](./segment-prompt-template.md).
2. **Resolve gates upfront.** Any human authorization (auto-dispatch, notifications to real
   drivers) is asked ONCE at plan approval, never mid-run (each mid-run AskUserQuestion stalls
   the session and re-sends context).
3. **Right-size the model.** Mechanical execution does not need the top-tier model. Run
   execution segments on a cheaper tier (`/model sonnet`); reserve the expensive tier for
   design, triage, and defect adjudication. Weekly usage is weighted by model cost — this is a
   direct multiplier on the 27%.
4. **Trim the MCP roster.** Execution needs NOTHING beyond the shell (`playwright-cli`,
   `bun xray`, `curl`) and optionally engram. Every connected MCP re-announces its tool list on
   each reconnect (measured: 2–5k tokens per announcement, several per session). Keep a minimal
   `.mcp.json` profile for execution sessions; leave postman/notion/gmail/etc. for sessions that
   use them.
5. **Parallelize for wall-clock, not for tokens.** Each parallel session pays the ~120k fixed
   overhead. 3 sessions ≈ 360k before the first click. Split segments only when the deadline
   requires it; otherwise run sequentially in one session.

## DO — during execution

6. **Script repeated flows; never re-type them.** The same form filled N times = write ONE
   `playwright-cli run-code --filename=<script>.js` (or a committed helper) and call it per
   case. Measured: one manual "Nuevo Viaje" fill ≈ 8–10 tool calls with a snapshot each; a
   script is 1 call. This is the second-biggest lever.
7. **Never take a full snapshot when a targeted read answers the question.** Use
   `--raw eval` returning a small JSON (`{fecha, hora, btns}`) or `--raw snapshot | grep/sed`.
   Full page snapshots of the carrier dashboard run 300+ lines.
8. **Screenshot ≠ read-back.** `screenshot --filename=<abs>` then verify existence with `ls`.
   Reading the PNG back into context (~1.5k tokens each) is reserved for ONE adjudication per
   case at most — when the verdict genuinely depends on seeing pixels (or when the user asks).
9. **Batch shell work.** One Bash call chains: all step-status updates + run status + comment +
   evidence uploads for a case. One call per case for registration, not seven.
10. **Comments via heredoc file, written once.** `cat > file <<'EOF'` then
    `run comment --comment-file`. Never iterate on comment wording in-context; draft it right
    the first time from the observed facts.
11. **Time-box divergence.** If a case exceeds ~2× the 20k mechanical budget without a verdict,
    STOP probing. Report the blocker with what was tried, mark the run `TODO` + reason, move to
    the next case. Exploration is a decision the owner makes, not a default the agent drifts
    into. (TC38 rule: the user's one manual screenshot resolved in 2 minutes what 15 probes did
    not.)
12. **Fixed data path.** Reuse the same client/route/recipe across cases in a segment — every
    new address/autocomplete costs discovery calls.

## CHECK — during and after the session

13. **Token checkpoint per case.** After registering each case, glance at remaining budget.
    Mechanical case >30k = something in the recipe is missing → note it for ACT.
14. **Verify by extraction, not by eyes.** Grid membership, tab counts, statuses: assert via
    `eval` returning booleans/rows filtered client-side (find by trip code, never by tab
    totals). Screenshots are evidence for Xray, not the agent's verification channel.

## ACT — after the segment (this is what makes it PDCA and not just tips)

15. **Push discovered entry conditions INTO the test case.** TC38's real fix is not a better
    prompt — it is editing the Xray test's preconditions/steps to state when Cotizar renders.
    A case that needs tribal knowledge to execute will bill its exploration cost on every
    future run, human or agent.
16. **Save gotchas to memory once, with selectors.** Datepicker/ng-select/candidate-reordering
    recipes saved after this campaign mean the next session pays 0 to rediscover them.
17. **Update this file** when a new lever is measured. Rules without measurements don't enter.

---

## Quick reference — the execution-session contract

```
BUDGET   ~20k tokens per mechanical case; 2× budget without verdict = stop & report
BROWSER  scripts > refs > snapshots; --raw eval JSON for all assertions
IMAGES   capture always, read back at most 1 per case (adjudication only)
SHELL    1 batched Bash call per case for full Xray registration
MODEL    cheap tier for execution; expensive tier for design/triage only
MCP      minimal roster; every idle server is recurring context rent
PARALLEL only for deadlines; each session costs ~120k before the first click
EXIT     unknown entry condition → TODO + reason, never open-ended probing
AFTER    fold discoveries back into TC preconditions + memory + this file
```

## Companion artifacts

- Prompt template for parallel segments: [`segment-prompt-template.md`](./segment-prompt-template.md)
- Minimal MCP profile for execution sessions: repo-root `.mcp.execution.json`
  (`claude --mcp-config .mcp.execution.json --strict-mcp-config`); usage note in `docs/mcp/README.md`.
- Reusable form-fill script (MG-19 Nuevo Viaje): `scripts/mg19-alta-nuevo-viaje.js`
  (`playwright-cli run-code --filename=...` — edit its CONFIG block per case; it stops before
  the irreversible Enviar/Cotizar click).
- Worked ACT example: Xray Precondition TM-761 (Cotizar entry condition) attached to TM-543
  with `precondition add-to-test` + `test update-step` (step id preserved, runs unaffected).
