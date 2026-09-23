"use client";

import { useCallback, useSyncExternalStore } from "react";

// Balance visibility kept in one module-level store persisted in localStorage, so hiding survives navigation and reloads and screens can't disagree.
const STORAGE_KEY = "oncoflow.balanceRevealed";

// Revealed by default, since this is a convenience control, not a security boundary.
const DEFAULT_REVEALED = true;

let revealed = DEFAULT_REVEALED;
let hydrated = false;
const subscribers = new Set<() => void>();

// Reads the stored visibility, guarding against localStorage throwing in privacy modes.
function readStored(): boolean {
  // Wrapped: localStorage throws outright in some privacy modes rather than returning null.
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === null ? DEFAULT_REVEALED : stored === "true";
  } catch {
    return DEFAULT_REVEALED;
  }
}

// Subscribes to visibility changes.
function subscribe(onStoreChange: () => void): () => void {
  subscribers.add(onStoreChange);
  return () => {
    subscribers.delete(onStoreChange);
  };
}

// A boolean primitive is inherently stable for useSyncExternalStore, and the stored value is read once.
function getSnapshot(): boolean {
  if (!hydrated) {
    hydrated = true;
    revealed = readStored();
  }
  return revealed;
}

// Renders the default on the server, then re-renders with the stored value to avoid a hydration mismatch.
function getServerSnapshot(): boolean {
  return DEFAULT_REVEALED;
}

// Returns whether the balance is revealed and a function to toggle it.
export function useBalanceVisibility(): { revealed: boolean; toggle: () => void } {
  // Read through the store, not the module variable, so it is correct during SSR and concurrent rendering.
  const revealedValue = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    revealed = !revealed;
    hydrated = true;
    try {
      window.localStorage.setItem(STORAGE_KEY, String(revealed));
    } catch {
      // Preference simply won't persist across reloads; the in-memory value still applies.
    }
    for (const notify of subscribers) notify();
  }, []);

  return { revealed: revealedValue, toggle };
}
