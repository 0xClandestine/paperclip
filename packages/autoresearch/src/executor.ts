import { spawn } from "node:child_process";
import { join } from "node:path";
import type { EvalDirection, EvalDisposition, EvalResult } from "./types.js";
import { parseScore } from "./parser.js";

export interface ExecuteEvalOptions {
  /** Working directory — typically the cloned repo root. */
  cwd: string;
  /** Path to the eval file relative to cwd (e.g. "eval.sh", "bench/eval.py"). */
  evalPath: string;
  /** Max wall-clock time in milliseconds before the eval is killed. */
  timeoutMs: number;
  /** The project's score direction — "lower" or "higher". */
  direction: EvalDirection;
  /** The current running best score (null if no experiments yet). */
  bestScore: number | null;
}

/**
 * Execute the eval script in the repo working directory,
 * capture output, parse the score, and determine disposition.
 */
export async function executeEval(opts: ExecuteEvalOptions): Promise<EvalResult> {
  const evalFullPath = join(opts.cwd, opts.evalPath);

  const start = performance.now();
  const { exitCode, stdout, stderr } = await spawnAndCapture(evalFullPath, opts.cwd, opts.timeoutMs);
  const durationMs = Math.round(performance.now() - start);

  const rawOutput = stdout.trim();
  const rawStderr = stderr.trim();

  if (exitCode !== 0) {
    return {
      score: null,
      rawOutput,
      rawStderr,
      exitCode,
      durationMs,
      disposition: "crash",
    };
  }

  const score = parseScore(rawOutput);
  const disposition = determineDisposition(score, opts.direction, opts.bestScore);

  return {
    score,
    rawOutput,
    rawStderr,
    exitCode,
    durationMs,
    disposition,
  };
}

function spawnAndCapture(
  command: string,
  cwd: string,
  timeoutMs: number,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: timeoutMs,
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString("utf8");
    });
    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString("utf8");
    });

    child.on("error", (err) => {
      reject(err);
    });

    child.on("close", (code) => {
      resolve({
        exitCode: code ?? -1,
        stdout: stdout.slice(0, 64 * 1024),
        stderr: stderr.slice(0, 64 * 1024),
      });
    });
  });
}

function determineDisposition(
  score: number | null,
  direction: EvalDirection,
  bestScore: number | null,
): EvalDisposition {
  if (score === null) return "crash";
  if (bestScore === null) return "keep";

  const improved =
    direction === "lower" ? score < bestScore : score > bestScore;

  return improved ? "keep" : "discard";
}
