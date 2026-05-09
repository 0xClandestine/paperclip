import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EvalDirection, EvalDisposition, EvalResult } from "./types.js";
import { hashEvalContent } from "./hasher.js";
import { parseScore } from "./parser.js";

export interface ExecuteEvalOptions {
  /** The eval script content. */
  fileContent: string;
  /** Display filename — used to determine the executor (extension). */
  fileName: string;
  /** Working directory — typically the project workspace root. */
  cwd: string;
  /** Max wall-clock time in milliseconds before the eval is killed. Default: 5 minutes. */
  timeoutMs?: number;
  /** The project's score direction — "lower" or "higher". */
  direction: EvalDirection;
  /** The current running best score (null if no experiments yet). */
  bestScore: number | null;
}

/**
 * Execute the eval script in a temp directory, capture output,
 * parse the score, and determine disposition.
 */
export async function executeEval(opts: ExecuteEvalOptions): Promise<EvalResult> {
  const timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000;
  const evalHash = hashEvalContent(opts.fileContent);

  // Write eval to a temp file so we can execute it
  const tmpDir = await mkdtemp(join(tmpdir(), "autoresearch-eval-"));
  const evalPath = join(tmpDir, opts.fileName);

  try {
    await writeFile(evalPath, opts.fileContent, { mode: 0o755 });

    const start = performance.now();
    const { exitCode, stdout, stderr } = await spawnAndCapture(evalPath, opts.cwd, timeoutMs);
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
        evalHashAtRun: evalHash,
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
      evalHashAtRun: evalHash,
      disposition,
    };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
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
        stdout: stdout.slice(0, 64 * 1024), // cap at 64KB
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
  if (bestScore === null) return "keep"; // first experiment always keeps

  const improved =
    direction === "lower" ? score < bestScore : score > bestScore;

  return improved ? "keep" : "discard";
}
