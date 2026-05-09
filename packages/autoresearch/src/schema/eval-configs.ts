import { pgTable, uuid, text, doublePrecision, integer, timestamp } from "drizzle-orm/pg-core";

/**
 * Repo-centric eval configuration — one per research project.
 *
 * The eval is a file inside the project's GitHub repo. The system
 * pins a specific git ref (commit hash) as the "eval baseline."
 * Once the baseline is locked, the eval cannot change for this project.
 *
 * If the eval needs to change, create a new research project.
 */
export const evalConfigs = pgTable("eval_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** FK to companies.id — one eval config per project. */
  companyId: uuid("company_id").notNull().unique(),
  /** GitHub repo URL (e.g. "https://github.com/owner/json-parsers"). */
  repoUrl: text("repo_url").notNull(),
  /** Path to the eval file within the repo (e.g. "eval.sh", "bench/eval.py"). */
  evalPath: text("eval_path").notNull(),
  /** Pinned git ref (commit hash) that locks the eval. Once set, immutable. */
  baselineRef: text("baseline_ref"),
  /**
   * "lower" means smaller scores are better (e.g. µs).
   * "higher" means larger scores are better (e.g. throughput, accuracy).
   */
  direction: text("direction").notNull().default("lower"),
  /** Display label for the score unit (e.g. "µs", "mbps", "loss"). */
  scoreUnit: text("score_unit"),
  /**
   * Timeout in milliseconds for eval execution.
   * Default 300_000 (5 minutes). Set to 0 for no timeout.
   */
  timeoutMs: integer("timeout_ms").notNull().default(300_000),
  /** Running best score across all experiments in the project. */
  bestScore: doublePrecision("best_score"),
  /** The eval_run that achieved the bestScore. */
  bestRunId: uuid("best_run_id"),
  /** True once baselineRef is set — no further edits allowed. */
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
