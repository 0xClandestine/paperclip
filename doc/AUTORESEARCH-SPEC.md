# Autoresearch Control Plane — V1 Spec

Status: Draft
Date: 2026-05-08
Audience: Engineering
Source inputs: `doc/GOAL.md`, `doc/PRODUCT.md`, `doc/SPEC-implementation.md`, `pi-autoresearch`

## 1. Document Role

This document defines the target model for the autoresearch fork. It replaces
`SPEC-implementation.md` as the build contract. Where this document is silent,
`SPEC-implementation.md` remains authoritative for unchanged subsystems (auth,
agent adapters, plugin system, deployment modes).

## 2. Core Concept

The autoresearch control plane manages autonomous experiment loops. A human
operator creates research projects, assigns researcher agents, and monitors
experiments — all from a single board. Agents run the
hypothesis → experiment → measure → keep/discard loop autonomously,
reporting results, costs, and findings back to the control plane.

This is **not** a company simulator. There are no employees, no org charts,
no hiring flows, no CEO strategy approvals, and no revenue tracking.
It is a pure experiment orchestration layer.

## 3. Domain Model

### 3.1 Research Project (top-level container)

A research project has:
- A **research question** — what we're trying to discover or optimize
- **Researcher agents** — AI agents that run experiments
- **Experiments** — the core work unit (hypothesis + code + metric measurement)
- **Compute budget** — token/GPU cap with hard-stop enforcement
- **Findings** — markdown documents capturing results and analysis

One instance runs multiple research projects.

### 3.2 Researcher Agents

Agents are tools, not employees. There is no org chart and no hierarchy.
All agents in a project are peers. Each agent has:

- **Adapter type + config** — how it runs (process, http, claude_local, etc.)
- **Research role** — its specialty (explorer, optimizer, reviewer, general)
- **Context mode** — thin (API fetches) or fat (context injected)
- **Compute budget** — optional per-agent cap within project budget

Agent roles (replaces corporate AGENT_ROLES):

| Role | Description |
|------|-------------|
| `explorer` | Broad hypothesis generation, divergent search |
| `optimizer` | Targeted metric improvement, incremental refinement |
| `reviewer` | Validation, correctness checks, finding synthesis |
| `general` | Unspecialized (default) |

No `pending_approval` status — agents are created directly and are immediately
usable. No `terminated` status — agents can be paused or archived, never "fired."

### 3.3 Experiments (core work unit)

Every experiment is a single autonomous run of the loop:
hypothesis → code change → benchmark → result.

Experiment model:
- **Hypothesis** — what the agent is testing (stored in description)
- **Code change** — committed and tracked by git hash
- **Benchmark** — a command that produces a metric
- **Result** — metric value, status (keep/discard/crash), change vs baseline
- **Cost** — token/GPU spend for the run

Statuses: `queued → running → completed | failed | cancelled`

No `backlog`, `todo`, `in_review`, `blocked` — experiments are run-and-done.
An experiment maps to exactly one agent run. Results are:
- **keep** — metric improved; commit is preserved
- **discard** — metric didn't improve; changes reverted
- **crash** — benchmark failed; changes reverted

### 3.4 Research Questions (goals replacement)

Replace the corporate goal hierarchy (`company → team → agent → task`) with:

`research_question → hypothesis → experiment`

A research question is the top-level framing. Hypotheses are specific
testable claims. Experiments test individual hypotheses.

### 3.5 Findings (documents replacement)

Findings are markdown documents that capture analysis, dead ends, patterns,
and discoveries across experiments. They replace the generic "documents"
concept with a research-specific framing.

### 3.6 Compute Budget

Budget is simplified from the paperclip finance model:
- Single `billed_cents` metric per project and optionally per agent
- Hard-stop auto-pause when cap is reached
- No revenue, no credit purchases, no invoices, no debit/credit split
- No `BILLING_TYPES` or `FINANCE_EVENT_KINDS` — all costs are `compute_cost`
- Cost events track: project, agent, experiment, provider, model, tokens, cents

## 4. What Gets Removed

### 4.1 Entirely removed

| Paperclip concept | Reason |
|---|---|
| `AGENT_ROLES` ceo/cto/cmo/cfo | No C-suite; replaced with research roles |
| `APPROVAL_TYPES` hire_agent, approve_ceo_strategy | No hiring, no CEO gate |
| `AGENT_STATUS` pending_approval | Agents are created directly |
| CEO special-casing in server (7+ gates) | No CEO concept |
| `FINANCE_EVENT_KINDS` (14 kinds) | All costs are `compute_cost` |
| `BILLING_TYPES` (6 kinds) | Not applicable |
| `FINANCE_DIRECTIONS` debit/credit | Pure spend, no revenue |
| `hire-hook.ts` | No hire approval flow |
| Onboarding CEO assets (AGENTS.md, SOUL.md, HEARTBEAT.md) | Replaced with researcher templates |
| Company memberships, invites, join requests | Single-operator V1 |
| Company portability import/export | Deferred; may return as project sharing |
| `GOAL_LEVELS` company/team/agent/task | Replaced with research_question/hypothesis/experiment |

