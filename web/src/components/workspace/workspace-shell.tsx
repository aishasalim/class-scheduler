"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Lock, LockOpen, LogOut, Pencil, Trash2, Users } from "lucide-react";
import type { CohortSummary } from "@/app/api/cohorts/route";
import {
  clearStoredParticipant,
  getStoredParticipant,
  type StoredParticipant,
} from "@/lib/participant";
import {
  courseCode,
  durationFromStartEnd,
  endTimeFromStartDuration,
  formatDays,
  formatMeetingLine,
  groupRowsByCourse,
  parseScheduleTime,
  rowToPayload,
  type ClassPriority,
  type ClientScheduleRow,
  type SharedCourse,
  type SharedCourseTime,
  type MeetingTimesResult,
} from "@/lib/schedule-types";
import { findScheduleConflicts, formatScheduleConflictError } from "@/lib/schedule-conflicts";
import { WeekGrid } from "@/components/workspace/week-grid";
import { SubjectCombobox } from "@/components/workspace/subject-combobox";
import { snapMeetingDuration } from "@/lib/tamu-schedule-blocks";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const emptyForm = (): ClientScheduleRow => ({
  subject: "",
  number: "",
  days: "",
  start: "",
  duration: 50,
});

const COHORT_WINDOW_MIN = 100;

// "13:50" -> "1:50–3:30 PM" (a 100-minute cohort meeting window).
function formatCohortWindow(startHhmm: string): string {
  const endHhmm = endTimeFromStartDuration(startHhmm, COHORT_WINDOW_MIN);
  const parts = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    const mer = h >= 12 ? "PM" : "AM";
    const hh = h % 12 === 0 ? 12 : h % 12;
    return { text: `${hh}:${m.toString().padStart(2, "0")}`, mer };
  };
  const s = parts(startHhmm);
  const e = parts(endHhmm);
  const startStr = s.mer === e.mer ? s.text : `${s.text} ${s.mer}`;
  return `${startStr}–${e.text} ${e.mer}`;
}

function normalizeRowDuration(row: ClientScheduleRow): ClientScheduleRow {
  return {
    ...row,
    duration: snapMeetingDuration(row.duration, row.days, row.duration >= 100),
  };
}

function rowsMatch(a: ClientScheduleRow, b: Pick<ClientScheduleRow, "subject" | "number" | "days" | "start">) {
  return (
    a.subject === b.subject &&
    a.number === b.number &&
    a.days === b.days &&
    a.start === b.start
  );
}

