#!/usr/bin/env bun
/**
 * `bun run infra:teardown --force` — detaches the custom domain, deletes the
 * D1 database, and deletes the R2 bucket.
 *
 * Destructive. Requires `--force`; without it, prints the intent and exits 1.
 */

import { infra } from "./infra.config";
import { teardownCustomDomain } from "./providers/custom-domain";
import { teardownD1 } from "./providers/d1";
import { teardownR2 } from "./providers/r2";

export async function run(argv: string[]): Promise<number> {
  const force = argv.includes("--force");
  if (!force) {
    console.error(
      "teardown: destructive operation. Re-run with --force to confirm:\n" +
        `  - detach custom domain ${infra.customDomain.hostname}\n` +
        `  - delete D1 database ${infra.d1.databaseName}\n` +
        `  - delete R2 bucket ${infra.r2.bucketName}`,
    );
    return 1;
  }

  const cdResult = await teardownCustomDomain(infra);
  if (cdResult === "detached") {
    console.log(`detached ${infra.customDomain.hostname}`);
  } else {
    console.log(
      `no custom domain found for ${infra.customDomain.hostname} \u2014 skipping`,
    );
  }

  const d1Result = await teardownD1(infra);
  if (d1Result === "deleted") {
    console.log(`deleted D1 database ${infra.d1.databaseName}`);
  } else {
    console.log(
      `no D1 database found for ${infra.d1.databaseName} \u2014 skipping`,
    );
  }

  const r2Result = await teardownR2(infra);
  if (r2Result === "deleted") {
    console.log(`deleted R2 bucket ${infra.r2.bucketName}`);
  } else {
    console.log(
      `no R2 bucket found for ${infra.r2.bucketName} \u2014 skipping`,
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
