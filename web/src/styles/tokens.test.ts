/**
 * Acceptance tests for the token contract (DREP-PR6 T1, T2, T11, T12, T18).
 *
 * These read two REAL artifacts off disk — `design/tokens.map.md` and `globals.css` — and
 * assert they agree. A fixture would guard nothing here: the whole risk is that the
 * hand-written CSS drifts from the hand-curated table that certifies the palette.
 *
 * Authored by Claude. The implementer must not modify this file (DREP §10).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { converter, differenceEuclidean, parse } from "culori";
import { describe, expect, it } from "vitest";

/**
 * Paths are derived from `process.cwd()`, NOT from `import.meta.url`.
 *
 * Under vitest's jsdom environment `import.meta.url` is not a `file:` URL, so
 * `fileURLToPath(new URL("../..", import.meta.url))` throws
 * "TypeError: The URL must be of scheme file" before a single assertion runs — a broken
 * harness that looks exactly like a failing implementation. Found by running the RED
 * proof for T1; keeping the note so nobody re-introduces it.
 *
 * vitest sets cwd to the package root (`web/`); `guards the cwd` below fails loudly if
 * that ever stops being true, rather than letting every file-reading test go vacuous.
 */
const WEB_ROOT = process.cwd();
const REPO_ROOT = resolve(WEB_ROOT, "..");
const GLOBALS_CSS = join(WEB_ROOT, "src", "styles", "globals.css");
const TOKENS_MAP = join(REPO_ROOT, "design", "tokens.map.md");
const VITE_CONFIG = join(WEB_ROOT, "vite.config.ts");
const SRC_DIR = join(WEB_ROOT, "src");

/** ΔE-OK budget. 0.02 is far below a just-noticeable difference and far above float noise. */
const DELTA_E_BUDGET = 0.02;

const toOklab = converter("oklab");
/**
 * ΔE-OK is Euclidean distance in **Oklab**, not in OKLCH.
 *
 * Measuring in OKLCH would compare hue ANGLES, and hue is undefined for an achromatic
 * colour — `--surface-container-lowest` is `#FFFFFF` in light mode, so an OKLCH
 * comparison yields NaN and the assertion silently passes or silently explodes.
 */
const deltaEOk = differenceEuclidean("oklab");

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

/**
 * Drop `/* … *\/` comments before any STRUCTURAL scan.
 *
 * `globals.css` documents *why* it uses `light-dark()` instead of a
 * `@media (prefers-color-scheme: dark)` block — and that prose made the
 * "no scheme-specific override" assertion match its own explanation. Prose is not code.
 */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Split `a, b` at the TOP level only — the operands contain their own parentheses. */
function splitTopLevelComma(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of input) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current.trim());
  return parts;
}

/**
 * Extract `--name: light-dark(<light>, <dark>)` declarations.
 *
 * Scans for the balanced closing paren rather than regex-matching to it: a lazy
 * `light-dark\((.*?)\)` stops at the first `)` inside `oklch(...)` and silently yields a
 * truncated colour that culori then fails to parse — a broken test that looks like a
 * broken implementation.
 */
function parseLightDarkTokens(css: string): Map<string, { light: string; dark: string }> {
  const out = new Map<string, { light: string; dark: string }>();
  const declaration = /(--[a-z0-9-]+)\s*:\s*light-dark\(/g;
  let match: RegExpExecArray | null;
  while ((match = declaration.exec(css)) !== null) {
    const openIndex = match.index + match[0].length - 1;
    let depth = 0;
    let closeIndex = -1;
    for (let i = openIndex; i < css.length; i += 1) {
      if (css[i] === "(") depth += 1;
      else if (css[i] === ")") {
        depth -= 1;
        if (depth === 0) {
          closeIndex = i;
          break;
        }
      }
    }
    expect(closeIndex, `unbalanced light-dark() for ${match[1]}`).toBeGreaterThan(openIndex);
    const [light, dark] = splitTopLevelComma(css.slice(openIndex + 1, closeIndex));
    expect(dark, `${match[1]} needs both a light and a dark operand`).toBeTruthy();
    out.set(match[1], { light, dark });
  }
  return out;
}

/** Doc token name (`--surface`) -> the CSS custom property Tailwind emits (`--color-surface`). */
function cssNameFor(docToken: string): string {
  return docToken.replace(/^--/, "--color-");
}

/** Parse the colour table and the sequential-ramp table out of tokens.map.md. */
function parseDocumentedTokens(md: string): Map<string, { light: string; dark: string }> {
  const out = new Map<string, { light: string; dark: string }>();

  // | `--surface` | `#F7F9FB` | `#0F1620` | authored | ... |
  const colourRow = /^\|\s*`(--[a-z0-9-]+)`\s*\|\s*`(#[0-9A-Fa-f]{6})`\s*\|\s*`(#[0-9A-Fa-f]{6})`\s*\|/gm;
  let match: RegExpExecArray | null;
  while ((match = colourRow.exec(md)) !== null) {
    out.set(match[1], { light: match[2], dark: match[3] });
  }

  // | 1 | `#DCE9F6` | `#16324D` |
  const seqRow = /^\|\s*([1-5])\s*\|\s*`(#[0-9A-Fa-f]{6})`\s*\|\s*`(#[0-9A-Fa-f]{6})`\s*\|/gm;
  while ((match = seqRow.exec(md)) !== null) {
    out.set(`--seq-${match[1]}`, { light: match[2], dark: match[3] });
  }

  return out;
}

function collectFiles(dir: string, predicate: (path: string) => boolean): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...collectFiles(full, predicate));
    } else if (predicate(full)) {
      found.push(full);
    }
  }
  return found;
}

