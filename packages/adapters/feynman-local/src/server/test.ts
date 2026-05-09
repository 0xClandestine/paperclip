import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import { asString, parseObject, ensurePathInEnv } from "@paperclipai/adapter-utils/server-utils";
import {
  ensureAdapterExecutionTargetCommandResolvable,
  maybeRunSandboxInstallCommand,
  runAdapterExecutionTargetProcess,
  describeAdapterExecutionTarget,
  resolveAdapterExecutionTargetCwd,
} from "@paperclipai/adapter-utils/execution-target";
import { SANDBOX_INSTALL_COMMAND } from "../index.js";

function summarizeStatus(checks: AdapterEnvironmentCheck[]): AdapterEnvironmentTestResult["status"] {
  if (checks.some((c) => c.level === "error")) return "fail";
  if (checks.some((c) => c.level === "warn")) return "warn";
  return "pass";
}

function firstNonEmptyLine(text: string): string {
  return text.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";
}

function normalizeEnv(input: unknown): Record<string, string> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return {};
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value === "string") env[key] = value;
  }
  return env;
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = parseObject(ctx.config);
  const command = asString(config.command, "feynman");
  const target = ctx.executionTarget ?? null;
  const cwd = resolveAdapterExecutionTargetCwd(target, asString(config.cwd, ""), process.cwd());
  const configEnv = normalizeEnv(parseObject(config.env));
  const runId = `feynman-envtest-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const runtimeEnv = Object.fromEntries(
    Object.entries(ensurePathInEnv({ ...process.env, ...configEnv })).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );

  const targetLabel = target?.kind === "remote"
    ? ctx.environmentName ?? describeAdapterExecutionTarget(target)
    : null;
  if (targetLabel) {
    checks.push({
      code: "feynman_environment_target",
      level: "info",
      message: `Probing inside environment: ${targetLabel}`,
    });
  }

  // 1. Sandbox install if applicable
  const sandboxCheck = await maybeRunSandboxInstallCommand({
    runId,
    target,
    adapterKey: "feynman",
    installCommand: SANDBOX_INSTALL_COMMAND,
    detectCommand: command,
  });
  if (sandboxCheck) {
    checks.push(sandboxCheck);
    if (sandboxCheck.level === "error") {
      return { adapterType: "feynman_local", status: "fail", checks, testedAt: new Date().toISOString() };
    }
  }

  // 2. Check feynman is resolvable
  try {
    await ensureAdapterExecutionTargetCommandResolvable(command, target, cwd, runtimeEnv, {
      installCommand: SANDBOX_INSTALL_COMMAND,
    });
    checks.push({
      code: "feynman_cli_found",
      level: "info",
      message: `"${command}" is available`,
    });
  } catch {
    checks.push({
      code: "feynman_cli_missing",
      level: "error",
      message: `"${command}" not found. Install with: ${SANDBOX_INSTALL_COMMAND}`,
    });
    return { adapterType: "feynman_local", status: "fail", checks, testedAt: new Date().toISOString() };
  }

  // 3. Run `feynman --version` to confirm it responds
  try {
    const result = await runAdapterExecutionTargetProcess(
      runId,
      target,
      command,
      ["--version"],
      {
        cwd,
        env: runtimeEnv,
        timeoutSec: 15,
        graceSec: 5,
        onLog: async () => {},
      },
    );
    const versionLine = firstNonEmptyLine(result.stdout) || firstNonEmptyLine(result.stderr);
    if ((result.exitCode ?? 0) === 0) {
      checks.push({
        code: "feynman_version",
        level: "info",
        message: versionLine || "ok",
      });
    } else {
      checks.push({
        code: "feynman_version_failed",
        level: "warn",
        message: `exited ${result.exitCode ?? -1}: ${versionLine || "(no output)"}`,
      });
    }
  } catch (err) {
    checks.push({
      code: "feynman_version_error",
      level: "warn",
      message: err instanceof Error ? err.message : String(err),
    });
  }

  return {
    adapterType: "feynman_local",
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
