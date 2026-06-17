"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Loader2, Pencil, Trash2, Users, X } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { WeekGrid } from "@/components/workspace/week-grid";
import { cohortImportPassword } from "@/lib/cohorts";
import type { ClientScheduleRow, MeetingTimesResult } from "@/lib/schedule-types";

type Person = { id: string; name: string };

// "13:50" -> "1:50–3:30 PM" (a 100-minute cohort meeting window).
function formatWindow(startHhmm: string): string {
  const [h, m] = startHhmm.split(":").map(Number);
  const endTotal = h * 60 + m + 100;
  const fmt = (mins: number) => {
    const hh = Math.floor(mins / 60);
    const mm = mins % 60;
    const mer = hh >= 12 ? "PM" : "AM";
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    return { text: `${h12}:${mm.toString().padStart(2, "0")}`, mer };
  };
  const s = fmt(h * 60 + m);
  const e = fmt(endTotal);
  const startStr = s.mer === e.mer ? s.text : `${s.text} ${s.mer}`;
  return `${startStr}–${e.text} ${e.mer}`;
}

export default function AdminCohortPage() {
  const params = useParams();
  const cohortId = String(params.cohort ?? "").toUpperCase();
  const router = useRouter();

  const [authed, setAuthed] = useState<boolean | null>(null);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [meetingTimes, setMeetingTimes] = useState<MeetingTimesResult | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadPeople = useCallback(async () => {
    const res = await fetch(`/api/participants?cohort=${cohortId}`);
    setPeople(res.ok ? ((await res.json()) as Person[]) : []);
  }, [cohortId]);

  const loadTimes = useCallback(async () => {
    const res = await fetch(`/api/meeting-times?cohort=${cohortId}`);
    if (res.ok) setMeetingTimes(await res.json());
  }, [cohortId]);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/session");
      const data = (await res.json().catch(() => ({ admin: false }))) as { admin: boolean };
      if (!data.admin) {
        router.replace("/admin/login");
        return;
      }
      setAuthed(true);
      await Promise.all([loadPeople(), loadTimes()]);
    })();
  }, [router, loadPeople, loadTimes]);

  const saveName = async (id: string) => {
    const name = editName.trim();
    if (!name) return;
    setBusyId(id);
    setError("");
    try {
      const res = await fetch("/api/participants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not rename");
      }
      setEditingId(null);
      await loadPeople();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not rename");
    } finally {
      setBusyId(null);
    }
  };

  const deletePerson = async (id: string, name: string) => {
    if (!confirm(`Delete ${name} and their schedule? This cannot be undone.`)) return;
    setBusyId(id);
    setError("");
    try {
      const res = await fetch(`/api/participants?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not delete");
      }
      await Promise.all([loadPeople(), loadTimes()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
    } finally {
      setBusyId(null);
    }
  };

  // Best recommended window per day, rendered as highlighted blocks on the grid.
  const windowRows: ClientScheduleRow[] = useMemo(
    () =>
      (meetingTimes?.ranges ?? []).map((r) => ({
        subject: "MEET",
        number: "",
        days: r.day,
        start: r.firstStartHhmm,
        duration: 100,
      })),
    [meetingTimes]
  );

  if (authed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const ranges = meetingTimes?.ranges ?? [];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border/80 bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0 flex-1">
            <Link href="/admin" className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground">
              <ArrowLeft className="mr-1 size-3.5" />
              All cohorts
            </Link>
            <h1 className="flex items-center gap-2 text-lg font-semibold">
              <span className="font-mono text-primary">{cohortId}</span>
              Cohort manager
            </h1>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[360px_1fr] sm:px-6">
        {/* People */}
        <section>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="size-4" />
                Members
              </CardTitle>
              <CardDescription>
                {people?.length ?? 0} students · import password{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                  {cohortImportPassword(cohortId)}
                </code>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              {people === null ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : people.length === 0 ? (
                <p className="text-sm text-muted-foreground">No members in this cohort.</p>
              ) : (
                <ul className="space-y-1">
                  {people.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2"
                    >
                      {editingId === p.id ? (
                        <>
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void saveName(p.id);
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            autoFocus
                            className="h-8"
                          />
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="size-8 text-primary"
                            disabled={busyId === p.id || !editName.trim()}
                            title="Save"
                            onClick={() => void saveName(p.id)}
                          >
                            {busyId === p.id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="size-8 text-muted-foreground"
                            title="Cancel"
                            onClick={() => setEditingId(null)}
                          >
                            <X className="size-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="size-8 text-muted-foreground"
                            title="Rename"
                            onClick={() => {
                              setEditingId(p.id);
                              setEditName(p.name);
                            }}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="size-8 text-muted-foreground hover:text-destructive"
                            title="Delete"
                            disabled={busyId === p.id}
                            onClick={() => void deletePerson(p.id, p.name)}
                          >
                            {busyId === p.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="size-3.5" />
                            )}
                          </Button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Best class times */}
        <section>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Best cohort meeting times</CardTitle>
              <CardDescription>
                Recommended 100-minute windows across the week (best per day highlighted).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <WeekGrid myRows={windowRows} />
              {ranges.length > 0 ? (
                <ul className="space-y-1 rounded-lg border border-border/60 bg-muted/10 p-3 text-sm">
                  {ranges.map((r) => (
                    <li key={`${r.day}-${r.firstStartHhmm}`} className="flex items-baseline gap-2">
                      <span className="w-24 font-medium text-foreground">{r.dayName}</span>
                      <span className="tabular-nums">{formatWindow(r.firstStartHhmm)}</span>
                      <Badge
                        variant={r.unmovableCount > 0 ? "default" : "outline"}
                        className={r.unmovableCount > 0 ? "bg-amber-500 text-black" : ""}
                      >
                        {r.unmovableCount > 0
                          ? `${r.unmovableCount} unmovable`
                          : r.score === 0
                            ? "everyone free"
                            : `${r.score} re-register`}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No meeting windows yet — add schedules to this cohort first.
                </p>
              )}
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
