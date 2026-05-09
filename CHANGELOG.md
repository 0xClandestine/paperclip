# Autoresearch Control Plane — Handoff

Branch: `feat/autoresearch-dashboard-charts` (off `feat/autoresearch-control-plane`)
PR: https://github.com/0xClandestine/paperclip/pull/1
Last commit: `9c559a20` — eval fields in project creation API + onboarding UI

---

## What this fork does

Paperclip is a control plane for AI-agent companies (org charts, CEOs, hiring,
revenue). This fork reshapes it into a control plane for **autonomous experiment
loops** — Karpathy-style optimization where agents form hypotheses, write code,
the system measures results, and the best improvements survive.

Core loop: `agent writes code → system runs eval → score recorded → keep/discard → repeat`

---

## What changed (185 files, +983/-1151 lines)

### Domain model shift

| Paperclip concept | → | Autoresearch equivalent |
|---|---|---|
| Company | | Research Project |
| Agent role: ceo/cto/cmo/cfo | | explorer/optimizer/reviewer/general |
| Goal level: company/team/agent/task | | research_question/hypothesis/experiment |
| Approval type: hire_agent, approve_ceo_strategy | | Removed entirely |
| Budget scope: company/agent/project | | project/agent |
| Agent status: pending_approval, terminated | | Removed |
| CEO special-casing (7+ permission gates) | | Removed — board-only for management |

### New: `packages/autoresearch/`

Self-contained eval system with zero dependencies on `@paperclipai/db` (only
`drizzle-orm` and `@paperclipai/shared`). Schema tables live in `packages/db`
(migration 0082).

```
packages/autoresearch/src/
├── executor.ts     # spawn eval, capture stdout/stderr, enforce timeout, determine keep/discard
├── parser.ts       # extract score from plain number or {"score": N} JSON
├── service.ts      # createConfig, lockBaseline, runEval, getChartData
├── types.ts        # EvalDirection, EvalResult, EvalChartData, ExperimentDataPoint
└── index.ts
```

### New: `server/src/routes/eval.ts`

```
GET  /api/companies/:id/eval          → get eval config
POST /api/companies/:id/eval          → create eval config
POST /api/companies/:id/eval/lock     → lock baseline ref (body: { ref })
GET  /api/companies/:id/eval/chart    → time-series chart data
```

`POST /api/companies` now accepts optional eval fields (`evalRepoUrl`, `evalPath`,
`evalDirection`, `evalScoreUnit`, `evalTimeoutMs`) and creates an `eval_configs`
row atomically if provided.

### New: `packages/db/src/schema/eval-configs.ts` + `eval-runs.ts`

Two new tables (migration 0082 applied):

- **`eval_configs`** — one per project: `repo_url`, `eval_path`, `baseline_ref`,
  `direction` ("lower"/"higher"), `score_unit`, `timeout_ms`, `best_score`, `locked_at`
- **`eval_runs`** — one per experiment: `score`, `raw_output`, `raw_stderr`,
  `exit_code`, `duration_ms`, `commit_hash`, `baseline_ref`, `disposition` (keep/discard/crash)

### New: `ui/src/components/EvalChart.tsx`

SVG dual-axis chart on the dashboard page. Best score line (purple) + cost line
(amber, dashed), colored dots for keep/discard/crash. Hover tooltips via SVG
`<title>`. Renders above summary cards.

### New: `ui/src/api/eval.ts`

API client for all eval endpoints.

### UI: Onboarding wizard

Step 1 ("Name your research project") now has a collapsible "Eval benchmark"
section with fields for:
- GitHub repo URL
- Eval file path
- Direction (lower/higher)
- Score unit

All labels changed from "company"/"CEO"/"hire" to research terminology.

### Docs

- `doc/AUTORESEARCH-SPEC.md` — V1 build contract
- `doc/plans/2026-05-08-eval-function-chart.md` — eval feature design (status: Implemented)
- `doc/GOAL.md`, `doc/PRODUCT.md` — rewritten for autoresearch
- Deleted: `server/src/onboarding-assets/ceo/` (AGENTS, HEARTBEAT, SOUL, TOOLS)
- Replaced: `server/src/onboarding-assets/default/` (AGENTS.md, HEARTBEAT.md)

---

## How to run

```bash
cd /path/to/paperclip
git checkout feat/autoresearch-dashboard-charts

# Requires PostgreSQL running locally
brew services start postgresql@18  # macOS
createdb paperclip_dev            # first time only

DATABASE_URL="postgres://localhost:5432/paperclip_dev" pnpm dev
# Open http://localhost:3100
```

To reset the DB:
```bash
dropdb paperclip_dev && createdb paperclip_dev
```

Embedded PostgreSQL (no external DB) fails on macOS due to shared memory limits.
Fix with: `sudo sysctl kern.sysv.shmmax=67108864 kern.sysv.shmall=16384`