export function WorkspaceShell({ cohortId }: { cohortId: string }) {
  const [cohort, setCohort] = useState<CohortSummary | null>(null);
  const router = useRouter();

  const [session, setSession] = useState<StoredParticipant | null>(null);
  const [rows, setRows] = useState<ClientScheduleRow[] | null>(null);
  const [sharedCourses, setSharedCourses] = useState<SharedCourse[]>([]);
  const [activeTab, setActiveTab] = useState<"week" | "shared">("week");
  const [meetingTimes, setMeetingTimes] = useState<MeetingTimesResult | null>(null);
  const [stats, setStats] = useState<{ total: number; submitted: number } | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasting, setPasting] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [form, setForm] = useState<ClientScheduleRow>(emptyForm());
  const [formEnd, setFormEnd] = useState("");

  const courseGroups = useMemo(
    () => (rows ? groupRowsByCourse(rows) : []),
    [rows]
  );

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/cohorts");
        const all = res.ok ? ((await res.json()) as CohortSummary[]) : [];
        const found = all.find((c) => c.id === cohortId);
        setCohort(
          found ?? { id: cohortId, name: `Cohort ${cohortId}`, semesters: [], currentSemester: "", participantCount: 0 }
        );
      } catch {
        setCohort({ id: cohortId, name: `Cohort ${cohortId}`, semesters: [], currentSemester: "", participantCount: 0 });
      }
    })();
  }, [cohortId]);

  useEffect(() => {
    const stored = getStoredParticipant();
    if (!stored || stored.cohortId !== cohortId) {
      router.replace(`/c/${cohortId}/login`);
      return;
    }
    void (async () => {
      try {
        const res = await fetch(`/api/participants?cohort=${cohortId}`);
        if (!res.ok) {
          setSession(stored);
          return;
        }
        const roster = (await res.json()) as { id: string }[];
        if (!roster.some((p) => p.id === stored.id)) {
          clearStoredParticipant();
          router.replace(`/c/${cohortId}/login`);
          return;
        }
        setSession(stored);
      } catch {
        setSession(stored);
      }
    })();
  }, [cohortId, router]);

  const saveRows = useCallback(
    async (newRows: ClientScheduleRow[]) => {
      if (!session) return false;
      const conflicts = findScheduleConflicts(newRows);
      if (conflicts.length > 0) {
        setError(formatScheduleConflictError(conflicts));
        return false;
      }
      setSaving(true);
      setError("");
      try {
        const res = await fetch("/api/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            participantId: session.id,
            rows: newRows.map(rowToPayload),
          }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error || "Failed to save schedule");
        }
        setRows(newRows);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [session]
  );

  const refreshCohortData = useCallback(async () => {
    if (!session) return;
    const [sectionsRes, timesRes, statsRes] = await Promise.all([
      fetch(
        `/api/cohort/courses?cohort=${cohortId}&excludeParticipantId=${encodeURIComponent(session.id)}`
      ),
      fetch(`/api/meeting-times?cohort=${cohortId}`),
      fetch(`/api/cohort/stats?cohort=${cohortId}`),
    ]);
    if (sectionsRes.ok) setSharedCourses(await sectionsRes.json());
    if (timesRes.ok) setMeetingTimes(await timesRes.json());
    if (statsRes.ok) setStats(await statsRes.json());
  }, [cohortId, session]);

  const loadSchedule = useCallback(async () => {
    if (!session) return;
    const res = await fetch(
      `/api/schedule?participantId=${encodeURIComponent(session.id)}`
    );
    if (!res.ok) {
      setRows([]);
      return;
    }
    setRows(await res.json());
  }, [session]);

  useEffect(() => {
    if (!session) return;
    loadSchedule();
  }, [session, loadSchedule]);

  useEffect(() => {
    if (!session || rows === null) return;
    refreshCohortData();
  }, [session, rows, refreshCohortData]);

  const handlePasteText = async () => {
    if (!session || !pasteText.trim()) return;
    setPasting(true);
    setError("");
    try {
      const res = await fetch("/api/actions/parse-schedule-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pasteText }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const extracted = (data.rows ?? []).map(
        (r: Record<string, string | number | null | undefined>) => ({
          subject: String(r.subject ?? ""),
          number: String(r.number ?? ""),
          days: String(r.days ?? ""),
          start: String(r.start ?? ""),
          duration: Number(r.duration) || 50,
          lab: r.lab != null ? String(r.lab) : null,
          lab_days: r.lab_days != null ? String(r.lab_days) : null,
          lab_start: r.lab_start != null ? String(r.lab_start) : null,
          lab_duration: r.lab_duration != null ? Number(r.lab_duration) : null,
        })
      );
      if (extracted.length === 0) throw new Error("No classes found in text");
      const ok = await saveRows(extracted);
      if (ok) setPasteText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not parse text");
    } finally {
      setPasting(false);
    }
  };

  const handleDeleteCourse = async (code: string) => {
    if (!rows) return;
    await saveRows(rows.filter((r) => courseCode(r) !== code));
  };

  // Set priority for every section/lab of a course (subject+number) at once.
  const setCoursePriority = async (code: string, priority: ClassPriority) => {
    if (!rows) return;
    const next = rows.map((r) =>
      courseCode(r) === code ? { ...r, priority } : r
    );
    setRows(next); // optimistic — keep the toggle snappy
    await saveRows(next);
  };

  const openAddForm = () => {
    setShowForm(true);
    setEditingIndex(null);
    setForm(emptyForm());
    setFormEnd("");
  };

  const openEditForm = (row: ClientScheduleRow, index: number) => {
    const normalized = normalizeRowDuration(row);
    setForm(normalized);
    setFormEnd(endTimeFromStartDuration(normalized.start, normalized.duration));
    setEditingIndex(index);
    setShowForm(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rows) return;
    const next = [...rows];
    const days = form.days.trim().toUpperCase();
    const start = parseScheduleTime(form.start.trim());
    const duration = durationFromStartEnd(start, formEnd.trim(), days);
    const normalized = normalizeRowDuration({
      ...form,
      subject: form.subject.trim().toUpperCase(),
      number: form.number.trim(),
      days,
      start,
      duration,
      lab: null,
      lab_days: null,
      lab_start: null,
      lab_duration: null,
    });
    if (editingIndex === null) next.push(normalized);
    else next[editingIndex] = { ...next[editingIndex], ...normalized };
    const ok = await saveRows(next);
    if (ok) {
      setShowForm(false);
      setEditingIndex(null);
      setForm(emptyForm());
      setFormEnd("");
    }
  };

  const joinCourseTime = async (course: SharedCourse, time: SharedCourseTime) => {
    if (!rows) return;
    const exists = rows.some((r) =>
      rowsMatch(r, {
        subject: course.subject,
        number: course.number,
        days: time.days,
        start: time.start,
      })
    );
    if (exists) return;
    await saveRows([
      ...rows,
      {
        subject: course.subject,
        number: course.number,
        days: time.days,
        start: time.start,
        duration: time.duration,
      },
    ]);
  };

  const leaveCourse = async (course: SharedCourse) => {
    if (!rows) return;
    await saveRows(
      rows.filter((r) => !(r.subject === course.subject && r.number === course.number))
    );
  };

  const scheduleConflicts = useMemo(
    () => (rows ? findScheduleConflicts(rows) : []),
    [rows]
  );

  const cohortWindows = meetingTimes?.ranges ?? [];

  if (!cohort || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border/80 bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-lg font-semibold">ZLP Scheduler</h1>
              <Badge variant="secondary">{cohort.name}</Badge>
              {(() => {
                const sem = cohort.currentSemester || cohort.semesters[0];
                return sem ? <Badge variant="outline">{sem}</Badge> : null;
              })()}
            </div>
            <p className="truncate text-sm text-muted-foreground">{session.name}</p>
          </div>
          {stats ? (
            <Badge variant="outline" className="hidden sm:inline-flex">
              {stats.submitted}/{stats.total} schedules in
            </Badge>
          ) : null}
          <ThemeToggle />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              clearStoredParticipant();
              router.push(`/c/${cohortId}/login`);
            }}
          >
            <LogOut className="mr-1.5 size-4" />
            Log out
          </Button>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[300px_1fr] sm:px-6">
        <aside className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">My schedule</CardTitle>
              <CardDescription>Paste your schedule text, or add classes manually</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Primary: paste text — exact, no AI guessing */}
              <div className="space-y-2 rounded-xl border border-primary/40 bg-primary/5 p-3">
                <p className="text-sm font-medium">Paste your schedule (recommended)</p>
                <p className="text-xs text-muted-foreground">
                  In Schedule Builder open <strong>Current Schedule</strong>, copy the course list
                  (days &amp; times), and paste below. Read exactly — no guessing.
                </p>
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  rows={5}
                  placeholder={"TTh 12:45pm - 2:00pm 08/25/2026 - 12/10/2026 ZACH 310\nMWF 3:00pm - 3:50pm 08/24/2026 - 12/09/2026 CHEM 2104\n..."}
                  className="w-full resize-y rounded-md border border-border/80 bg-background p-2 text-xs font-mono outline-none focus:border-primary/50"
                />
                <Button
                  size="sm"
                  className="w-full"
                  disabled={pasting || saving || !pasteText.trim()}
                  onClick={() => void handlePasteText()}
                >
                  {pasting ? (
                    <>
                      <Loader2 className="mr-1.5 size-4 animate-spin" />
                      Reading…
                    </>
                  ) : (
                    "Read schedule from text"
                  )}
                </Button>
              </div>

              {error ? <p className="text-sm text-destructive">{error}</p> : null}

              <div className="flex flex-col gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-muted-foreground"
                  onClick={openAddForm}
                >
                  Add class
                </Button>
              </div>

              {showForm ? (
                <form onSubmit={handleFormSubmit} className="space-y-2 rounded-lg border border-border/80 p-3">
                  <SubjectCombobox
                    value={form.subject}
                    onChange={(subject) => setForm((f) => ({ ...f, subject }))}
                    required
                    disabled={saving}
                  />
                  <Input
                    placeholder="Number (350)"
                    value={form.number}
                    onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
                    required
                  />
                  <Input
                    placeholder="Days (MWF)"
                    value={form.days}
                    onChange={(e) => setForm((f) => ({ ...f, days: e.target.value }))}
                    required
                  />
                  <Input
                    placeholder="Start (10:20)"
                    value={form.start}
                    onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))}
                    required
                  />
                  <Input
                    placeholder="End (11:10)"
                    value={formEnd}
                    onChange={(e) => setFormEnd(e.target.value)}
                    required
                  />
                  <div className="flex gap-2 pt-1">
                    <Button type="submit" size="sm" disabled={saving}>
                      {saving ? "Saving…" : "Save"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowForm(false);
                        setEditingIndex(null);
                        setFormEnd("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : null}

              {rows === null ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No classes yet. Paste your schedule to get started.
                </p>
              ) : (
                <ul className="space-y-2">
                  {courseGroups.map((group) => {
                    const isUnmovable =
                      (group.meetings[0]?.row.priority ?? "movable") === "unmovable";
                    return (
                    <li
                      key={group.code}
                      className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2.5"
                    >
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-mono text-sm font-semibold leading-tight">
                            {group.code}
                          </div>
                          <div className="mt-1.5 space-y-0.5">
                            {group.meetings.map((meeting, mi) => (
                              <p
                                key={`${group.code}-${meeting.part}-${meeting.rowIndex}-${mi}`}
                                className="text-[11px] leading-snug text-muted-foreground"
                              >
                                {formatMeetingLine(meeting)}
                              </p>
                            ))}
                          </div>
                          <button
                            type="button"
                            disabled={saving}
                            title={
                              isUnmovable
                                ? "Unmovable — a cohort window can never overlap this class. Click to allow overlap."
                                : "Movable — a cohort window may overlap this class (you'd re-register). Click to protect it."
                            }
                            onClick={() =>
                              void setCoursePriority(
                                group.code,
                                isUnmovable ? "movable" : "unmovable"
                              )
                            }
                            className="mt-2 inline-flex"
                          >
                            <Badge
                              variant={isUnmovable ? "default" : "outline"}
                              className={
                                isUnmovable
                                  ? "cursor-pointer bg-amber-500 text-white hover:bg-amber-500/90 dark:bg-amber-500 dark:text-black"
                                  : "cursor-pointer border-border/60 text-muted-foreground hover:bg-muted"
                              }
                            >
                              {isUnmovable ? (
                                <Lock className="size-3" />
                              ) : (
                                <LockOpen className="size-3" />
                              )}
                              {isUnmovable ? "Unmovable" : "Movable"}
                            </Badge>
                          </button>
                        </div>
                        <div className="flex shrink-0 gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="size-7"
                            title="Edit"
                            onClick={() => {
                              const main = group.meetings.find((m) => m.part === "main");
                              if (main) openEditForm(main.row, main.rowIndex);
                            }}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="size-7"
                            title="Remove"
                            onClick={() => void handleDeleteCourse(group.code)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </aside>

        <div className="space-y-6">
          <Card className="border-primary/20">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-1 rounded-lg bg-muted/50 p-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("week")}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    activeTab === "week"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Your week
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("shared")}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    activeTab === "shared"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Shared sections
                  {sharedCourses.length > 0 ? (
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      {sharedCourses.length}
                    </span>
                  ) : null}
                </button>
              </div>
              {activeTab === "week" ? (
                <CardDescription className="pt-2">
                  Your classes for the week. Cohort meeting windows are listed below the grid.
                </CardDescription>
              ) : (
                <CardDescription className="flex items-center gap-1.5 pt-2">
                  <Users className="size-3.5" />
                  Classes you share with classmates (same subject &amp; number)
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {activeTab === "week" ? (
                <>
                  {scheduleConflicts.length > 0 ? (
                    <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {formatScheduleConflictError(scheduleConflicts)} Edit times in My schedule.
                    </div>
                  ) : null}
                  <WeekGrid myRows={rows ?? []} />
                  {cohortWindows.length > 0 ? (
                    <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/10 p-3">
                      <p className="text-sm font-medium">Best cohort meeting windows</p>
                      <ul className="space-y-1 text-sm text-muted-foreground">
                        {cohortWindows.slice(0, 6).map((w) => (
                          <li key={`${w.day}-${w.firstStartHhmm}`} className="flex items-baseline gap-2">
                            <span className="font-medium text-foreground">{w.dayName}</span>
                            <span className="tabular-nums">{formatCohortWindow(w.firstStartHhmm)}</span>
                            <span
                              className={`text-xs ${w.unmovableCount > 0 ? "text-amber-600 dark:text-amber-500" : ""}`}
                              title={
                                w.unmovableCount > 0
                                  ? `Blocks unmovable classes: ${w.unmovableNames.join(", ")}`
                                  : w.score > 0
                                    ? `Would re-register: ${w.reRegisterNames.join(", ")}`
                                    : undefined
                              }
                            >
                              {w.unmovableCount > 0
                                ? `${w.unmovableCount} unmovable`
                                : w.score === 0
                                  ? "everyone free"
                                  : `${w.score} re-register`}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </>
              ) : sharedCourses.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No shared classes yet — a class appears here once two or more classmates are in
                  the same subject and number.
                </p>
              ) : (
                sharedCourses.map((course) => (
                  <div
                    key={course.course}
                    className="flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/10 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-semibold">{course.course}</span>
                          <Badge variant="outline">{course.count} in cohort</Badge>
                          {course.mine ? (
                            <Badge className="bg-primary/20 text-primary">You</Badge>
                          ) : null}
                        </div>
                        {course.names ? (
                          <p className="mt-1 text-xs text-muted-foreground">{course.names}</p>
                        ) : null}
                      </div>
                      {course.mine ? (
                        <Button variant="ghost" size="sm" onClick={() => void leaveCourse(course)}>
                          Leave
                        </Button>
                      ) : null}
                    </div>
                    {!course.mine && course.times.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {course.times.map((time) => (
                          <Button
                            key={`${time.days}-${time.start}`}
                            variant="secondary"
                            size="sm"
                            onClick={() => void joinCourseTime(course, time)}
                            title={`${time.names} · ${time.count} ${time.count === 1 ? "person" : "people"}`}
                          >
                            Join {formatDays(time.days)} {parseScheduleTime(time.start)}–
                            {endTimeFromStartDuration(time.start, time.duration)}
                          </Button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
