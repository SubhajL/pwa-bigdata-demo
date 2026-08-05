import { Component, type ErrorInfo, type ReactNode } from "react";

interface LazyChunkBoundaryProps {
  readonly fallback: ReactNode;
  readonly children: ReactNode;
}

interface LazyChunkBoundaryState {
  readonly error: Error | null;
}

/** Vite/webpack/Safari phrasings for a failed dynamic import — including Vite 6's
 *  "Unable to preload CSS for …" (MapLibre ships a CSS side-effect import, so a failed
 *  chunk can surface as the CSS message) — plus the `ChunkLoadError` name. A boundary that
 *  couldn't tell these from a real bug would mask defects (PR-R3 QCHECK round 4/5). */
const CHUNK_LOAD_ERROR =
  /dynamically imported module|Loading chunk|Importing a module script failed|Unable to preload CSS|ChunkLoadError/i;

function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "ChunkLoadError" || CHUNK_LOAD_ERROR.test(error.message);
}

/**
 * A minimal error boundary for the lazily-loaded MapLibre chunk (PR-R3 QCHECK round 3/4).
 *
 * `Suspense` handles only the PENDING import; a REJECTED chunk request — a stale deployment
 * whose hashed asset is gone, or a transient network failure — throws during render. Without
 * a boundary that throw escapes to the router's default error UI and takes the WORKING
 * logical twin down with the optional GIS map. This confines ONLY a chunk-load failure to the
 * GIS panel and renders the fallback. A NON-chunk error (a genuine `GisNetworkView` render
 * bug) is deliberately re-thrown, not masked as "map module failed" — it must surface exactly
 * as it did before the code-split, at the route boundary.
 */
export class LazyChunkBoundary extends Component<
  LazyChunkBoundaryProps,
  LazyChunkBoundaryState
> {
  state: LazyChunkBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): LazyChunkBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Log ONLY a chunk failure as such; a non-chunk error is re-thrown below and belongs to
    // whatever boundary catches it, so labelling it here would misattribute a real defect.
    if (isChunkLoadError(error)) {
      console.warn(`GIS map chunk failed to load: ${error.message}`, info.componentStack);
    }
  }

  render(): ReactNode {
    const { error } = this.state;
    if (error != null) {
      if (isChunkLoadError(error)) return this.props.fallback;
      throw error; // a real render bug must surface, not hide behind "map module failed"
    }
    return this.props.children;
  }
}
