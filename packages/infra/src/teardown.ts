#!/usr/bin/env bun
/**
 * `bun run infra:teardown --force` — detaches the custom domain.
 *
 * Destructive. Requires `--force`; without it, prints the intent and exits 1.
 */

import { infra } from "./infra.config";
import { teardownCustomDomain } from "./providers/custom-domain";

export async function run(argv: string[]): Promise<number> {
  const force = argv.includes("--force");
  if (!force) {
    console.error(
      "teardown: destructive operation. Re-run with --force to confirm " +
        `detaching custom domain ${infra.customDomain.hostname} from worker ${infra.worker.name}.`,
    );
    return 1;
  }

  const result = await teardownCustomDomain(infra);
  if (result === "detached") {
    console.log(`detached ${infra.customDomain.hostname}`);
  } else {
    console.log(
      `no custom domain found for ${infra.customDomain.hostname} \u2014 skipping`,
    );
  }
  return 0;
}

if (import.meta.main) {
  run(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
