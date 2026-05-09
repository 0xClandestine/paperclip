import type { AdapterModelProfileDefinition } from "@paperclipai/adapter-utils";

export const type = "feynman_local";
export const label = "Feynman (local)";

export const SANDBOX_INSTALL_COMMAND = "npm install -g @companion-ai/feynman";

export const models: Array<{ id: string; label: string }> = [];

export const modelProfiles: AdapterModelProfileDefinition[] = [];

export const agentConfigurationDoc = `# feynman_local agent configuration

Adapter: feynman_local

Feynman is an open-source AI research agent built on Pi (https://github.com/getcompanion-ai/feynman).
It ships with research-specific tools (web search, paper search, arXiv, citation lookup) and a
multi-agent deepresearch workflow built on top of Pi subagents. Use it when the agent's primary job
is research — literature review, hypothesis generation, experiment design — rather than code editing.

Core fields:
- cwd (string, optional): working directory for the agent process (created if missing)
- instructionsFilePath (string, optional): path to a markdown instructions file appended to system prompt via --append-system-prompt
- model (string, optional): model spec in Pi provider/model format (e.g. anthropic/claude-opus-4-6, openai/gpt-4o)
- thinking (string, optional): thinking level passed to Pi via --thinking (off, minimal, low, medium, high, xhigh)
- command (string, optional): defaults to "feynman"
- extraArgs (string[], optional): additional CLI args forwarded verbatim to feynman
- env (object, optional): KEY=VALUE environment variables

Operational fields:
- timeoutSec (number, optional): run timeout in seconds (0 = no timeout)
- graceSec (number, optional): SIGTERM grace period in seconds (default 20)

Notes:
- Feynman sessions are persisted in ~/.feynman/sessions/paperclips/ and resumed across heartbeats.
- The --mode json flag is always passed so Paperclip can parse Pi JSONL output.
- Feynman manages its own tool set (web search, paper search, etc.) — do not pass --tools.
- Install Feynman with: npm install -g @companion-ai/feynman
- Use \`feynman setup\` on first run to configure the model provider and API key.
`;
