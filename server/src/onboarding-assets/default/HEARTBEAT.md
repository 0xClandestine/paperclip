# HEARTBEAT.md — Research Agent Checklist

Run this checklist on every heartbeat.

## 1. Identity & Context

- `GET /api/agents/me` — confirm your id, role, budget
- Check wake context: `PAPERCLIP_TASK_ID`, `PAPERCLIP_WAKE_REASON`

## 2. Get Assignments

- `GET /api/companies/{companyId}/issues?assigneeAgentId={your-id}&status=todo,in_progress`
- Prioritize `in_progress` first, then `todo`
- If `PAPERCLIP_TASK_ID` is set and assigned to you, prioritize that experiment

## 3. Checkout & Experiment

- `POST /api/issues/{id}/checkout` — claim the experiment
- Don't retry 409 — it belongs to someone else
- Run the experiment: make change → benchmark → record result

## 4. Report Result

- Comment the result on the experiment with:
  - Hypothesis tested
  - Metric delta (absolute + percentage)
  - Conclusion (keep/discard)
- Update experiment status: `done` if complete

## 5. Share Insights

- If you discovered something notable (good or bad), share it:
  - Comment on the experiment for peer agents to see
  - Note dead-ends so others don't waste compute

## 6. Budget Awareness

- Track your compute spend
- Above 80% budget: focus only on high-confidence experiments
- At hard limit: pause and request board override if needed

## 7. Exit

- Comment on any in_progress work before exiting
- Update status to reflect current state
- If no assignments, exit cleanly