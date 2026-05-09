import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inferOpenAiCompatibleBiller, type AdapterExecutionContext, type AdapterExecutionResult } from "@paperclipai/adapter-utils";
import {
  ensureAdapterExecutionTargetCommandResolvable,
  ensureAdapterExecutionTargetRuntimeCommandInstalled,
  readAdapterExecutionTarget,
  resolveAdapterExecutionTargetCommandForLogs,
  runAdapterExecutionTargetProcess,
} from "@paperclipai/adapter-utils/execution-target";
import {
  asString,
  asNumber,
  asStringArray,
  parseObject,
  applyPaperclipWorkspaceEnv,
  buildPaperclipEnv,
  joinPromptSections,
  buildInvocationEnvForLogs,
  ensureAbsoluteDirectory,
  ensurePathInEnv,
  renderTemplate,
  renderPaperclipWakePrompt,
  shapePaperclipWorkspaceEnvForExecution,
  stringifyPaperclipWakePayload,
  readPaperclipIssueWorkModeFromContext,
  DEFAULT_PAPERCLIP_AGENT_PROMPT_TEMPLATE,
} from "@paperclipai/adapter-utils/server-utils";
import { parseFeynmanJsonl, isFeynmanUnknownSessionError } from "./parse.js";
import { SANDBOX_INSTALL_COMMAND } from "../index.js";

/** Base directory where Paperclip-managed Feynman sessions are stored. */
const FEYNMAN_SESSIONS_DIR = path.join(os.homedir(), ".feynman", "sessions", "paperclips");

function parseModelProvider(model: string | null): string | null {
  if (!model) return null;
  const trimmed = model.trim();
  if (!trimmed.includes("/")) return null;
  return trimmed.slice(0, trimmed.indexOf("/")).trim() || null;
}

async function ensureSessionDir(sessionDir: string): Promise<void> {
  await fs.mkdir(sessionDir, { recursive: true });
}