### 4.2 Simplified

| Paperclip concept | Simplified to |
|---|---|
| `AGENT_STATUSES` | Remove `pending_approval` |
| `BUDGET_SCOPE_TYPES` | `project`, `agent` (remove `company`) |
| `BUDGET_METRICS` | Keep `billed_cents` only |
| Issue lifecycle (7 statuses) | Experiment lifecycle (4 statuses) |
| Projects sub-entity within company | Remove — project IS the top-level container |
| Finance events table | Simplify to cost_events only |

## 5. What Stays Unchanged

- Agent adapter system (process, http, claude_local, codex_local, etc.)
- Heartbeat invocation and run tracking
- API key auth for agents, session auth for board
- Deployment modes (local_trusted, authenticated)
- Plugin system
- Search infrastructure
- Activity/audit log infrastructure
- Documents → Findings (same table, different label)
- Dashboard infrastructure (different metrics)
- Atomic checkout semantics
- Budget hard-stop enforcement
- Workspace and environment infrastructure

## 6. Explicit V1 Decisions

| Topic | V1 Decision |
|---|---|
| Tenancy | Single-operator, multi-project |
| Top-level entity | Research Project (repurposed `companies` table) |
| Agent model | Flat peer pool, no hierarchy, no CEO |
| Agent roles | explorer, optimizer, reviewer, general |
| Agent creation | Direct (no hire approval flow) |
| Work unit | Experiment (repurposed `issues` table) |
| Work lifecycle | queued → running → completed/failed/cancelled |
| Goal hierarchy | research_question → hypothesis → experiment |
| Budget | Compute budget (billed_cents) per project and agent |
| Budget enforcement | Soft alert at 80%, hard-stop auto-pause at 100% |
| Approvals | budget_override_required, request_board_approval only |
| Finance | Simplified: compute_cost events only, no revenue |
| Board | Single human operator per deployment |
| Visibility | Full visibility to board and all agents in same project |
| Agent adapters | All existing adapters supported |
| Plugin framework | Preserved as-is |
| Auth | Preserved as-is |
| Deployment modes | Preserved as-is |
| DB table names | Kept for V1 (renames deferred) — tables stay `companies`, `issues`, etc.; only domain logic and UI change |

## 7. API Contract

### 7.1 Research Projects (mapped to /api/companies)

- `GET /api/companies` — list projects
- `POST /api/companies` — create project
- `GET /api/companies/:id` — get project
- `PATCH /api/companies/:id` — update project
- `POST /api/companies/:id/archive` — archive project

### 7.2 Agents

- `GET /api/companies/:id/agents` — list researcher agents
- `POST /api/companies/:id/agents` — create agent (no approval needed)
- `GET /api/agents/:id` — get agent
- `PATCH /api/agents/:id` — update agent
- `POST /api/agents/:id/pause` — pause agent
- `POST /api/agents/:id/resume` — resume agent
- `POST /api/agents/:id/heartbeat/invoke` — trigger experiment loop

### 7.3 Experiments (mapped to /api/companies/:id/issues)

- `GET /api/companies/:id/issues` — list experiments
- `POST /api/companies/:id/issues` — create experiment
- `GET /api/issues/:id` — get experiment
- `PATCH /api/issues/:id` — update experiment
- `POST /api/issues/:id/comments` — add observation
- `GET /api/issues/:id/comments` — list observations
- `POST /api/issues/:id/documents/:key` — add finding

### 7.4 Removed endpoints

- `POST /api/agents/:id/terminate` — no termination concept
- `POST /api/companies/:id/approvals` (hire_agent, approve_ceo_strategy types)
- All /api/invites/* endpoints
- All /api/access/memberships/* endpoints
- Finance event ingestion endpoint

## 8. Acceptance Criteria

V1 is complete when:

1. A human operator can create multiple research projects and switch between them.
2. A project can run at least one active researcher agent.
3. An agent can autonomously run experiments (create issue → checkout → run → report result).
4. Experiment results (keep/discard/crash) are tracked with metric values and commit hashes.
5. Compute budget hard-limit auto-pauses agents and prevents new experiments.
6. Agent creation is direct — no approval flow required.
7. Dashboard shows active experiments, cost burn, and recent results.
8. Every mutation is auditable in the activity log.
9. No corporate concepts (CEO, hire, revenue, org chart) appear in UI or API.