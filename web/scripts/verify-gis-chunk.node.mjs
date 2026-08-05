import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { verifyGisChunkIsolation } from "./verify-gis-chunk.mjs";

const dynamicManifest = {
  "src/main.tsx": {
    file: "assets/main.js",
    isEntry: true,
    src: "src/main.tsx",
    dynamicImports: ["src/features/twin/GisNetworkView.tsx"],
  },
  "src/features/twin/GisNetworkView.tsx": {
    file: "assets/GisNetworkView.js",
    src: "src/features/twin/GisNetworkView.tsx",
  },
};

describe("verifyGisChunkIsolation", () => {
  it("accepts a GIS module reachable only through a dynamic import", () => {
    assert.doesNotThrow(() => verifyGisChunkIsolation(dynamicManifest));
  });

  it("rejects a GIS module in the main entry static graph", () => {
    const manifest = structuredClone(dynamicManifest);
    manifest["src/main.tsx"].imports = ["src/features/twin/GisNetworkView.tsx"];
    assert.throws(() => verifyGisChunkIsolation(manifest), /static|eager/i);
  });

  it("rejects a GIS module no longer dynamically reachable", () => {
    const manifest = structuredClone(dynamicManifest);
    manifest["src/main.tsx"].dynamicImports = [];
    assert.throws(() => verifyGisChunkIsolation(manifest), /dynamic/i);
  });
});
