/**
 * Pure composer for `.claude/settings.json`.
 *
 * Everything in here is deterministic and side-effect free — the thin CLI
 * entry (`install.ts`) is what actually writes to disk.
 */

import { bashAllow, mcpAllow } from "./policy/allow";
import { bashDeny } from "./policy/deny";
import { enabledMcpServers } from "./policy/mcp";

export interface SettingsJson {
  permissions: {
    allow: string[];
    deny: string[];
  };
  enabledMcpjsonServers: string[];
}

function sortedUnique(patterns: readonly string[]): string[] {
  return [...new Set(patterns)].sort((a, b) => a.localeCompare(b));
}

/**
 * Throws if any pattern appears twice in the same list, or if the exact same
 * string appears in both allow and deny (which would make the policy
 * ambiguous at read-time even though Claude Code's DENY-beats-ALLOW rule
 * would resolve it).
 */
export function assertNoPolicyConflicts(
  allow: readonly string[],
  deny: readonly string[],
): void {
  const dupesIn = (list: readonly string[], label: string) => {
    const seen = new Set<string>();
    for (const p of list) {
      if (seen.has(p)) {
        throw new Error(`duplicate pattern in ${label}: ${p}`);
      }
      seen.add(p);
    }
  };
  dupesIn(allow, "allow");
  dupesIn(deny, "deny");
  const allowSet = new Set(allow);
  for (const p of deny) {
    if (allowSet.has(p)) {
      throw new Error(`pattern appears in both allow and deny: ${p}`);
    }
  }
}

export function composeSettings(): SettingsJson {
  const allow = sortedUnique([...bashAllow, ...mcpAllow]);
  const deny = sortedUnique([...bashDeny]);
  assertNoPolicyConflicts(allow, deny);
  return {
    permissions: { allow, deny },
    enabledMcpjsonServers: [...enabledMcpServers],
  };
}

export function serializeSettings(settings: SettingsJson): string {
  return `${JSON.stringify(settings, null, 2)}\n`;
}
