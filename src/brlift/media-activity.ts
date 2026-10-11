import { useSyncExternalStore } from "react";
let pending = 0;
const listeners = new Set<() => void>();
export function beginMediaActivity() {
  pending++;
  listeners.forEach((fn) => fn());
  let finished = false;
  return () => {
    if (finished) return;
    finished = true;
    pending--;
    listeners.forEach((fn) => fn());
  };
}
export function usePendingMedia() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => pending,
    () => 0,
  );
}
