import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const GIS_PATTERN = /(?:GisNetworkView|maplibre)/i;

function recordIdentity(key, record) {
  return `${key} ${record.src ?? ""} ${record.name ?? ""} ${record.file ?? ""}`;
}

function traverse(manifest, roots, edgeNames) {
  const visited = new Set();
  const pending = [...roots];
  while (pending.length > 0) {
    const key = pending.pop();
    if (typeof key !== "string" || visited.has(key)) continue;
    visited.add(key);
    const record = manifest[key];
    if (record == null) continue;
    for (const edgeName of edgeNames) {
      for (const dependency of record[edgeName] ?? []) pending.push(dependency);
    }
  }
  return visited;
}

/** Fail when the production entry can statically reach GIS/MapLibre, or when the GIS
 * module is no longer dynamically reachable. This checks the emitted artifact graph,
 * not source-code intent, so a bundler/config regression cannot silently re-eager-load
 * the dark GIS dependency. */
export function verifyGisChunkIsolation(manifest) {
  const entries = Object.entries(manifest);
  const entryRecords = entries.filter(([, record]) => record.isEntry === true);
  const main =
    entryRecords.find(([key, record]) =>
      /(?:^|\/)(?:main\.tsx|index\.html)$/.test(record.src ?? key),
    ) ?? (entryRecords.length === 1 ? entryRecords[0] : undefined);
  if (main == null) throw new Error("Vite manifest has no unambiguous application entry");

  const gisKeys = new Set(
    entries
      .filter(([key, record]) => GIS_PATTERN.test(recordIdentity(key, record)))
      .map(([key]) => key),
  );
  if (gisKeys.size === 0) throw new Error("Vite manifest has no GIS/MapLibre chunk");

  const staticGraph = traverse(manifest, [main[0]], ["imports"]);
  const eager = [...staticGraph].filter((key) => {
    const record = manifest[key];
    return gisKeys.has(key) || (record != null && GIS_PATTERN.test(recordIdentity(key, record)));
  });
  if (eager.length > 0) {
    throw new Error(`GIS/MapLibre is eager in the main static graph: ${eager.join(", ")}`);
  }

  const dynamicRoots = [...staticGraph].flatMap(
    (key) => manifest[key]?.dynamicImports ?? [],
  );
  const dynamicGraph = traverse(manifest, dynamicRoots, ["imports", "dynamicImports"]);
  const reachable = [...dynamicGraph].some((key) => gisKeys.has(key));
  if (!reachable) throw new Error("GIS/MapLibre is not dynamically reachable from main");
}

async function main() {
  const manifestPath = new URL("../dist/.vite/manifest.json", import.meta.url);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  verifyGisChunkIsolation(manifest);
  process.stdout.write("GIS chunk isolation verified: dynamic-only from src/main.tsx\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
