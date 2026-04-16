/**
 * I/O primitives for dev-tools scripts — subprocess spawning, file atomic
 * writes, age key handling, op CLI wrappers. Pure orchestration logic (plan,
 * classify, parse) stays in the calling scripts; this module owns side-effects.
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

export function die(msg: string): never {
  console.error(`sync-secrets: ${msg}`);
  process.exit(1);
}

export function resolveWorkspaceRoot(): string {
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

export function ageKeyPath(): string {
  return (
    process.env.SOPS_AGE_KEY_FILE ??
    join(homedir(), ".config/sops/age/keys.txt")
  );
}

export function readAgePublicKey(keyPath: string): string {
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

export interface RunResult {
  stdout: Uint8Array;
  stderr: string;
  exitCode: number;
}

export async function run(
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

export async function checkOp(): Promise<void> {
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

export type OpReadResult =
  | { ok: true; value: string }
  | { ok: false; stderr: string };

export async function opRead(ref: string): Promise<OpReadResult> {
  const { stdout, stderr, exitCode } = await run([
    "op",
    "read",
    "--no-newline",
    ref,
  ]);
  if (exitCode !== 0) {
    return { ok: false, stderr: stderr.trim() };
  }
  return { ok: true, value: new TextDecoder().decode(stdout) };
}

export async function ageEncrypt(
  body: string,
  pubkey: string,
): Promise<Uint8Array> {
  const { stdout, stderr, exitCode } = await run(["age", "-r", pubkey], {
    stdin: body,
  });
  if (exitCode !== 0) {
    die(`age encryption failed: ${stderr.trim() || "(no stderr)"}`);
  }
  return stdout;
}

// POSIX single-quote for the .envrc dotenv body that direnv evals.
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function writeAtomic(path: string, data: Uint8Array | string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}
