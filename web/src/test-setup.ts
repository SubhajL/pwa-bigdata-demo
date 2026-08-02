import "@testing-library/jest-dom";

/**
 * Reconcile jsdom's `AbortSignal` with Node's `Request` — a TEST-ENVIRONMENT-ONLY defect.
 *
 * Under vitest's jsdom environment the realms are mixed: `AbortController` comes from
 * jsdom, while `Request`/`Response`/`fetch` come from Node (jsdom implements none of
 * them). Node 26's undici brand-checks the signal and rejects the foreign one:
 *
 *     TypeError: RequestInit: Expected signal ("AbortSignal {}") to be an instance of
 *                AbortSignal.
 *
 * react-router 7 builds a `Request` on EVERY navigation (`createClientSideRequest`), so
 * without this every `router.navigate()` throws internally and silently does nothing —
 * the router simply never leaves its initial location. Verified with a minimal two-route
 * probe: the failure is not specific to our routes or our redirect.
 *
 * The shim drops a foreign `signal` before delegating to the real `Request` and re-attaches
 * it afterwards, so anything reading `request.signal` still sees the caller's signal.
 *
 * This is a REAL browser being right and the test environment being wrong: in a browser
 * both come from the same realm and the brand check passes. Nothing in `src/` is changed
 * to accommodate it, and no production behaviour depends on this file.
 */
const NativeRequest = globalThis.Request;
if (typeof NativeRequest === "function") {
  class RealmTolerantRequest extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      const signal = init?.signal;
      if (signal && !(signal instanceof globalThis.AbortSignal)) {
        // Unreachable in practice; kept so a same-realm signal is never stripped.
        super(input, init);
        return;
      }
      if (signal) {
        const rest: RequestInit = { ...(init as RequestInit) };
        delete rest.signal;
        super(input, rest);
        Object.defineProperty(this, "signal", { value: signal, configurable: true });
        return;
      }
      super(input, init);
    }
  }
  globalThis.Request = RealmTolerantRequest as unknown as typeof Request;
}

/**
 * jsdom implements no media queries at all, so any component asking about colour scheme
 * or reduced motion throws "matchMedia is not a function" rather than rendering.
 *
 * The stub reports NO match for every query, i.e. light scheme and motion enabled — the
 * defaults the components are written against. It cannot make jsdom actually EVALUATE a
 * media query; that is one of the reasons contrast and reduced-motion behaviour are
 * verified by reading globals.css (tokens.test.ts) rather than by rendering.
 */
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  });
}

/**
 * jsdom in this toolchain exposes NO Web Storage — Node 26 gates its own `localStorage`
 * behind `--localstorage-file`, and this jsdom build ships none — so anything reading or
 * writing `localStorage` throws instead of the browser's guaranteed behaviour. Production
 * code (lib/theme.ts) already degrades in a try/catch, but persistence cannot be ASSERTED
 * against a missing API. Provide a minimal in-memory implementation, same rationale as the
 * matchMedia stub above. Each test file gets its own store (setupFiles run per file).
 */
if (typeof window !== "undefined" && !window.localStorage) {
  const store = new Map<string, string>();
  const memoryStorage = {
    get length(): number {
      return store.size;
    },
    clear: (): void => {
      store.clear();
    },
    getItem: (key: string): string | null => (store.has(key) ? store.get(key)! : null),
    key: (index: number): string | null => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string): void => {
      store.delete(key);
    },
    setItem: (key: string, value: string): void => {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(window, "localStorage", {
    writable: true,
    configurable: true,
    value: memoryStorage as unknown as Storage,
  });
}
