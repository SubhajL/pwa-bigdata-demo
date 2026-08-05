/**
 * PR-R3 QCHECK round 3/4 — the code-split (finding 7) added a new failure mode: a REJECTED
 * MapLibre chunk request throws during render, which `Suspense` does NOT catch. This
 * boundary must confine ONLY a chunk-load failure to the GIS panel (render the fallback),
 * while re-throwing a genuine render bug so it is never masked as "map module failed".
 */
import { render, screen, waitFor } from "@testing-library/react";
import { Component, lazy, Suspense, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LazyChunkBoundary } from "./LazyChunkBoundary";

const FALLBACK = <div data-testid="chunk-fallback">unavailable</div>;

function ThrowingChunk(): JSX.Element {
  throw new Error("Failed to fetch dynamically imported module: /assets/GisNetworkView-x.js");
}

function ThrowingBug(): JSX.Element {
  throw new Error("Cannot read properties of undefined (reading 'demo_binding')");
}

/** An OUTER boundary, so we can assert LazyChunkBoundary RE-THREW a non-chunk error. */
class OuterCatcher extends Component<{ children: ReactNode }, { caught: boolean }> {
  state = { caught: false };
  static getDerivedStateFromError(): { caught: boolean } {
    return { caught: true };
  }
  render(): ReactNode {
    return this.state.caught ? <div data-testid="outer-caught" /> : this.props.children;
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LazyChunkBoundary", () => {
  it("renders the fallback when an actual React.lazy import rejects (the real chunk case)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const FailingLazy = lazy(() =>
      Promise.reject(
        new Error("Failed to fetch dynamically imported module: /assets/GisNetworkView-x.js"),
      ),
    );
    render(
      <LazyChunkBoundary fallback={FALLBACK}>
        <Suspense fallback={<div>loading</div>}>
          <FailingLazy />
        </Suspense>
      </LazyChunkBoundary>,
    );
    await waitFor(() => expect(screen.getByTestId("chunk-fallback")).toBeInTheDocument());
  });

  it("renders the fallback for a chunk-load error thrown during render", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    render(
      <LazyChunkBoundary fallback={FALLBACK}>
        <ThrowingChunk />
      </LazyChunkBoundary>,
    );
    expect(screen.getByTestId("chunk-fallback")).toBeInTheDocument();
  });

  it("treats Vite's 'Unable to preload CSS' as a chunk failure (MapLibre CSS side-effect)", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    function ThrowingCss(): JSX.Element {
      throw new Error("Unable to preload CSS for /assets/GisNetworkView-x.css");
    }
    render(
      <LazyChunkBoundary fallback={FALLBACK}>
        <ThrowingCss />
      </LazyChunkBoundary>,
    );
    expect(screen.getByTestId("chunk-fallback")).toBeInTheDocument();
  });

  it("RE-THROWS a non-chunk render bug instead of masking it as a chunk failure", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    render(
      <OuterCatcher>
        <LazyChunkBoundary fallback={FALLBACK}>
          <ThrowingBug />
        </LazyChunkBoundary>
      </OuterCatcher>,
    );
    // The outer boundary caught it → LazyChunkBoundary re-threw; it did NOT show the chunk
    // fallback and did NOT log a misleading "chunk failed to load" line.
    expect(screen.getByTestId("outer-caught")).toBeInTheDocument();
    expect(screen.queryByTestId("chunk-fallback")).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it("renders its children when they load without throwing", () => {
    render(
      <LazyChunkBoundary fallback={FALLBACK}>
        <div data-testid="chunk-ok">the map</div>
      </LazyChunkBoundary>,
    );
    expect(screen.getByTestId("chunk-ok")).toBeInTheDocument();
    expect(screen.queryByTestId("chunk-fallback")).toBeNull();
  });
});
