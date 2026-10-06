import { useSyncExternalStore } from "react";

// Alerts are computed from live data rather than stored, so "read" is remembered per user in this browser by alert id.
const MAX_REMEMBERED = 2000;
const EMPTY: ReadonlySet<string> = new Set();
const sets = new Map<string, ReadonlySet<string>>();
const listeners = new Set<() => void>();

const storageKey = (userId: string) => `oncoflow:read-alerts:${userId}`;

function load(userId: string): ReadonlySet<string> {
  let current = sets.get(userId);
  if (!current) {
    let ids: string[] = [];
    try {
      const raw = localStorage.getItem(storageKey(userId));
      if (raw) ids = JSON.parse(raw) as string[];
    } catch {
      // Unreadable storage just means nothing is remembered as read.
    }
    current = new Set(ids);
    sets.set(userId, current);
  }
  return current;
}

// Remembers these alerts as read for the user and notifies every surface showing them.
export function markAlertsRead(userId: string, ids: string[]) {
  const next = new Set([...load(userId), ...ids]);
  const kept = new Set([...next].slice(-MAX_REMEMBERED));
  sets.set(userId, kept);
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify([...kept]));
  } catch {
    // The in-memory set still covers this session.
  }
  listeners.forEach((l) => l());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => { listeners.delete(onChange); };
}

// The ids of alerts the user has marked read.
export function useReadAlertIds(userId: string | undefined): ReadonlySet<string> {
  return useSyncExternalStore(
    subscribe,
    () => (userId ? load(userId) : EMPTY),
    () => EMPTY,
  );
}
