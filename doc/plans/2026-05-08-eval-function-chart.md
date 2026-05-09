# Eval Function + Progress Chart — Feature Design

Status: In Progress
Date: 2026-05-08
Branch: `feat/autoresearch-dashboard-charts`

## 1. Overview

Every research project is centered on a **GitHub repo**. The repo contains the
code being optimized and an **eval file** that scores any code change. The system
clones the repo, runs agents against it, executes the eval on every experiment,
and tracks progress on a dashboard chart.

## 2. Repo-Centric Model

### 2.1 Why a repo

- The repo is the single source of truth for **both** the code and the eval.
- Git history = audit trail. Every experiment links to a commit.
- Cloning/forking the repo gives you the full project — no blob storage needed.
- Immutability comes from pinning a git ref (commit hash), not from storing
  file content in the DB.

### 2.2 What's in the repo

```
json-parsers/
├── src/           # code being optimized
├── Cargo.toml
├── eval.sh        # the canonical eval script
└── README.md
```

The eval is a single executable file at a known path within the repo.
It takes no input, runs against the current code, and prints a score on stdout.

## 3. Eval Function

### 3.1 Definition

The eval is the oracle. It is:

- **Repo-based** — lives in the project's GitHub repo, not in the DB.
- **Immutable via git** — the system pins a baseline commit hash. Once pinned,
  the eval at that commit is authoritative for the project's lifetime.
- **Configurable direction** — the project declares whether lower or higher
  scores are better.
- **Auto-executed** — the system clones the repo, runs the eval after every
  agent commit, and parses the score automatically.

### 3.2 How the eval is defined

At project creation, the creator provides:

| Field | Description |
|-------|-------------|
| `repoUrl` | GitHub repo URL |
| `evalPath` | Path to eval file within the repo (e.g. `eval.sh`, `bench/eval.py`) |
| `direction` | `"lower"` or `"higher"` |
| `scoreUnit` | Display label (e.g. `"µs"`, `"mbps"`) |
| `timeoutMs` | Max eval wall-clock time (default 5 min) |

Two paths to get the eval file into the repo:

| Path | How |
|------|-----|
| **User provides it** | The repo already has the eval file. The system verifies it exists at `evalPath` on clone. |
| **Agent generates it** | User provides a prompt. An agent writes the eval file, commits it to the repo, and the system pins that commit as baseline. |

### 3.3 Eval contract

```
Input:  none (eval runs in the cloned repo root)
Output: a numeric score on stdout, or a JSON object with a "score" field

  Exit code 0 → success. Score is parsed from stdout.
  Exit code non-zero → eval crash. No score recorded.
```

### 3.4 Anti-cheating invariants

1. **Immutable baseline**: Once `baselineRef` is locked, the eval config cannot
   be changed. Any attempt to modify it is rejected.
2. **System runs the eval**: The agent does not invoke the eval. The system
   runs it automatically in the cloned repo workspace.
3. **Score provenance**: Every score links back to the specific baseline ref
   that produced it.
4. **No manual scoring**: The agent cannot report a score. Only scores from
   system-executed eval runs are canonical.
5. **Same baseline, every time**: The system records which baseline ref was
   used for each run.

## 4. Experiment Lifecycle

```
agent checkout → agent writes code → agent commits → system runs eval → system logs score → system determines keep/discard
```

1. Agent checks out an experiment.
2. Agent writes code in the cloned repo workspace.
3. Agent commits the change.
4. System runs `eval.sh` (at the project's `evalPath`).
5. System parses score, compares against running best.
6. System determines `keep` or `discard`.
7. System logs the eval run to `eval_runs`.
8. Agent is notified of the result — can comment with analysis, but cannot
   override the keep/discard decision.

## 5. Dashboard Chart

### 5.1 Location

Main dashboard page, above summary cards.

### 5.2 Chart

Dual-axis time series:

| Axis | Series |
|------|--------|
| Left Y | Best score (monotonically improving) |
| Right Y | Cumulative compute cost ($) |
| X | Experiment index |

Color-coded dots:
- 🟢 keep (improved best)
- 🔴 discard (didn't beat best)
- ⚫ crash (eval failed)

Hover: experiment #, score, delta, cost, commit hash, hypothesis snippet.

### 5.3 Summary header

```
[Project Name]  │  Best: 142 µs  │  Experiments: 47 (12 kept)  │  Cost: $3.42
```

## 6. Data Model

### 6.1 `eval_configs` (one per project)

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | PK |
| `company_id` | uuid | FK → companies, unique |
| `repo_url` | text | GitHub repo URL |
| `eval_path` | text | Path to eval file in repo |
| `baseline_ref` | text | Pinned git commit hash (immutable once set) |
| `direction` | text | "lower" or "higher" |
| `score_unit` | text | Display label |
| `timeout_ms` | int | Max eval wall-clock time |
| `best_score` | float | Running best score |
| `best_run_id` | uuid | FK → eval_runs |
| `locked_at` | timestamptz | When baseline was pinned |

### 6.2 `eval_runs` (one per experiment)

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | PK |
| `eval_config_id` | uuid | FK → eval_configs |
| `issue_id` | uuid | FK → issues |
| `heartbeat_run_id` | uuid | FK → heartbeat_runs |
| `commit_hash` | text | Git commit at which eval was run |
| `score` | float | Parsed score (null if crash) |
| `raw_output` | text | Full stdout |
| `raw_stderr` | text | Full stderr |
| `exit_code` | int | 0 = success |
| `duration_ms` | int | Wall-clock ms |
| `baseline_ref` | text | Eval baseline ref at time of execution |
| `disposition` | text | keep / discard / crash |

## 7. Package Architecture

```
packages/autoresearch/
├── schema/
│   ├── eval-configs.ts    # Drizzle table definition
│   └── eval-runs.ts       # Drizzle table definition
├── executor.ts            # spawn eval, capture output, enforce timeout
├── parser.ts              # parse score from stdout
├── service.ts             # CRUD, runEval(), getChartData()
└── types.ts               # EvalDirection, EvalResult, EvalChartData, etc.
```

Zero dependencies on `@paperclipai/db`. The service takes a generic
`PostgresJsDatabase`. `server/` passes its DB through.

### Integration points

| Package | Change |
|---------|--------|
| `packages/autoresearch` | Full eval logic (config, runs, execution, chart data) |
| `packages/db` | Migration: add `companies.repo_url`, `companies.eval_path` columns |
| `server` | Routes for eval CRUD + chart API. Hook into experiment lifecycle. |
| `ui` | Chart component on dashboard. Eval config form at project creation. |

## 8. Open Questions

1. **Repo cloning**: Who clones the repo — the server, or the agent's workspace
   manager? Server-side cloning gives the system control over eval execution.
2. **Agent workspace**: Does the agent work in the same cloned repo? Yes —
   the workspace IS the cloned repo. Agents checkout experiments, write code in
   the repo, commit, and the system runs eval from the same directory.
3. **Multi-agent repos**: Can two agents work on the same repo simultaneously?
   Yes — each gets a git worktree or branch.
4. **Eval timeout**: What happens on timeout — treated as crash?
5. **Multi-metric evals**: Single score for V1. Multi-metric later.
6. **Agent-generated eval approval**: When an agent writes the eval from a
   prompt, does the user approve before locking?
