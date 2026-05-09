import { pgTable, uuid, text, doublePrecision, integer, timestamp, index } from "drizzle-orm/pg-core";
import { evalConfigs } from "./eval-configs.js";

/**
 * One record per experiment run — the system records the eval
 * output automatically after every agent commit.
 */
export const evalRuns = pgTable(
  "eval_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The eval config that was used. */
    evalConfigId: uuid("eval_config_id").notNull().references(() => evalConfigs.id),
    /** FK to issues.id — the experiment being measured. */
    issueId: uuid("issue_id").notNull(),
    /** FK to heartbeat_runs.id — the agent run that produced the code change. */
    heartbeatRunId: uuid("heartbeat_run_id"),
    /** The parsed numeric score. null if eval crashed. */
    score: doublePrecision("score"),
    /** Full stdout from the eval process. */
    rawOutput: text("raw_output"),
    /** Full stderr from the eval process. */
    rawStderr: text("raw_stderr"),
    /** Exit code — 0 = success, non-zero = crash. */
    exitCode: integer("exit_code"),
    /** Wall-clock duration of eval execution in milliseconds. */
    durationMs: integer("duration_ms"),
    /** SHA-256 of the eval file at time of execution (provenance). */
    evalHashAtRun: text("eval_hash_at_run"),
    /** Disposition determined by the system. */
    disposition: text("disposition").notNull().default("keep"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    configIssueIdx: index("eval_runs_config_issue_idx").on(table.evalConfigId, table.issueId),
    configCreatedIdx: index("eval_runs_config_created_idx").on(table.evalConfigId, table.createdAt),
  }),
);
