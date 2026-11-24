/**
 * Writes dist/version.json after `sanity build` (runs as part of `postbuild`). The studio polls it
 * (components/UpdateNotice.tsx) and offers a reload when it changes. Each build gets a fresh id:
 * a Nexus dispatch rebuilds the same commit with a new schema, so the commit hash alone won't do.
 */
/* global console, process */
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const DIST = "dist";
const build = randomUUID();

writeFileSync(
  join(DIST, "version.json"),
  JSON.stringify({ build, commit: process.env.GITHUB_SHA ?? null, builtAt: new Date().toISOString() }),
);
console.log(`Wrote ${DIST}/version.json: build ${build}`);
