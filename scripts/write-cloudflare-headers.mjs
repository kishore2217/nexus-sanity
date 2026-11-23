/**
 * Writes dist/_headers for Cloudflare Pages after `sanity build` (runs as `postbuild`).
 *
 * Pages serves everything with `max-age=0` by default, so browsers revalidate every script on each
 * Studio load. Files whose name carries a content hash never change, so they get a one-year
 * immutable cache. index.html and unhashed files (favicons, manifest) keep the default, so a new
 * deploy is picked up on the next load.
 */
/* global console */
import { readdirSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const DIST = "dist";
const IMMUTABLE = "public, max-age=31536000, immutable";
/** "sanity-8DzRUXGl.js", "index-l-GqNXXi.mjs": a hash of 8 URL-safe characters before the extension. */
const HASHED = /-[A-Za-z0-9_-]{8}\.m?js$/;

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

const hashed = walk(join(DIST, "static"))
  .filter((file) => HASHED.test(file))
  .map((file) => "/" + relative(DIST, file).split(sep).join("/"));

const rules = [
  // Every header applies site-wide; framing is left open in case Nexus embeds the Studio.
  "/*",
  "  X-Content-Type-Options: nosniff",
  "  Referrer-Policy: strict-origin-when-cross-origin",
  "",
  // Everything under vendor/ is content-hashed by the build.
  "/vendor/*",
  `  Cache-Control: ${IMMUTABLE}`,
  "",
  ...hashed.flatMap((path) => [path, `  Cache-Control: ${IMMUTABLE}`, ""]),
];

writeFileSync(join(DIST, "_headers"), rules.join("\n"));
console.log(`Wrote ${DIST}/_headers: immutable cache for vendor/ and ${hashed.length} hashed file(s)`);
