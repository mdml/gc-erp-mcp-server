#!/usr/bin/env bun
/**
 * sync-secrets — pull secrets from 1Password → /.envrc.enc + packages/mcp-server/.dev.vars
 *
 * Prereqs:
 *   - `op` (1Password CLI) installed and signed in.
 *   - age key present at ~/.config/sops/age/keys.txt (or $SOPS_AGE_KEY_FILE).
 *
 * Re-run to rotate: both files regenerate from 1Password.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { SECRETS, type SecretSpec } from "./secrets.config";

const MCP_SERVER_REL = "packages/mcp-server";

function die(msg: string): never {
  console.error(`sync-secrets: ${msg}`);
  process.exit(1);
}

function resolveWorkspaceRoot(): string {
  // The script is run via `bun run src/sync-secrets.ts` from packages/dev-tools
  // (via `turbo run sync-secrets`). Walk up to the workspace root — the
  // package.json that declares `workspaces`.
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    const pkgPath = join(dir, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
        if (pkg.workspaces) return dir;
      } catch {
        // fall through
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  die(
    "could not locate workspace root (no package.json with 'workspaces' found walking up from cwd)",
  );
}

function ageKeyPath(): string {
  return (
    process.env.SOPS_AGE_KEY_FILE ??
    join(homedir(), ".config/sops/age/keys.txt")
  );
}

function readAgePublicKey(keyPath: string): string {
  if (!existsSync(keyPath)) {
    die(
      `age key not found at ${keyPath}\n` +
        `  create one with: age-keygen -o "${keyPath}"\n` +
        `  (or set SOPS_AGE_KEY_FILE to an existing key)`,
    );
  }
  const contents = readFileSync(keyPath, "utf8");
  const match = contents.match(/^#\s*public key:\s*(age1[a-z0-9]+)\s*$/m);
  if (!match) {
    die(
      `could not parse '# public key: age1…' line from ${keyPath} — is this a valid age key file?`,
    );
  }
  return match[1];
}

interface RunResult {
  stdout: Uint8Array;
  stderr: string;
  exitCode: number;
}

async function run(
  cmd: string[],
  opts: { stdin?: string } = {},
): Promise<RunResult> {
  const proc = Bun.spawn(cmd, {
    stdout: "pipe",
    stderr: "pipe",
    stdin: opts.stdin !== undefined ? new Response(opts.stdin) : "ignore",
    env: { ...process.env },
  });
  const [stdoutBuf, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).arrayBuffer(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return {
    stdout: new Uint8Array(stdoutBuf),
    stderr,
    exitCode,
  };
}

async function checkOp(): Promise<void> {
  const version = await run(["op", "--version"]).catch(() => null);
  if (!version || version.exitCode !== 0) {
    die(
      "1Password CLI ('op') not found on PATH.\n" +
        "  install: https://developer.1password.com/docs/cli/get-started/",
    );
  }
  const account = await run(["op", "account", "list"]);
  if (account.exitCode !== 0) {
    die(
      "'op' is installed but not signed in.\n" +
        "  sign in with: eval $(op signin)\n" +
        `  (op error: ${account.stderr.trim().split("\n")[0]})`,
    );
  }
}

async function opRead(ref: string): Promise<string> {
  const { stdout, stderr, exitCode } = await run([
    "op",
    "read",
    "--no-newline",
    ref,
  ]);
  if (exitCode !== 0) {
    die(`op read failed for ${ref}\n  ${stderr.trim()}`);
  }
  return new TextDecoder().decode(stdout);
}

async function ageEncrypt(body: string, pubkey: string): Promise<Uint8Array> {
  const { stdout, stderr, exitCode } = await run(["age", "-r", pubkey], {
    stdin: body,
  });
  if (exitCode !== 0) {
    die(`age encryption failed: ${stderr.trim() || "(no stderr)"}`);
  }
  return stdout;
}

// Quote for the dotenv body that .envrc evals through shell.
// Wrap in single quotes and escape embedded single quotes the POSIX way.
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function writeAtomic(path: string, data: Uint8Array | string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

function filterTargets(target: "envrc" | "dev-vars"): SecretSpec[] {
  return SECRETS.filter((s) => s.targets.includes(target));
}

async function main() {
  const root = resolveWorkspaceRoot();
  const keyPath = ageKeyPath();
  const pubkey = readAgePublicKey(keyPath);

  await checkOp();

  console.log(
    `sync-secrets: pulling ${SECRETS.length} secret(s) from 1Password…`,
  );
  const values: Record<string, string> = {};
  for (const spec of SECRETS) {
    process.stdout.write(`  • ${spec.name} ← ${spec.opRef}\n`);
    values[spec.name] = await opRead(spec.opRef);
  }

  const envrcSecrets = filterTargets("envrc");
  const devVarsSecrets = filterTargets("dev-vars");

  const envrcBody = `${envrcSecrets
    .map((s) => `${s.name}=${shellQuote(values[s.name])}`)
    .join("\n")}\n`;
  const encrypted = await ageEncrypt(envrcBody, pubkey);
  const envrcEncPath = join(root, ".envrc.enc");
  writeAtomic(envrcEncPath, encrypted);

  const devVarsBody = `${devVarsSecrets.map((s) => `${s.name}=${values[s.name]}`).join("\n")}\n`;
  const devVarsPath = join(root, MCP_SERVER_REL, ".dev.vars");
  writeAtomic(devVarsPath, devVarsBody);

  console.log();
  console.log(
    `  /.envrc.enc                      ← ${envrcSecrets.map((s) => s.name).join(", ")}`,
  );
  console.log(
    `  /${MCP_SERVER_REL}/.dev.vars  ← ${devVarsSecrets.map((s) => s.name).join(", ")}`,
  );
  console.log();
  console.log(`age recipient: ${pubkey}`);
  console.log(`age key:       ${keyPath}`);
  console.log();
  console.log("next: direnv reload   (then: turbo run deploy)");
}

main().catch((err) => {
  console.error("sync-secrets: unexpected error");
  console.error(err);
  process.exit(1);
});
