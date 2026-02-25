"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { setStoredParticipant } from "@/lib/participant";

type Participant = { id: string; name: string };

export default function LoginPage() {
  const [participants, setParticipants] = useState<Participant[] | null>(null);
  const [seeding, setSeeding] = useState(false);
  const router = useRouter();
  const [nameInput, setNameInput] = useState("");
  const [error, setError] = useState("");

  const loadParticipants = useCallback(async () => {
    const res = await fetch("/api/participants");
    if (!res.ok) {
      setParticipants([]);
      return;
    }
    const data = await res.json();
    setParticipants(data);
  }, []);

  useEffect(() => {
    loadParticipants();
  }, [loadParticipants]);

  const handleSeed = useCallback(async () => {
    setSeeding(true);
    try {
      await fetch("/api/init", { method: "GET" });
      const res = await fetch("/api/seed", { method: "POST" });
      const data = await res.json();
      if (data.seeded) await loadParticipants();
    } finally {
      setSeeding(false);
    }
  }, [loadParticipants]);

  const handleSelect = useCallback(
    (p: Participant) => {
      setStoredParticipant({ id: p.id, name: p.name });
      router.push("/dashboard");
    },
    [router]
  );

  const search = nameInput.trim().toLowerCase();
  const filtered = search
    ? participants?.filter((p) => p.name.toLowerCase().includes(search)) ?? []
    : participants ?? [];

  const handleSubmitName = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setError("");
      const name = nameInput.trim();
      if (!name) {
        setError("Enter your name");
        return;
      }
      const matches = participants?.filter((p) =>
        p.name.toLowerCase().includes(name.toLowerCase())
      ) ?? [];
      if (matches.length === 1) {
        handleSelect(matches[0]);
        return;
      }
      if (matches.length > 1) {
        setError("Multiple matches — click your name in the list below.");
        return;
      }
      setError("No match. Try part of your first or last name.");
    },
    [nameInput, participants, handleSelect]
  );

  if (participants === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-100">
        <p className="text-stone-600">Loading…</p>
      </div>
    );
  }

  if (participants.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-stone-100 p-6">
        <h1 className="text-xl font-semibold text-stone-800">ZLP Scheduler</h1>
        <p className="text-stone-600">
          No participants loaded. Seed the database with the cohort list (one-time).
        </p>
        <button
          onClick={handleSeed}
          disabled={seeding}
          className="rounded-lg bg-rose-800 px-4 py-2 font-medium text-white hover:bg-rose-700 disabled:opacity-50"
        >
          {seeding ? "Seeding…" : "Seed participants"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-stone-100 p-6">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-sm">
        <h1 className="mb-2 text-2xl font-bold text-stone-900">
          ZLP Scheduler
        </h1>
        <p className="mb-6 text-stone-600">
          Sign in with your name to upload your schedule and see cohort overlap.
        </p>

        <form onSubmit={handleSubmitName} className="mb-6">
          <label className="mb-2 block text-sm font-medium text-stone-700">
            Search by name (first or last)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={nameInput}
              onChange={(e) => {
                setNameInput(e.target.value);
                setError("");
              }}
              placeholder="e.g. john or doe"
              className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-stone-900 placeholder-stone-400"
              autoComplete="off"
            />
            <button
              type="submit"
              className="rounded-lg bg-rose-800 px-4 py-2 font-medium text-white hover:bg-rose-700"
            >
              Sign in
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </form>

        <p className="mb-2 text-sm font-medium text-stone-700">
          {search ? "Matches — click to sign in:" : "Or select your name:"}
        </p>
        <ul className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-stone-200 p-2">
          {filtered.length === 0 ? (
            <li className="py-2 text-center text-sm text-stone-500">
              {search ? "No names match your search." : "No participants."}
            </li>
          ) : (
            filtered.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => handleSelect(p)}
                  className="w-full rounded px-3 py-2 text-left text-stone-800 hover:bg-stone-100"
                >
                  {p.name}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
