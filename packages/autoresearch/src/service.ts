import { eq, asc } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { evalConfigs, evalRuns } from "@paperclipai/db";
import { executeEval } from "./executor.js";
import type {
  EvalConfig,
  NewEvalConfig,
  EvalRun,
  EvalResult,
  EvalChartData,
  ExperimentDataPoint,
  EvalDirection,
} from "./types.js";

export interface CreateEvalConfigInput {
  companyId: string;
  repoUrl: string;
  evalPath: string;
  direction: EvalDirection;
  scoreUnit?: string | null;
  timeoutMs?: number;
}

export interface RunEvalInput {
  evalConfigId: string;
  issueId: string;
  heartbeatRunId?: string | null;
  /** The working directory — cloned repo root for this experiment. */
  cwd: string;
}

export function autoresearchService(db: PostgresJsDatabase) {
  const drizzle = db;

  // ── Config ──────────────────────────────────────────────

  async function createConfig(input: CreateEvalConfigInput): Promise<EvalConfig> {
    const [row] = await drizzle
      .insert(evalConfigs)
      .values({
        companyId: input.companyId,
        repoUrl: input.repoUrl,
        evalPath: input.evalPath,
        direction: input.direction,
        scoreUnit: input.scoreUnit ?? null,
        timeoutMs: input.timeoutMs ?? 300_000,
      } satisfies NewEvalConfig)
      .returning();

    return row!;
  }

  async function getConfigByCompanyId(companyId: string): Promise<EvalConfig | null> {
    const [row] = await drizzle
      .select()
      .from(evalConfigs)
      .where(eq(evalConfigs.companyId, companyId));
    return row ?? null;
  }

  async function lockBaseline(companyId: string, ref: string): Promise<EvalConfig | null> {
    const [row] = await drizzle
      .update(evalConfigs)
      .set({
        baselineRef: ref,
        lockedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(evalConfigs.companyId, companyId))
      .returning();
    return row ?? null;
  }

  // ── Run ─────────────────────────────────────────────────

  async function runEval(input: RunEvalInput): Promise<EvalResult> {
    const config = await drizzle
      .select()
      .from(evalConfigs)
      .where(eq(evalConfigs.id, input.evalConfigId))
      .then((rows) => rows[0] ?? null);

    if (!config) {
      return {
        score: null,
        rawOutput: "",
        rawStderr: "Eval config not found",
        exitCode: -1,
        durationMs: 0,
        disposition: "crash",
      };
    }

    const result = await executeEval({
      cwd: input.cwd,
      evalPath: config.evalPath,
      timeoutMs: config.timeoutMs,
      direction: config.direction as EvalDirection,
      bestScore: config.bestScore ?? null,
    });

    // Persist the run
    await drizzle.insert(evalRuns).values({
      evalConfigId: config.id,
      issueId: input.issueId,
      heartbeatRunId: input.heartbeatRunId ?? null,
      score: result.score,
      rawOutput: result.rawOutput,
      rawStderr: result.rawStderr,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      baselineRef: config.baselineRef,
      disposition: result.disposition,
    });

    // Update best score if this was a keep
    if (result.disposition === "keep" && result.score !== null) {
      await drizzle
        .update(evalConfigs)
        .set({
          bestScore: result.score,
          updatedAt: new Date(),
        })
        .where(eq(evalConfigs.id, config.id));
    }

    return result;
  }

  async function getRunById(id: string): Promise<EvalRun | null> {
    const [row] = await drizzle.select().from(evalRuns).where(eq(evalRuns.id, id));
    return row ?? null;
  }

  async function listRuns(configId: string): Promise<EvalRun[]> {
    return drizzle
      .select()
      .from(evalRuns)
      .where(eq(evalRuns.evalConfigId, configId))
      .orderBy(asc(evalRuns.createdAt));
  }

  // ── Chart data ──────────────────────────────────────────

  async function getChartData(companyId: string): Promise<EvalChartData | null> {
    const config = await getConfigByCompanyId(companyId);
    if (!config) return null;

    const runs = await drizzle
      .select()
      .from(evalRuns)
      .where(eq(evalRuns.evalConfigId, config.id))
      .orderBy(asc(evalRuns.createdAt));

    let runningBest: number | null = null;
    let cumulativeCost = 0;
    const points: ExperimentDataPoint[] = [];

    for (let i = 0; i < runs.length; i++) {
      const run = runs[i]!;
      const score = run.score;
      const isBest = score !== null && (runningBest === null ||
        (config.direction === "lower" ? score < runningBest : score > runningBest));

      if (isBest && score !== null) {
        runningBest = score;
      }

      points.push({
        id: run.id,
        index: i + 1,
        score,
        disposition: (run.disposition as ExperimentDataPoint["disposition"]) ?? "crash",
        costCents: 0,
        commitHash: null,
        occurredAt: run.createdAt,
        isBest,
        runningBestScore: runningBest,
        cumulativeCostCents: cumulativeCost,
      });
    }

    return {
      direction: config.direction as EvalDirection,
      scoreUnit: config.scoreUnit,
      bestScore: config.bestScore ?? null,
      bestRunId: config.bestRunId,
      totalExperiments: runs.length,
      points,
    };
  }

  return {
    createConfig,
    getConfigByCompanyId,
    lockBaseline,
    runEval,
    getRunById,
    listRuns,
    getChartData,
  };
}
