const STORAGE_KEY = "oncoflow_public_inquiry";

export interface StoredInquiry {
  inquiryId: string;
  token: string;
  lastSeenCount: number;
}

export function loadStoredInquiry(): StoredInquiry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredInquiry) : null;
  } catch {
    return null;
  }
}

export function saveStoredInquiry(data: StoredInquiry) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function clearStoredInquiry() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
