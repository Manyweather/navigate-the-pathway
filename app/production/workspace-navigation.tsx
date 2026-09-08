"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
  type ReactNode,
} from "react";

type Navigation = {
  values: Record<string, unknown>;
  set: (key: string, value: unknown) => void;
  back: () => void;
  reset: () => void;
  drafts: Map<string, unknown>;
};
const Context = createContext<Navigation | null>(null);
export function WorkspaceNavigation({ children }: { children: ReactNode }) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const current = useRef(values);
  const sequence = useRef(0);
  const snapshots = useRef(new Map<number, Record<string, unknown>>([[0, {}]]));
  const [drafts] = useState(() => new Map<string, unknown>());
  const set = useCallback((key: string, value: unknown) => {
    if (Object.is(current.current[key], value)) return;
    const next = { ...current.current, [key]: value };
    current.current = next;
    const id = ++sequence.current;
    snapshots.current.set(id, next);
    window.history.pushState(
      { ...window.history.state, pathwayNavigation: id },
      "",
    );
    setValues(next);
  }, []);
  useEffect(() => {
    window.history.replaceState(
      { ...window.history.state, pathwayNavigation: 0 },
      "",
    );
    const restore = (e: PopStateEvent) => {
      const next = snapshots.current.get(e.state?.pathwayNavigation) || {};
      current.current = next;
      setValues(next);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  const back = useCallback(() => {
    const id = window.history.state?.pathwayNavigation;
    if (typeof id === "number" && id > 0) window.history.back();
    else {
      current.current = {};
      setValues({});
      window.history.replaceState(
        { ...window.history.state, pathwayNavigation: 0 },
        "",
      );
    }
  }, []);
  const reset = useCallback(() => {
    current.current = {}; snapshots.current.clear(); snapshots.current.set(0, {}); sequence.current = 0; setValues({});
    window.history.replaceState({...window.history.state,pathwayNavigation:0}, "");
  }, []);
  const value = useMemo(
    () => ({ values, set, back, reset, drafts }),
    [values, set, back, reset, drafts],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function usePathwayView<T>(
  key: string,
  initial: T,
): [T, Dispatch<SetStateAction<T>>] {
  const ctx = useContext(Context);
  const [local, setLocal] = useState(initial);
  const value = (ctx && key in ctx.values ? ctx.values[key] : initial) as T;
  const set: Dispatch<SetStateAction<T>> = useCallback(
    (next) => {
      if (!ctx) {
        setLocal(next);
        return;
      }
      ctx.set(
        key,
        typeof next === "function" ? (next as (v: T) => T)(value) : next,
      );
    },
    [ctx, key, value],
  );
  return ctx ? [value, set] : [local, set];
}
export function useSessionDraft<T>(
  key: string,
  initial: T,
): [T, Dispatch<SetStateAction<T>>] {
  const ctx = useContext(Context);
  const [local, setLocal] = useState(initial);
  const [, refresh] = useState(0);
  const value = ctx
    ? ctx.drafts.has(key)
      ? (ctx.drafts.get(key) as T)
      : initial
    : local;
  const set: Dispatch<SetStateAction<T>> = useCallback(
    (next) => {
      if (!ctx) {
        setLocal(next);
        return;
      }
      const previous = ctx.drafts.has(key)
        ? (ctx.drafts.get(key) as T)
        : initial;
      ctx.drafts.set(
        key,
        typeof next === "function" ? (next as (v: T) => T)(previous) : next,
      );
      refresh((n) => n + 1);
    },
    [ctx, key, initial],
  );
  return [value, set];
}
export function usePathwayLocation() {
  return useContext(Context)?.values || {};
}
export function WorkspaceBack() {
  const ctx = useContext(Context);
  return (
    <button
      className="text-button workspace-back"
      type="button"
      onClick={() => (ctx ? ctx.back() : window.history.back())}
      aria-label="Back to the previous screen"
    >
      ← Back
    </button>
  );
}

export function useResetPathway() { return useContext(Context)?.reset || (() => undefined); }
