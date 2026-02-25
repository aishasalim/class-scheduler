"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getStoredParticipant } from "@/lib/participant";

type Range = {
  dayName: string;
  firstStartHhmm: string;
  lastStartHhmm: string;
  score: number;
  conflicts: string[];
  blocked: string[];
  blockedCount: number;
};

type Result = { ranges: Range[]; heatmap: { start: string; day: string; score: number }[] };

export default function MeetingTimesPage() {
  const participant = getStoredParticipant();
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/meeting-times")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setResult(data);
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-stone-100">
      <header className="border-b border-stone-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link href="/dashboard" className="text-rose-800 hover:underline">
            ← Dashboard
          </Link>
          {participant && (
            <span className="text-stone-600">{participant.name}</span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="mb-2 text-2xl font-bold text-stone-900">
          Best 100-minute meeting times
        </h1>
        <p className="mb-6 text-stone-600">
          Based on all cohort schedules. Lower score = fewer unavoidable
          conflicts.
        </p>
        {loading && <p className="text-stone-500">Computing…</p>}
        {error && <p className="text-red-600">{error}</p>}
        {!loading && result && (
          <div className="space-y-4">
            {result.ranges.map((r, i) => (
              <div key={i} className="rounded-xl bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-semibold text-stone-900">{r.dayName}</span>
                  <span className="text-stone-600">
                    {r.firstStartHhmm}
                    {r.lastStartHhmm !== r.firstStartHhmm ? ` – ${r.lastStartHhmm}` : ""}
                  </span>
                  <span
                    className={
                      r.score === 0
                        ? "text-green-700"
                        : r.score <= 2
                          ? "text-amber-700"
                          : "text-stone-500"
                    }
                  >
                    score: {r.score}
                  </span>
                </div>
                {r.conflicts.length > 0 && (
                  <p className="mt-2 text-sm text-red-600">
                    Conflicts: {r.conflicts.join(", ")}
                  </p>
                )}
                {r.blockedCount > 0 && (
                  <p className="mt-1 text-sm text-stone-500">
                    Blocked ({r.blockedCount}): {r.blocked.join(", ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
        {!loading && result && result.ranges.length === 0 && (
          <p className="text-stone-500">
            No schedules in the system yet. Upload from the dashboard first.
          </p>
        )}
      </main>
    </div>
  );
}
