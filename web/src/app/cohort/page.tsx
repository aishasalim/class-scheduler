"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getStoredParticipant } from "@/lib/participant";

type OtherEntry = { name: string; days: string; start: string; duration: number };
type CourseItem = { course: string; others: OtherEntry[] };

function formatDays(days: string): string {
  return days ? days.split("").join("/") : "";
}

export default function CohortPage() {
  const participant = getStoredParticipant();
  const [courses, setCourses] = useState<CourseItem[] | null>(null);

  useEffect(() => {
    const url = participant?.id
      ? `/api/cohort/courses?excludeParticipantId=${encodeURIComponent(participant.id)}`
      : "/api/cohort/courses";
    fetch(url)
      .then((res) => res.json())
      .then(setCourses)
      .catch(() => setCourses([]));
  }, [participant?.id]);

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
        <h1 className="mb-6 text-2xl font-bold text-stone-900">
          Who has the same classes
        </h1>
        <p className="mb-6 text-stone-600">
          Courses where other cohort members are enrolled. Shown with their day and time (you are excluded).
        </p>
        {courses === null ? (
          <p className="text-stone-500">Loading…</p>
        ) : courses.length === 0 ? (
          <p className="text-stone-500">
            No other schedules with overlapping courses. Upload from the dashboard to see overlap.
          </p>
        ) : (
          <ul className="space-y-4">
            {courses.map((item) => (
              <li key={item.course} className="rounded-xl bg-white p-4 shadow-sm">
                <span className="font-semibold text-stone-900">{item.course}</span>
                <ul className="mt-2 space-y-1.5 text-sm text-stone-600">
                  {item.others.map((o, i) => (
                    <li key={i}>
                      <span className="font-medium text-stone-700">{o.name}</span>
                      {" — "}
                      <span>{formatDays(o.days)}</span>
                      <span className="mx-1">·</span>
                      <span>{o.start}</span>
                      <span> ({o.duration} min)</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
