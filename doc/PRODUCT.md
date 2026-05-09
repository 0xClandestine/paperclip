# Autoresearch Control Plane — Product Definition

## What It Is

Autoresearch is the control plane for autonomous experiment loops. One instance can run multiple research projects. A **research project** is a first-order object.

## Core Concepts

### Research Project

A research project has:

- A **research question** — the reason it exists ("Find the fastest JSON parser implementation in Rust")
- **Researcher agents** — AI agents that run the hypothesis→experiment→measure loop
- **Experiments** — each hypothesis tested, with metric results and keep/discard disposition
- **Compute budget** — token/GPU cap with hard-stop enforcement
- **Findings** — analysis, dead ends, and discoveries that emerge from experiments

### Researcher Agents

Every agent is a researcher tool, not an employee. When you create a project, you add researcher agents with specific roles:

- **Explorer** — broad hypothesis generation, divergent search across the problem space
- **Optimizer** — targeted metric improvement, incremental refinement from current best
- **Reviewer** — validation, correctness checking, finding synthesis

Each agent has:
- **Adapter type + config** — how it runs and what defines its behavior
- **Role** — its research specialty
- **Compute budget** — optional per-agent spending cap

### Agent Execution

Autoresearch supports several ways to run an agent:

1. **Local CLI/session adapters** — starts or resumes local coding-tool sessions (Claude, Codex, Gemini, Pi, Cursor)
2. **Process adapter** — kicks off a shell command
3. **HTTP adapter** — sends a webhook/API call to an external agent
4. **External adapter plugins** — dynamically loaded adapters

### Experiment Management

Every experiment is a single autonomous run of the research loop:

```
form hypothesis → write code → run benchmark → measure → keep/discard
```

Experiments track:
- **Hypothesis** — what was tested
- **Code change** — git commit hash
- **Metric result** — delta vs baseline
- **Disposition** — keep (improvement), discard (no improvement), crash (failure)
- **Cost** — tokens/GPU time consumed

Experiments are run-and-done. No multi-stage workflows, no review gates, no blockers. An experiment maps to exactly one agent invocation.

### Research Questions

All experiments trace back to a research question. The hierarchy is:

`research_question → hypothesis → experiment`

A research question defines what we're trying to discover. Hypotheses are specific testable claims. Experiments test individual hypotheses.

## Principles

1. **Unopinionated about how you run your agents.** Your agents could be Claude sessions, Python scripts, or webhooks. Autoresearch defines the control plane for monitoring and governance, not the runtime.

2. **Research project is the unit of organization.** Everything lives under a research project. One instance, many projects.

3. **Agents are tools, not employees.** No org charts, no hiring flows, no C-suite roles. Agents are peer researchers that collaborate via shared experiment history.

4. **All work traces to a research question.** If you can't explain what question an experiment is trying to answer, it shouldn't run.

5. **Control plane, not execution plane.** Autoresearch orchestrates. Agents run wherever they run and report back.

6. **Board-level visibility.** The dashboard answers: what's being tested, what are the results, how much is it costing, and what have we learned?

## User Flow

1. Open the dashboard, create a new research project
2. Define the research question: "Optimize Rust JSON parsing throughput"
3. Add researcher agents — an explorer for broad search, an optimizer for refinement, a reviewer for validation
4. Set compute budget — per project and per agent
5. Start agents — they begin running the experiment loop autonomously
6. Monitor the dashboard — see live experiments, metric trends, cost burn, and findings

## Guidelines

There are two runtime modes:

- `local_trusted` (default): single-user local trusted deployment
- `authenticated`: login-required mode for shared deployments

## Specific Design Goals

1. **Time-to-first-experiment under 5 minutes**
   Fresh install → create project → add agent → see first experiment result.

2. **Board-level abstraction always wins**
   Default UI answers: what's running, what improved, what was learned, and what it cost.

3. **Output-first**
   Work is not done until the metric result and analysis are visible.

4. **Safe autonomy**
   Autonomous loops are allowed; hidden compute burn is not.

5. **Local-first, cloud-ready**
   Same mental model for local solo use and shared deployment.