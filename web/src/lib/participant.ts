"use client";

const STORAGE_KEY = "zlp_participant";

export type StoredParticipant = {
  id: string;
  name: string;
};

export function getStoredParticipant(): StoredParticipant | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredParticipant;
  } catch {
    return null;
  }
}

export function setStoredParticipant(p: StoredParticipant): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}

export function clearStoredParticipant(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