---

## Build status

```
pnpm -r typecheck  →  ALL 23 PACKAGES PASS
pnpm test          →  NOT RUN (test fixtures not yet updated for new types)
```

---

## What's NOT done (handoff items)

### Critical

1. ~~**Eval execution is not wired into the experiment lifecycle.**~~
   **Done.** `autoresearchService.runEval()` is now called in `heartbeat.ts`
   after every successful run that has an `executionWorkspace.cwd`. It looks up
   the eval config by `companyId`, runs the eval, logs the disposition to the
   run log, and records the result in `eval_runs`. No-op for projects without
   an eval config.

2. **Repo cloning doesn't exist yet.**
   When an agent checks out an experiment, the system needs to clone/fetch the
   project's GitHub repo into a workspace. Currently the workspace model exists
   but doesn't use a remote repo. Need to:
   - Clone repo on first experiment
   - Pull latest on subsequent experiments
   - Handle auth (public repos for V1, private later)

3. **Test fixtures are broken.**
   ~200 test files still reference old role values (`"ceo"`, `"cto"`, `"hire_agent"`,
   `"pending_approval"`, etc.). The type system catches these (all typechecks pass)
   but the tests themselves haven't been updated for the new types.
   - Run `pnpm test` to see failures
   - Fix pattern: replace old role values with new ones, update assertions

### Important

4. **Baseline locking is manual and optional.**
   `POST /eval/lock` exists but nothing calls it. The onboarding wizard creates
   the eval config without locking a baseline. The `baselineRef` column stays
   null. The system should:
   - On project creation with eval, clone and validate the repo
   - Grab HEAD commit hash as `baselineRef`
   - Call `lockBaseline()` to make it immutable
   - Show a green checkmark on successful validation

5. **No project/eval settings page.**
   The eval config can only be set at creation time. There's no UI to view or
   modify it for an existing project. Need:
   - A settings tab or page showing eval config details
   - Ability to lock the baseline for projects created without one
   - Visual indicator of whether a project has an eval

6. **Chart cost data is placeholder.**
   The chart shows `cumulativeCostCents: 0` for all points. Need to join
   `eval_runs` with `cost_events` or `heartbeat_runs` to get actual cost data.
   - File: `packages/autoresearch/src/service.ts` → `getChartData()`
   - Join with `cost_events` on `issue_id` or `heartbeat_run_id`

7. **Agent instructions are outdated.**
   The default AGENTS.md and HEARTBEAT.md tell agents to check out issues and
   run tasks. They don't mention the eval loop. Need to update them to describe:
   - Form hypothesis → write code → commit → system runs eval → review result
   - Agent does NOT run benchmarks — the system does
   - Score comes from `PAPERCLIP_EVAL_SCORE` env var (not yet injected)

### Nice to have

8. **Agent-generated eval.**
   The `evalPrompt` field exists in the API schema but has no UI or backend
   implementation. A user should be able to provide a prompt like "Run cargo bench
   --bench json_parse and extract throughput" and have an agent write the eval
   file, commit it to the repo, and the system lock the baseline.

9. **Multi-metric evals.**
   Currently single score only. The parser supports `{"score": N}` JSON output
   which could be extended to `{"metrics": {"throughput": 142, "latency": 3.2}}`.

10. **Auth for private repos.**
    Only public GitHub repos work. Need GitHub token integration for private repos.

### Cosmetic

11. **Server ASCII banner still says "PAPERCLIP".** In `server/src/startup-banner.ts`.
12. **Favicon/icons still paperclip-branded.** In `ui/public/`.
13. **DB table names still `companies`/`issues`.** No migration needed since only
    logic and UI changed, but a rename would make the codebase self-documenting.

---

## Key files to start with

| What | File |
|------|------|
| Eval service (core logic) | `packages/autoresearch/src/service.ts` |
| Eval executor (runs eval scripts) | `packages/autoresearch/src/executor.ts` |
| Eval routes (API endpoints) | `server/src/routes/eval.ts` |
| Heartbeat service (where eval should hook in) | `server/src/services/heartbeat.ts` |
| Dashboard (where chart renders) | `ui/src/pages/Dashboard.tsx` |
| Eval chart component | `ui/src/components/EvalChart.tsx` |
| Eval API client | `ui/src/api/eval.ts` |
| Onboarding wizard (project creation) | `ui/src/components/OnboardingWizard.tsx` |
| Shared types (API contracts) | `packages/shared/src/types/company.ts` |
| Shared validators (create schema) | `packages/shared/src/validators/company.ts` |
| Design doc | `doc/plans/2026-05-08-eval-function-chart.md` |
| V1 spec | `doc/AUTORESEARCH-SPEC.md` |
