# Autoresearch Control Plane

**Autoresearch is the control plane for autonomous experiment loops.** We build the infrastructure that AI researchers run on. Our goal is for Autoresearch-powered experiments to collectively produce meaningful discoveries across engineering, science, and machine learning. Every decision we make should serve that: make autonomous experiments more capable, more governable, more scalable, and more real.

## The Vision

Autonomous experiment loops — AI agents that form hypotheses, run benchmarks, and iterate — will become a primary engine of discovery. Not one experiment. Thousands. An entire research layer that runs on AI labor, coordinated through Autoresearch.

Autoresearch is not the researcher. Autoresearch is what makes the experiments possible. We are the control plane, the nervous system, the operating layer. Every research project needs structure, metric tracking, compute budget control, and human governance. That's us.

The measure of our success is not whether one experiment works. It's whether Autoresearch becomes the default foundation that autonomous experiment loops are built on — and whether those experiments, collectively, produce discoveries that matter.

## The Problem

Experiment management doesn't go far enough. When your researchers are AI agents running loops autonomously, you need more than a benchmark script — you need a **control plane** for an entire research program.

## What This Is

Autoresearch is the command, monitoring, and control plane for autonomous experiment loops. It is the single place where you:

- **Manage research projects** — create projects, define research questions, set compute budgets
- **Orchestrate researcher agents** — explorer, optimizer, and reviewer agents that run the loop
- **Track experiments in real time** — see every hypothesis, metric change, and keep/discard decision
- **Control compute costs** — token and GPU budgets per project and agent, spend tracking, hard stops
- **Preserve research context** — experiment history, findings, dead ends, and analysis stay attached to the project

## Architecture

Two layers:

### 1. Control Plane (this software)

Manages:
- Research project lifecycle
- Researcher agent orchestration
- Experiment assignment and status tracking
- Compute budget and cost tracking
- Findings and analysis documents
- Heartbeat-based experiment loop triggering

### 2. Execution Services (adapters)

Agents run externally and report results. Adapters connect different execution environments:
- Local CLI/session adapters (Claude, Codex, Gemini, Pi, Cursor)
- Process adapters (any shell command)
- HTTP/webhook adapters
- External adapter plugins

The control plane doesn't run benchmarks. It orchestrates them. Agents run wherever they run and phone home.

## Core Principle

You should be able to look at the dashboard and understand your entire research program at a glance — what's being tested, what the results are, how much compute is being used, and whether it's working.