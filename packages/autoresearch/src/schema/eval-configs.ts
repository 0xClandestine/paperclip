import { pgTable, uuid, text, doublePrecision, timestamp } from "drizzle-orm/pg-core";

/**
 * Immutable eval configuration — one per research project.
 * Once created, the content and hash are locked. Only the score
 * and best-run tracking fields may be updated by the system.
 */
export const evalConfigs = pgTable("eval_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** FK to companies.id — nullable; a project can exist without an eval. */
  companyId: uuid("company_id").notNull().unique(),
  /** The eval script source code. */
  fileContent: text("file_content").notNull(),
  /** Display filename (e.g. "eval.sh"). */
  fileName: text("file_name").notNull(),
  /** SHA-256 of fileContent — used to verify immutability at runtime. */
  fileHash: text("file_hash").notNull(),
  /** "lower" means smaller scores are better (e.g. µs). "higher" means larger scores are better (e.g. accuracy). */
  direction: text("direction").notNull().default("lower"),
  /** Display label for the score unit (e.g. "µs", "mbps", "loss"). */
  scoreUnit: text("score_unit"),
  /** Running best score across all experiments in the project. */
  bestScore: doublePrecision("best_score"),
  /** The eval_run that achieved the bestScore. */
  bestRunId: uuid("best_run_id"),
  /** True once the config is locked — no further edits allowed. */
  lockedAt: timestamp("locked_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
