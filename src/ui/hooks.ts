import { useEffect, useRef, useState } from 'react';

/** Subscribes to a CSS media query. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}

/**
 * Polls a mutable source (the simulation client) on an interval and re-renders only the
 * calling component, and only when the shallow value actually changed. This keeps the
 * live HUD from re-rendering the rest of the app.
 */
export function usePoll<T extends Record<string, unknown>>(read: () => T, intervalMs: number): T {
  const readRef = useRef(read);
  readRef.current = read;
  const [value, setValue] = useState<T>(() => read());
  useEffect(() => {
    const id = setInterval(() => {
      const next = readRef.current();
      setValue((prev) => {
        for (const k in next) if (prev[k] !== next[k]) return next;
        return prev;
      });
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return value;
}

// ---- remembered panel layout (per browser; wrapped because storage can be blocked)

const KEY = 'alife-lab.layout.v1';

export interface StoredLayout {
  settings?: boolean;
  stats?: boolean;
  statsHeight?: number;
}

export function loadLayout(): StoredLayout {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StoredLayout) : {};
  } catch {
    return {};
  }
}

export function saveLayout(layout: StoredLayout): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(layout));
  } catch {
    /* storage unavailable: the layout simply is not remembered */
  }
}