function buildSessionDir(agentId: string): string {
  return path.join(FEYNMAN_SESSIONS_DIR, agentId);
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { runId, agent, runtime, config, context, onLog, onMeta, onSpawn, authToken } = ctx;
  const executionTarget = readAdapterExecutionTarget({
    executionTarget: ctx.executionTarget,
    legacyRemoteExecution: ctx.executionTransport?.remoteExecution,
  });

  const promptTemplate = asString(config.promptTemplate, DEFAULT_PAPERCLIP_AGENT_PROMPT_TEMPLATE);
  const command = asString(config.command, "feynman");
  const model = asString(config.model, "").trim();
  const thinking = asString(config.thinking, "").trim();
  const provider = parseModelProvider(model);

  const workspaceContext = parseObject(context.paperclipWorkspace);
  const workspaceCwd = asString(workspaceContext.cwd, "");
  const workspaceSource = asString(workspaceContext.source, "");
  const workspaceId = asString(workspaceContext.workspaceId, "");
  const workspaceRepoUrl = asString(workspaceContext.repoUrl, "");
  const workspaceRepoRef = asString(workspaceContext.repoRef, "");
  const agentHome = asString(workspaceContext.agentHome, "");
  const workspaceHints = Array.isArray(context.paperclipWorkspaces)
    ? context.paperclipWorkspaces.filter(
        (value): value is Record<string, unknown> => typeof value === "object" && value !== null,
      )
    : [];
  const configuredCwd = asString(config.cwd, "");
  const useConfiguredInsteadOfAgentHome = workspaceSource === "agent_home" && configuredCwd.length > 0;
  const effectiveWorkspaceCwd = useConfiguredInsteadOfAgentHome ? "" : workspaceCwd;
  const cwd = effectiveWorkspaceCwd || configuredCwd || process.cwd();
  const shapedWorkspaceEnv = shapePaperclipWorkspaceEnvForExecution({
    workspaceCwd: effectiveWorkspaceCwd,
    workspaceHints,
    executionTargetIsRemote: false,
    executionCwd: cwd,
  });
  await ensureAbsoluteDirectory(cwd, { createIfMissing: true });

  // Session dir: one directory per agent, Feynman manages individual session files inside
  const runtimeSessionParams = parseObject(runtime.sessionParams);
  const savedSessionDir = asString(runtimeSessionParams.sessionId, "");
  const savedSessionCwd = asString(runtimeSessionParams.cwd, "");
  const sessionCwdMatches =
    savedSessionCwd.length === 0 || path.resolve(savedSessionCwd) === path.resolve(cwd);
  const canResumeSession = savedSessionDir.length > 0 && sessionCwdMatches;
  const sessionDir = canResumeSession ? savedSessionDir : buildSessionDir(agent.id);

  await ensureSessionDir(sessionDir);

  // Build env
  const envConfig = parseObject(config.env);
  const hasExplicitApiKey =
    typeof envConfig.PAPERCLIP_API_KEY === "string" && envConfig.PAPERCLIP_API_KEY.trim().length > 0;
  const env: Record<string, string> = { ...buildPaperclipEnv(agent) };
  env.PAPERCLIP_RUN_ID = runId;

  const wakeTaskId =
    (typeof context.taskId === "string" && context.taskId.trim().length > 0 && context.taskId.trim()) ||
    (typeof context.issueId === "string" && context.issueId.trim().length > 0 && context.issueId.trim()) ||
    null;
  const wakeReason =
    typeof context.wakeReason === "string" && context.wakeReason.trim().length > 0
      ? context.wakeReason.trim()
      : null;
  const wakeCommentId =
    (typeof context.wakeCommentId === "string" && context.wakeCommentId.trim().length > 0 && context.wakeCommentId.trim()) ||
    (typeof context.commentId === "string" && context.commentId.trim().length > 0 && context.commentId.trim()) ||
    null;
  const approvalId =
    typeof context.approvalId === "string" && context.approvalId.trim().length > 0
      ? context.approvalId.trim()
      : null;
  const approvalStatus =
    typeof context.approvalStatus === "string" && context.approvalStatus.trim().length > 0
      ? context.approvalStatus.trim()
      : null;
  const linkedIssueIds = Array.isArray(context.issueIds)
    ? context.issueIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  const wakePayloadJson = stringifyPaperclipWakePayload(context.paperclipWake);
  const issueWorkMode = readPaperclipIssueWorkModeFromContext(context);

  if (wakeTaskId) env.PAPERCLIP_TASK_ID = wakeTaskId;
  if (issueWorkMode) env.PAPERCLIP_ISSUE_WORK_MODE = issueWorkMode;
  if (wakeReason) env.PAPERCLIP_WAKE_REASON = wakeReason;
  if (wakeCommentId) env.PAPERCLIP_WAKE_COMMENT_ID = wakeCommentId;
  if (approvalId) env.PAPERCLIP_APPROVAL_ID = approvalId;
  if (approvalStatus) env.PAPERCLIP_APPROVAL_STATUS = approvalStatus;
  if (linkedIssueIds.length > 0) env.PAPERCLIP_LINKED_ISSUE_IDS = linkedIssueIds.join(",");
  if (wakePayloadJson) env.PAPERCLIP_WAKE_PAYLOAD_JSON = wakePayloadJson;
  applyPaperclipWorkspaceEnv(env, {
    workspaceCwd: shapedWorkspaceEnv.workspaceCwd,
    workspaceSource,
    workspaceId,
    workspaceRepoUrl,
    workspaceRepoRef,
    agentHome,
  });
  if (shapedWorkspaceEnv.workspaceHints.length > 0) {
    env.PAPERCLIP_WORKSPACES_JSON = JSON.stringify(shapedWorkspaceEnv.workspaceHints);
  }
  for (const [key, value] of Object.entries(envConfig)) {
    if (typeof value === "string") env[key] = value;
  }
  if (!hasExplicitApiKey && authToken) {
    env.PAPERCLIP_API_KEY = authToken;
  }

  const runtimeEnv = Object.fromEntries(
    Object.entries(ensurePathInEnv({ ...process.env, ...env })).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );

  const timeoutSec = asNumber(config.timeoutSec, 0);
  const graceSec = asNumber(config.graceSec, 20);

  await ensureAdapterExecutionTargetRuntimeCommandInstalled({
    runId,
    target: executionTarget,
    installCommand: ctx.runtimeCommandSpec?.installCommand,
    detectCommand: ctx.runtimeCommandSpec?.detectCommand,
    cwd,
    env: runtimeEnv,
    timeoutSec,
    graceSec,
    onLog,
  });
  await ensureAdapterExecutionTargetCommandResolvable(command, executionTarget, cwd, runtimeEnv, {
    installCommand: SANDBOX_INSTALL_COMMAND,
  });
  const resolvedCommand = await resolveAdapterExecutionTargetCommandForLogs(
    command,
    executionTarget,
    cwd,
    runtimeEnv,
  );
  const loggedEnv = buildInvocationEnvForLogs(env, {
    runtimeEnv,
    includeRuntimeKeys: ["HOME"],
    resolvedCommand,
  });

  // Build prompt
  const instructionsFilePath = asString(config.instructionsFilePath, "").trim();
  const resolvedInstructionsFilePath = instructionsFilePath
    ? path.resolve(cwd, instructionsFilePath)
    : "";
  const instructionsFileDir = instructionsFilePath ? `${path.dirname(instructionsFilePath)}/` : "";

  let systemPromptExtension = promptTemplate;
  let commandNotes: string[] = [];
  if (resolvedInstructionsFilePath) {
    try {
      const contents = await fs.readFile(resolvedInstructionsFilePath, "utf8");
      systemPromptExtension =
        `${contents}\n\n` +
        `The above agent instructions were loaded from ${resolvedInstructionsFilePath}. ` +
        `Resolve any relative file references from ${instructionsFileDir}.\n\n` +
        DEFAULT_PAPERCLIP_AGENT_PROMPT_TEMPLATE;
      commandNotes = [
        `Loaded agent instructions from ${resolvedInstructionsFilePath}`,
        `Appended instructions + path directive to system prompt.`,
      ];
    } catch (readErr) {
      await onLog(
        "stdout",
        `[paperclip] Warning: could not read agent instructions file "${resolvedInstructionsFilePath}": ${readErr instanceof Error ? readErr.message : String(readErr)}\n`,
      );
    }
  }

  const templateData = {
    agentId: agent.id,
    companyId: agent.companyId,
    runId,
    company: { id: agent.companyId },
    agent,
    run: { id: runId, source: "on_demand" },
    context,
  };
  const renderedSystemPromptExtension = renderTemplate(systemPromptExtension, templateData);
  const wakePrompt = renderPaperclipWakePrompt(context.paperclipWake, { resumedSession: canResumeSession });
  const renderedHeartbeatPrompt =
    canResumeSession && wakePrompt.length > 0 ? "" : renderTemplate(promptTemplate, templateData);
  const sessionHandoffNote = asString(context.paperclipSessionHandoffMarkdown, "").trim();
  const userPrompt = joinPromptSections([wakePrompt, sessionHandoffNote, renderedHeartbeatPrompt]);

  const promptMetrics = {
    systemPromptChars: renderedSystemPromptExtension.length,
    promptChars: userPrompt.length,
    wakePromptChars: wakePrompt.length,
    sessionHandoffChars: sessionHandoffNote.length,
    heartbeatPromptChars: renderedHeartbeatPrompt.length,
  };

  const extraArgs = (() => {
    const fromExtraArgs = asStringArray(config.extraArgs);
    if (fromExtraArgs.length > 0) return fromExtraArgs;
    return asStringArray(config.args);
  })();

  const buildArgs = (): string[] => {
    const args: string[] = [];

    args.push("--mode", "json");
    args.push("--session-dir", sessionDir);

    if (renderedSystemPromptExtension.trim()) {
      args.push("--append-system-prompt", renderedSystemPromptExtension);
    }

    if (model) args.push("--model", model);
    if (thinking) args.push("--thinking", thinking);

    if (extraArgs.length > 0) args.push(...extraArgs);

    // One-shot prompt via -p
    args.push("-p", userPrompt);

    return args;
  };

  const runAttempt = async () => {
    const args = buildArgs();
    if (onMeta) {
      await onMeta({
        adapterType: "feynman_local",
        command: resolvedCommand,
        cwd,
        commandNotes,
        commandArgs: args,
        env: loggedEnv,
        prompt: userPrompt,
        promptMetrics,
        context,
      });
    }

    let stdoutBuffer = "";
    const bufferedOnLog = async (stream: "stdout" | "stderr", chunk: string) => {
      if (stream === "stderr") {
        await onLog(stream, chunk);
        return;
      }
      stdoutBuffer += chunk;
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() || "";
      for (const line of lines) {
        if (line) await onLog(stream, line + "\n");
      }
    };

    const proc = await runAdapterExecutionTargetProcess(runId, executionTarget, command, args, {
      cwd,
      env: runtimeEnv,
      timeoutSec,
      graceSec,
      onSpawn,
      onLog: bufferedOnLog,
    });

    if (stdoutBuffer) await onLog("stdout", stdoutBuffer);

    return {
      proc,
      parsed: parseFeynmanJsonl(proc.stdout),
    };
  };

  const toResult = (
    attempt: Awaited<ReturnType<typeof runAttempt>>,
    clearSession = false,
  ): AdapterExecutionResult => {
    if (attempt.proc.timedOut) {
      return {
        exitCode: attempt.proc.exitCode,
        signal: attempt.proc.signal,
        timedOut: true,
        errorMessage: `Timed out after ${timeoutSec}s`,
        clearSession,
      };
    }

    const resolvedSessionId = clearSession ? null : sessionDir;
    const resolvedSessionParams = resolvedSessionId
      ? { sessionId: resolvedSessionId, cwd }
      : null;

    const rawExitCode = attempt.proc.exitCode;
    const parsedError = attempt.parsed.errors.find((e) => e.trim().length > 0) ?? "";
    const effectiveExitCode = (rawExitCode ?? 0) === 0 && parsedError ? 1 : rawExitCode;
    const stderrLine = attempt.proc.stderr.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";
    const fallbackErrorMessage =
      parsedError || stderrLine || `Feynman exited with code ${rawExitCode ?? -1}`;

    return {
      exitCode: effectiveExitCode,
      signal: attempt.proc.signal,
      timedOut: false,
      errorMessage: (effectiveExitCode ?? 0) === 0 ? null : fallbackErrorMessage,
      usage: {
        inputTokens: attempt.parsed.usage.inputTokens,
        outputTokens: attempt.parsed.usage.outputTokens,
        cachedInputTokens: attempt.parsed.usage.cachedInputTokens,
      },
      sessionId: resolvedSessionId,
      sessionParams: resolvedSessionParams,
      sessionDisplayId: resolvedSessionId,
      provider,
      biller: inferOpenAiCompatibleBiller(runtimeEnv, null) ?? provider ?? "unknown",
      model,
      billingType: "unknown",
      costUsd: attempt.parsed.usage.costUsd,
      resultJson: {
        stdout: attempt.proc.stdout,
        stderr: attempt.proc.stderr,
      },
      summary: attempt.parsed.finalMessage ?? attempt.parsed.messages.join("\n\n").trim(),
      clearSession,
    };
  };

  const initial = await runAttempt();
  const initialFailed =
    !initial.proc.timedOut &&
    ((initial.proc.exitCode ?? 0) !== 0 || initial.parsed.errors.length > 0);

  if (
    canResumeSession &&
    initialFailed &&
    isFeynmanUnknownSessionError(initial.proc.stdout, initial.proc.stderr)
  ) {
    await onLog(
      "stdout",
      `[paperclip] Feynman session "${sessionDir}" is unavailable; retrying with a fresh session.\n`,
    );
    const freshDir = buildSessionDir(`${agent.id}-${Date.now()}`);
    await ensureSessionDir(freshDir);
    const retry = await runAttempt();
    return toResult(retry, true);
  }

  return toResult(initial);
}
