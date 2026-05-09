# Eval Function + Progress Chart — Feature Design

Status: Draft
Date: 2026-05-08
Branch: `feat/autoresearch-dashboard-charts`

## 1. Overview

Every research project has a canonical **eval function** — an immutable piece of
code that scores any code change. The system automatically runs the eval on
every experiment and logs the result. The main dashboard shows a chart of
**best score over time, overlaid with cumulative cost**.

## 2. Eval Function

### 2.1 Definition

The eval is the oracle. It is:

- **Immutable** — defined at project creation, never changes. If the eval needs to
  change, create a new project.
- **Configurable direction** — the project declares whether lower or higher scores
  are better (e.g., `lower` for µs, `higher` for accuracy).
- **Single source of truth** — every experiment in the project is measured by
  exactly this function. Agents cannot substitute a different benchmark.

### 2.2 How the eval is defined

At project creation, the creator picks one of two paths:

| Path | How it works |
|------|-------------|
| **Provide the file** | User uploads a script (bash, python, js, etc.) or pastes inline. The system stores it and marks it immutable. |
| **Agent generates it** | User provides a natural-language prompt. An agent generates the eval script, the user reviews/approves it, and the system stores it immutably. |

### 2.3 Eval contract

The eval is a single executable file with a well-defined interface:

```
Input:  none (eval runs in the project workspace against current code)
Output: a numeric score on stdout, optionally structured as a single JSON line

Contract:
  - Exit code 0 → success. Score is parsed from stdout.
  - Exit code non-zero → eval failure. No score recorded.
  - Stdout must contain exactly one number, or a JSON object with a "score" field.
```

Examples:

```bash
# Bash — parse throughput benchmark
#!/bin/bash
cargo bench --bench json_parse -- --output-format=json | jq '.throughput_mbps'
```

```python
# Python — run test suite, score = wall clock seconds
import subprocess, time
start = time.time()
subprocess.run(["pnpm", "test:run"], check=True)
print(time.time() - start)
```

```bash
# JSON output with metadata
#!/bin/bash
result=$(cargo bench --bench json_parse | tail -1)
echo '{"score": '"$result"', "unit": "throughput_mbps"}'
```

### 2.4 Anti-cheating invariants

The system enforces:

1. **Immutability**: Once a project has its eval file, it cannot be changed. Any
   attempt to modify it is rejected with an error. The eval hash is recorded at
   project creation.
2. **Automatic execution**: Every experiment run automatically executes the eval
   as part of the experiment lifecycle. The agent does not need to invoke it
   separately. The system captures stdout and parses the score.
3. **Score provenance**: The raw eval stdout is stored alongside the parsed score.
   Every score in the chart links back to the exact eval output that produced it.
4. **No manual scoring**: The agent cannot report a score directly. The score
   comes only from the eval output captured by the system. If an agent claims a
   score in a comment, the system ignores it — the canonical score is from the
   eval output.
5. **Same eval, every time**: The system verifies the eval file hash matches the
   project's recorded hash before every run. If it doesn't match, the experiment
   is rejected.

## 3. Experiment Lifecycle with Eval

The experiment flow changes to automatically include eval:

```
Before (paperclip issue lifecycle):
  agent checkout → agent runs code → agent reports result → agent comments

After (autoresearch experiment lifecycle):
  agent checkout → agent makes code change → system runs eval → system logs score → system records keep/discard
```

Steps:

1. **Agent checks out** an experiment (same as current checkout).
2. **Agent makes a code change** in the workspace (same as current).
3. **System runs the eval** automatically:
   - Resets workspace to the agent's commit.
   - Executes `eval.sh` (or whatever the stored eval file is).
   - Captures exit code, stdout, stderr, and wall clock duration.
   - Parses the score from stdout.
4. **System logs the result**:
   - If eval passes (exit 0): record the score, timestamp, commit hash, cost.
   - If eval fails (exit non-zero): record as `crash`, store stderr.
5. **System determines keep/discard** by comparing the score against the
   project's running best. If the score improves (per the project's direction),
   the experiment is `kept`. Otherwise `discarded`.
6. **Agent is notified** of the result. The agent can comment with analysis but
   cannot override the keep/discard decision.

Agent's role narrows to: form hypothesis → write code → commit. The system
handles measurement and disposition.

## 4. Dashboard Chart

### 4.1 Location

The chart lives on the main **Dashboard** page, above or replacing the existing
summary cards. It is the primary visual for each selected project.

### 4.2 Data shown

A dual-axis time-series chart:

| Axis | Data | Type |
|------|------|------|
| **Left Y** | Best score so far (monotonically improving) | Solid line |
| **Right Y** | Cumulative compute cost ($) | Dashed line |
| **X** | Time (experiment index or wall clock) | |

Each **point** on the score line = one experiment (both keeps and discards shown,
but the "best" line only ever goes in the improving direction).

