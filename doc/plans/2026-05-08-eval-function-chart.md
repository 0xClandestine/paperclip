# Eval Function + Progress Chart — Feature Design

Status: Implemented
Date: 2026-05-08
Branch: `feat/autoresearch-dashboard-charts`

## 1. Overview

Every research project is centered on a **GitHub repo**. The repo contains the
code being optimized and an **eval file** that scores any code change. The system
clones the repo, runs agents against it, executes the eval on every experiment,
and tracks progress on a dashboard chart.

## 2. Repo-Centric Model

The repo is the single source of truth for **both** the code and the eval.
Git history = audit trail. Every experiment links to a commit.
Immutability comes from pinning a git ref, not from storing file content in DB.

## 3. Eval Function

### 3.1 Definition

- **Repo-based** — lives in the project's GitHub repo at a known path
- **Immutable via git** — pinned baseline commit hash locks the eval forever
- **Configurable direction** — `"lower"` (µs) or `"higher"` (throughput)
- **Auto-executed** — system runs eval after agent commit, parses score

### 3.2 Setup flow

At project creation, the user optionally provides:

| Field | Example |
|-------|---------|
| `evalRepoUrl` | `https://github.com/user/json-parsers` |
| `evalPath` | `eval.sh` |
| `evalDirection` | `lower` |
| `evalScoreUnit` | `µs` |

These are passed to `POST /api/companies`. If all three eval fields are
present, an `eval_configs` row is created atomically with the project.

The onboarding wizard has a collapsible "Eval benchmark" section in step 1.
If left collapsed, the project is created without an eval (chart shows
"No experiments yet").

### 3.3 Eval contract

```
Input:  none (eval runs in the cloned repo root)
Output: numeric score on stdout, or {"score": N} JSON

  Exit code 0 → success. Score parsed from stdout.
  Exit code non-zero → eval crash. No score recorded.
```

### 3.4 Anti-cheating invariants

1. **Immutable baseline** — `lockedAt` set at creation, no edits allowed
2. **System runs eval** — agent never invokes it directly
3. **Score provenance** — every score links to baseline ref + commit hash
4. **No manual scoring** — only system-executed eval runs are canonical

## 4. Experiment Lifecycle

```
agent checkout → agent writes code → agent commits → system runs eval → system logs score → system determines keep/discard
```

Agent's role: form hypothesis → write code → commit.
System handles measurement and disposition.

## 5. Dashboard Chart

### 5.1 Location

Main dashboard page, between ActiveAgentsPanel and summary cards.

### 5.2 Chart

SVG dual-axis time series:
- **Left Y**: Best score (monotonically improving line, purple)
- **Right Y**: Cumulative compute cost (dashed line, amber, if data available)
- **X**: Experiment index

Color-coded dots: green=keep, red=discard, gray=crash.
Hover: experiment #, score, disposition, cost, commit hash.

### 5.3 Summary header

```
Progress  │  Best: 142 µs  │  Experiments: 47 (12 kept)
```

## 6. Data Model

### 6.1 `eval_configs`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | PK |
| `company_id` | uuid | FK → companies, unique |
| `repo_url` | text | GitHub repo URL |
| `eval_path` | text | Path to eval file in repo |
| `baseline_ref` | text | Pinned git commit (immutable once set) |
| `direction` | text | "lower" or "higher" |
| `score_unit` | text | Display label |
| `timeout_ms` | int | Max wall-clock (default 300000) |
| `best_score` | float | Running best score |
| `best_run_id` | uuid | FK → eval_runs |
| `locked_at` | timestamptz | When config was locked |

### 6.2 `eval_runs`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | PK |
| `eval_config_id` | uuid | FK → eval_configs |
| `issue_id` | uuid | FK → issues |
| `heartbeat_run_id` | uuid | FK → heartbeat_runs |
| `commit_hash` | text | Git commit at experiment time |
| `score` | float | Parsed score (null if crash) |
| `raw_output` | text | Full stdout |
| `raw_stderr` | text | Full stderr |
| `exit_code` | int | 0 = success |
| `duration_ms` | int | Wall-clock ms |
| `baseline_ref` | text | Eval baseline ref at execution time |
| `disposition` | text | keep / discard / crash |

## 7. Package Architecture

```
packages/autoresearch/src/
├── index.ts              # public exports
├── executor.ts           # spawn eval, capture output, enforce timeout
├── parser.ts             # parse score from stdout (plain number or JSON)
├── service.ts            # CRUD, runEval(), getChartData()
└── types.ts              # EvalDirection, EvalResult, EvalChartData, etc.

server/src/routes/eval.ts   # GET/POST eval config, lock baseline, GET chart
ui/src/api/eval.ts           # API client
ui/src/components/EvalChart.tsx  # SVG chart
```

## 8. API Surface

| Method | Path | Description |
|--------|------|-------------|
| `POST /api/companies` | + eval fields | Create project with optional eval config |
| `GET /api/companies/:id/eval` | | Get eval config |
| `POST /api/companies/:id/eval` | | Create eval config (if not done at project creation) |
| `POST /api/companies/:id/eval/lock` | `{ ref }` | Lock baseline to a git commit |
| `GET /api/companies/:id/eval/chart` | | Get chart time-series data |

## 9. Open Questions

1. **Repo cloning**: Who clones the repo — server or workspace manager?
2. **Eval timeout**: Treated as crash — agent sees eval failure.
3. **Multi-metric evals**: Single score for V1. Multi-metric later.
4. **Agent-generated eval**: User prompt → agent writes eval → user approves → system locks. Not yet implemented in UI.
5. **Cost tracking**: Dashboard chart shows cost placeholder. Wire up to `cost_events` table later.