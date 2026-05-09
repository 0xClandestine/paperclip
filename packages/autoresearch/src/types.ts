import type { evalConfigs } from "./schema/eval-configs.js";
import type { evalRuns } from "./schema/eval-runs.js";

export type EvalDirection = "lower" | "higher";
export const EVAL_DIRECTIONS: readonly EvalDirection[] = ["lower", "higher"] as const;

export type EvalDisposition = "keep" | "discard" | "crash";
export const EVAL_DISPOSITIONS: readonly EvalDisposition[] = ["keep", "discard", "crash"] as const;

/** Row shape for eval_configs. */
export type EvalConfig = typeof evalConfigs.$inferSelect;
export type NewEvalConfig = typeof evalConfigs.$inferInsert;

/** Row shape for eval_runs. */
export type EvalRun = typeof evalRuns.$inferSelect;
export type NewEvalRun = typeof evalRuns.$inferInsert;

/** The parsed result of executing the eval. */
export interface EvalResult {
  score: number | null;
  rawOutput: string;
  rawStderr: string;
  exitCode: number;
  durationMs: number;
  disposition: EvalDisposition;
}

/** A point in the experiment time series for charting. */
export interface ExperimentDataPoint {
  id: string;
  /** Sequential experiment number within the project. */
  index: number;
  /** The measured score. null if crash. */
  score: number | null;
  /** keep / discard / crash. */
  disposition: EvalDisposition;
  /** Compute cost in cents for this experiment. */
  costCents: number;
  /** Git commit hash from the experiment. */
  commitHash: string | null;
  /** Timestamp of the experiment. */
  occurredAt: Date;
  /** Whether this experiment set a new best score. */
  isBest: boolean;
  /** The running best score at this point in the series. */
  runningBestScore: number | null;
  /** Cumulative cost in cents up to and including this experiment. */
  cumulativeCostCents: number;
}

/** Full chart payload returned by the dashboard API. */
export interface EvalChartData {
  direction: EvalDirection;
  scoreUnit: string | null;
  bestScore: number | null;
  bestRunId: string | null;
  totalExperiments: number;
  points: ExperimentDataPoint[];
}