Color coding:
- **Green dots** = keep (improved the best)
- **Red dots** = discard (didn't beat the best)
- **Gray dots** = crash (eval failed)

Hovering a point shows: experiment #, score, delta from previous best, cost,
commit hash, and a snippet of the agent's hypothesis.

### 4.3 Summary header above the chart

```
[Project Name]  │  Best: 142 µs  │  Experiments: 47 (12 kept)  │  Cost: $3.42
```

## 5. Data Model Changes

### 5.1 New columns on `companies`

| Column | Type | Description |
|--------|------|-------------|
| `eval_file_content` | text | The eval script source code |
| `eval_file_name` | text | Filename (e.g., `eval.sh`) |
| `eval_file_hash` | text | SHA-256 of content (immutability check) |
| `eval_direction` | text | `"lower"` or `"higher"` |
| `eval_score_unit` | text | Display unit (e.g., `"µs"`, `"mbps"`, `""`) |
| `best_score` | float | Running best score across all experiments |
| `best_score_run_id` | uuid | The experiment that achieved it |

### 5.2 New columns on `issues` (experiments)

| Column | Type | Description |
|--------|------|-------------|
| `eval_score` | float | The parsed score from eval output |
| `eval_raw_output` | text | Full stdout from the eval run |
| `eval_exit_code` | int | Exit code of the eval process |
| `eval_duration_ms` | int | Wall clock duration of eval execution |
| `eval_hash_at_run` | text | SHA-256 of eval file at time of run |

### 5.3 New columns on `heartbeat_runs`

| Column | Type | Description |
|--------|------|-------------|
| `eval_triggered` | boolean | Whether the eval was auto-triggered on this run |

## 6. API Changes

### 6.1 Project creation

`POST /api/companies`

Add eval fields to request body:
```json
{
  "name": "JSON parser optimization",
  "evalDirection": "lower",
  "evalScoreUnit": "µs",
  "evalFileContent": "#!/bin/bash\ncargo bench ...",
  "evalFileName": "eval.sh",
  "evalPrompt": null
}
```

Or with agent generation:
```json
{
  "name": "JSON parser optimization",
  "evalDirection": "lower",
  "evalScoreUnit": "µs",
  "evalPrompt": "Run cargo bench --bench json_parse and extract the throughput_mbps field"
}
```

### 6.2 Dashboard

`GET /api/companies/:id/dashboard`

Add eval chart data to response:
```json
{
  "evalConfig": {
    "direction": "lower",
    "scoreUnit": "µs",
    "bestScore": 142.5,
    "bestScoreRunId": "..."
  },
  "experimentSeries": [
    {
      "id": "...",
      "index": 1,
      "score": 185.2,
      "disposition": "keep",
      "costCents": 12,
      "commitHash": "abc1234",
      "occurredAt": "2026-05-08T21:00:00Z"
    }
  ],
  "costCumulativeCents": 342
}
```

## 7. Agent-Side Impact

### What changes for agents

- Agents no longer run the benchmark themselves. They write code, commit, and
  the system measures.
- Agents no longer decide keep/discard. The system compares against the running
  best.
- Agents still write hypotheses, analysis, and observations as comments.
- The `PAPERCLIP_TASK_ID` env var still indicates the current experiment.
- New env var: `PAPERCLIP_EVAL_SCORE` — the score from the most recent eval
  (available to the agent for analysis in its comments).

### What pi-autoresearch already does that aligns

- `init_experiment` sets metric name, unit, direction — maps to eval config
- `run_experiment` runs a command and captures output — maps to eval execution
- `log_experiment` records keep/discard — maps to system disposition

The difference: in pi-autoresearch, the agent controls everything.
In the control plane, the eval is system-enforced and automatic.

## 8. Open Questions

1. **Eval timeout**: Should evals have a per-project timeout? (e.g., "eval must
   complete within 5 minutes") What happens on timeout — treated as crash?
2. **Eval sandboxing**: Should evals run in a sandboxed environment? For a V1,
   assume they run in the same workspace as agent code changes.
3. **Eval caching**: If two experiments produce the same code hash (unlikely),
   should the system skip re-running the eval and use the cached score?
4. **Multi-metric evals**: Should an eval be allowed to return multiple metrics
   (e.g., throughput AND memory)? For V1, single score only.
5. **Agent-generated eval approval**: When an agent generates the eval from a
   prompt, does the user approve it in-UI before locking it in?

## 9. Implementation Phases

| Phase | Scope | Effort |
|-------|-------|--------|
| **1. Eval storage + immutability** | DB columns for eval file, hash, direction. API changes for project creation. Hash verification at experiment time. | S |
| **2. Auto-eval execution** | Hook into experiment lifecycle — after agent commit, system runs eval, parses score, logs result. Keep/discard by system. | M |
| **3. Dashboard chart** | React chart component on dashboard. Best-score line + cost line. Point hover details. | M |
| **4. Agent UX** | Remove agent responsibility for running benchmark. Inject `PAPERCLIP_EVAL_SCORE` into agent env. Update agent instructions. | S |
| **5. Agent-generated eval** | Agent receives prompt, writes eval file, user approves, system locks it. | S |
