"use client";

import { useCallback, useSyncExternalStore } from "react";

// Whether the wallet balance is shown, shared across every screen and remembered between them.
//
// This was previously a useState(true) inside BalanceAmount, plus a second, separate copy
// inlined in the home page. Both were component-local, so hiding the balance lasted only until
// the component unmounted: navigating to another tab and back revealed it again, which defeats
// the point of a hide control on a screen someone might be reading in public.
//
// Persisted in localStorage so the choice survives a reload too, and held in one module-level
// store so the home card and the wallet page can never disagree about it.
const STORAGE_KEY = "oncoflow.balanceRevealed";

// Revealed by default: this is a convenience control, not a security boundary, and someone who
// has never touched it should see their balance.
const DEFAULT_REVEALED = true;

let revealed = DEFAULT_REVEALED;
let hydrated = false;
const subscribers = new Set<() => void>();

function readStored(): boolean {
  // Wrapped: localStorage throws outright in some privacy modes rather than returning null.
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === null ? DEFAULT_REVEALED : stored === "true";
  } catch {
    return DEFAULT_REVEALED;
  }
}

function subscribe(onStoreChange: () => void): () => void {
  subscribers.add(onStoreChange);
  return () => {
    subscribers.delete(onStoreChange);
  };
}

// A boolean is a primitive, so identity is inherently stable — no cached object needed to
// satisfy useSyncExternalStore. The stored value is read once, on first use.
function getSnapshot(): boolean {
  if (!hydrated) {
    hydrated = true;
    revealed = readStored();
  }
  return revealed;
}

// The server has no localStorage, so it renders the default. useSyncExternalStore uses this
// during SSR and hydration and then re-renders with the real value, which is what keeps a
// stored "hidden" from causing a hydration mismatch.
function getServerSnapshot(): boolean {
  return DEFAULT_REVEALED;
}

export function useBalanceVisibility(): { revealed: boolean; toggle: () => void } {
  // Read through the store, not from the module variable directly — the subscribed snapshot is
  // what makes this correct during SSR/hydration and under concurrent rendering.
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