describe("T0 — the harness itself resolves the right tree", () => {
  it("guards the cwd", () => {
    // If this fails, every file-reading assertion below is measuring the wrong tree.
    expect(() => statSync(join(WEB_ROOT, "package.json"))).not.toThrow();
    expect(() => statSync(join(REPO_ROOT, "CLAUDE.md"))).not.toThrow();
    expect(() => statSync(TOKENS_MAP)).not.toThrow();
  });
});

describe("T1 — the token contract round-trips to design/tokens.map.md", () => {
  const css = readText(GLOBALS_CSS);
  const documented = parseDocumentedTokens(readText(TOKENS_MAP));
  const implemented = parseLightDarkTokens(stripComments(css));

  it("parses a non-trivial number of tokens from both artifacts", () => {
    // Guards the parsers themselves: if either regex silently matched nothing, every
    // per-token assertion below would vacuously pass.
    expect(documented.size).toBe(20); // 15 colour (incl. the two on-colours) + 5 sequential
    expect(implemented.size).toBeGreaterThanOrEqual(18);
  });

  it.each([...parseDocumentedTokens(readText(TOKENS_MAP)).keys()])(
    "%s matches the documented hex in both schemes (ΔE-OK ≤ 0.02, measured in Oklab)",
    (docToken) => {
      const doc = documented.get(docToken)!;
      const cssToken = cssNameFor(docToken);
      const impl = implemented.get(cssToken);
      expect(impl, `${cssToken} is missing from globals.css`).toBeDefined();

      for (const scheme of ["light", "dark"] as const) {
        const expected = toOklab(parse(doc[scheme]));
        const actual = toOklab(parse(impl![scheme]));
        expect(expected, `unparseable documented hex for ${docToken}`).toBeDefined();
        expect(actual, `unparseable CSS value for ${cssToken} (${scheme})`).toBeDefined();

        const delta = deltaEOk(expected!, actual!);
        expect(Number.isNaN(delta), `ΔE was NaN for ${cssToken} (${scheme})`).toBe(false);
        expect(
          delta,
          `${cssToken} ${scheme}: ${impl![scheme]} is ΔE ${delta.toFixed(4)} from ${doc[scheme]}`,
        ).toBeLessThanOrEqual(DELTA_E_BUDGET);
      }
    },
  );

  it("handles the achromatic edge (#FFFFFF) without NaN", () => {
    // The reason the comparison is done in Oklab: white has no defined hue, so an OKLCH
    // distance would be NaN and this token would never actually be checked.
    const doc = documented.get("--surface-container-lowest")!;
    expect(doc.light.toUpperCase()).toBe("#FFFFFF");
    const impl = parseLightDarkTokens(stripComments(css)).get("--color-surface-container-lowest")!;
    const delta = deltaEOk(toOklab(parse(doc.light))!, toOklab(parse(impl.light))!);
    expect(Number.isNaN(delta)).toBe(false);
    expect(delta).toBeLessThanOrEqual(DELTA_E_BUDGET);
  });

  it("defines no colour token the documentation does not list", () => {
    const documentedCssNames = new Set([...documented.keys()].map(cssNameFor));
    const undocumented = [...implemented.keys()].filter((t) => !documentedCssNames.has(t));
    expect(undocumented, `undocumented colour tokens in globals.css: ${undocumented}`).toEqual([]);
  });

  it("declares color-scheme: light dark inside :root", () => {
    // Must be the DECLARATION, inside :root — not prose. An earlier version of this
    // assertion scanned the raw file and matched the explanatory comment above the
    // declaration, so deleting the declaration itself left the suite green. Caught by
    // mutation (MUT-2), which is the only thing that could have caught it.
    const root = stripComments(css).match(/:root\s*\{[\s\S]*?\n\}/)?.[0];
    expect(root, "no :root block in globals.css").toBeDefined();
    expect(root, "without this, every light-dark() silently collapses to its light branch")
      .toMatch(/color-scheme:\s*light\s+dark\s*;/);
  });

  it("has no prefers-color-scheme block redefining a colour token", () => {
    // Two definition sites is how light and dark drift apart one careless edit at a time.
    const code = stripComments(css);
    const schemeBlocks = code.match(/@media[^{]*prefers-color-scheme[^{]*\{[\s\S]*?\n\}/g) ?? [];
    for (const block of schemeBlocks) {
      expect(block, "a prefers-color-scheme block redefines a --color-* token").not.toMatch(
        /--color-[a-z0-9-]+\s*:/,
      );
    }
  });
});

describe("T2 — no colour, duration or shadow literal escapes globals.css", () => {
  // Production modules only. Test files are excluded because a test that asserts "no hex
  // exists" cannot itself be forbidden from naming one, and `tokens.test.ts` reads its
  // expected hexes out of the .md rather than hardcoding them anyway.
  const files = collectFiles(SRC_DIR, (p) => {
    if (/\.test\.tsx?$/.test(p)) return false;
    if (p === GLOBALS_CSS) return false;
    return /\.(ts|tsx|css)$/.test(p);
  });

  const FORBIDDEN: ReadonlyArray<readonly [string, RegExp]> = [
    ["hex colour", /#[0-9a-fA-F]{3,8}\b/],
    ["rgb()/rgba()", /\brgba?\(/],
    ["hsl()/hsla()", /\bhsla?\(/],
    ["raw oklch()", /\boklch\(/],
    ["raw duration", /\b\d+(?:\.\d+)?m?s\b/],
    ["raw box-shadow", /box-shadow\s*:/],
    ["inline style colour/shadow", /\b(?:boxShadow|backgroundColor)\s*:/],
    // Tailwind's BUILT-IN palette compiles to a real colour without ever appearing as a
    // literal, so the scans above cannot see it. `text-white` shipped this way and was
    // wrong in dark mode (white on the light-blue dark `--primary` is 2.55:1). Colour must
    // come from a `--color-*` token, which means a semantic utility name.
    [
      "built-in Tailwind palette utility",
      /\b(?:bg|text|border|ring|fill|stroke|from|via|to|decoration|outline|shadow)-(?:white|black|slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\d{2,3})?\b/,
    ],
    // Tailwind's default transition duration is 150ms and `animate-pulse` is 2s; both are
    // literals baked into the framework rather than our motion tokens.
    ["untokenised Tailwind duration", /\bduration-\d+\b/],
    ["untokenised Tailwind animation", /\banimate-(?:pulse|spin|bounce|ping)\b/],
  ];

  it("scans a non-empty set of production files", () => {
    // Without this the whole describe passes vacuously on an empty file list.
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(FORBIDDEN)("contains no %s", (label, pattern) => {
    const offenders: string[] = [];
    for (const file of files) {
      readText(file)
        .split("\n")
        .forEach((line, index) => {
          // Ignore URLs and SVG path data, where a `#` or a digit-run is not a token.
          const scrubbed = line.replace(/https?:\/\/\S+/g, "").replace(/\bd="[^"]*"/g, "");
          if (pattern.test(scrubbed)) {
            offenders.push(`${file.slice(WEB_ROOT.length)}:${index + 1}: ${line.trim()}`);
          }
        });
    }
    expect(offenders, `${label} found:\n${offenders.join("\n")}`).toEqual([]);
  });
});

describe("T11 — the Thai font is local and actually applied", () => {
  const css = readText(GLOBALS_CSS);
  // Structural assertions run on comment-stripped CSS; prose that merely mentions an
  // @import is not an @import (see MUT-2).
  const code = stripComments(css);

  it("imports the @fontsource Thai subset", () => {
    expect(code).toMatch(/@import\s+"@fontsource\/ibm-plex-sans-thai\/thai-400\.css"/);
    expect(code).toMatch(/@import\s+"@fontsource\/ibm-plex-sans-thai\/thai-600\.css"/);
  });

  it("maps that family onto --font-sans (an unimported font would still 'install')", () => {
    expect(code).toMatch(/--font-sans:\s*"IBM Plex Sans Thai"/);
    expect(code).toMatch(/font-family:\s*var\(--font-sans\)/);
  });

  it("resolves the imported subset on disk", () => {
    const subset = join(
      WEB_ROOT,
      "node_modules",
      "@fontsource",
      "ibm-plex-sans-thai",
      "thai-400.css",
    );
    expect(() => statSync(subset)).not.toThrow();
  });

  it("references no remote URL — the demo must render Thai with no internet", () => {
    expect(css).not.toMatch(/https?:\/\//);
  });

  it("places every @import before the first rule, as CSS requires", () => {
    const code = stripComments(css);
    const firstRule = code.search(/^\s*(?:@theme|@media|[.:#a-zA-Z*][^\n]*\{)/m);
    const lastImport = code.lastIndexOf("@import");
    expect(lastImport).toBeGreaterThan(-1);
    expect(lastImport).toBeLessThan(firstRule);
  });
});

describe("T12 — motion is tokenised and reduced-motion actually zeroes it", () => {
  const css = readText(GLOBALS_CSS);

  it("defines the three motion tokens", () => {
    const root = stripComments(css).match(/:root\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
    for (const token of ["--anim-fast", "--anim-medium", "--anim-slow"]) {
      expect(root, `${token} is not declared in :root`).toMatch(
        new RegExp(`${token}:\\s*\\d+ms`),
      );
    }
  });

  it("zeroes BOTH transition and animation under prefers-reduced-motion", () => {
    const code = stripComments(css);
    const block = code.match(/@media[^{]*prefers-reduced-motion:\s*reduce[^{]*\{[\s\S]*?\n\}/)?.[0];
    expect(block, "no prefers-reduced-motion block").toBeDefined();
    // A block naming only one of these leaves half the motion alive. `0.01ms` counts as
    // zero here (it is the standard "effectively instant but still fires transitionend"
    // value) — but the pattern must anchor on the property, not merely see a leading 0.
    // `0.01ms` is the canonical value here — effectively instant, but still fires
    // `transitionend` so listeners do not hang. `0`/`0s`/`0ms` are equally acceptable.
    // Anything else (`0.5s`) is not "zeroed" and must fail.
    const zeroed = /:\s*(?:0|0m?s|0\.01m?s)\s*!?\s*(?:important)?\s*;/;
    expect(block).toMatch(new RegExp("transition-duration" + zeroed.source));
    expect(block).toMatch(new RegExp("animation-duration" + zeroed.source));
  });

  it("makes every component that transitions name a motion token", () => {
    // Token EXISTENCE is not token USE. `transition-colors` on its own silently takes
    // Tailwind's built-in 150ms, so the tokens could be defined and never referenced —
    // which is exactly what shipped before this assertion existed.
    const offenders: string[] = [];
    for (const file of collectFiles(SRC_DIR, (p) => /\.tsx?$/.test(p) && !/\.test\./.test(p))) {
      const text = readText(file);
      const transitions = text.match(/\btransition(?:-[a-z]+)?\b/g) ?? [];
      if (transitions.length === 0) continue;
      if (!/duration-\[var\(--anim-(?:fast|medium|slow)\)\]/.test(text)) {
        offenders.push(`${file.slice(WEB_ROOT.length)} uses ${transitions[0]} with no --anim-* token`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

describe("T18 — the dev proxy is configured to route /api and /ws away from Vite", () => {
  // Asserts CONFIGURATION, not behaviour: a correct-looking proxy still fails against an
  // unreachable target or a broken WS upgrade. Live proof is the compose check recorded
  // in the coding log; an automated end-to-end version belongs to PR-17 (Playwright).
  const source = readText(VITE_CONFIG);

  it("proxies /api", () => {
    expect(source).toMatch(/"\/api":\s*\{[^}]*changeOrigin:\s*true/);
  });

  it("proxies /ws with the websocket upgrade enabled", () => {
    const wsEntry = source.match(/"\/ws":\s*\{[^}]*\}/)?.[0];
    expect(wsEntry, "no /ws proxy entry").toBeDefined();
    expect(wsEntry).toMatch(/ws:\s*true/);
    expect(wsEntry).toMatch(/changeOrigin:\s*true/);
  });

  it("reads the target from VITE_PROXY_TARGET with a localhost default", () => {
    expect(source).toMatch(/VITE_PROXY_TARGET/);
    expect(source).toMatch(/http:\/\/localhost:8000/);
  });

  it("resolves the @ alias to an absolute path", () => {
    // A relative alias breaks depending on the process cwd; tsconfig `paths` alone
    // configures only the type-checker, not Vite or vitest.
    expect(source).toMatch(/"@":\s*fileURLToPath\(/);
  });
});
