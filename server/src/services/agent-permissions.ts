export type NormalizedAgentPermissions = Record<string, unknown> & {
  canCreateAgents: boolean;
};

// Autoresearch: no special role gets elevated permissions by default.
// All agents are peers. Board creates agents directly.
export function defaultPermissionsForRole(_role: string): NormalizedAgentPermissions {
  return {
    canCreateAgents: false,
  };
}

export function normalizeAgentPermissions(
  permissions: unknown,
  role: string,
): NormalizedAgentPermissions {
  const defaults = defaultPermissionsForRole(role);
  if (typeof permissions !== "object" || permissions === null || Array.isArray(permissions)) {
    return defaults;
  }

  const record = permissions as Record<string, unknown>;
  return {
    canCreateAgents:
      typeof record.canCreateAgents === "boolean"
        ? record.canCreateAgents
        : defaults.canCreateAgents,
  };
}
