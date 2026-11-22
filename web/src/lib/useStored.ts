import { useCallback, useState } from "react";

// A tiny localStorage-backed state hook. Storage can be blocked or throw (private windows, cleared
// site data), so every read and write is guarded and the app works the same without it.
export function useStored<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw == null ? initial : (JSON.parse(raw) as T);
    } catch (_) {
      return initial;
    }
  });
  const set = useCallback(
    (v: T) => {
      setValue(v);
      try {
        window.localStorage.setItem(key, JSON.stringify(v));
      } catch (_) { /* storage unavailable - keep the in-memory value */ }
    },
    [key],
  );
  return [value, set];
}
