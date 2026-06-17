"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Plus, UserPlus, X } from "lucide-react";
import { setStoredParticipant } from "@/lib/participant";
import type { CohortSummary } from "@/app/api/cohorts/route";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

type Participant = { id: string; name: string };

// Only Fall/Spring exist; advance Spring Y → Fall Y → Spring Y+1 …
function nextSemester(current: string | undefined): string {
  const m = (current ?? "").match(/(spring|fall)\s+(\d{4})/i);
  if (!m) return "Fall 2026";
  const term = m[1].toLowerCase();
  const year = parseInt(m[2], 10);
  return term === "spring" ? `Fall ${year}` : `Spring ${year + 1}`;
}

export default function CohortLoginPage() {
  const params = useParams();
  const cohortId = String(params.cohort ?? "").toUpperCase();
  const router = useRouter();

  const [cohort, setCohort] = useState<CohortSummary | null>(null);
  const [cohortLoaded, setCohortLoaded] = useState(false);
  const [participants, setParticipants] = useState<Participant[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [bootstrapping, setBootstrapping] = useState(true);

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newMajor, setNewMajor] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [savingSemester, setSavingSemester] = useState(false);
  const [cohortPassword, setCohortPassword] = useState("");
  const [passwordDraft, setPasswordDraft] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");

  const loadParticipants = useCallback(async () => {
    const res = await fetch(`/api/participants?cohort=${cohortId}`);
    if (!res.ok) {
      setParticipants([]);
      return;
    }
    const data = (await res.json()) as Participant[];
    setParticipants(data);
  }, [cohortId]);

  useEffect(() => {
    (async () => {
      await fetch("/api/init");
      const res = await fetch("/api/cohorts");
      const all = res.ok ? ((await res.json()) as CohortSummary[]) : [];
      const found = all.find((c) => c.id === cohortId) ?? null;
      setCohort(found);
      setCohortLoaded(true);
      if (!found) {
        setBootstrapping(false);
        return;
      }
      // Cohort K has a built-in roster to seed; other cohorts start empty.
      await fetch("/api/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cohort: cohortId }),
      }).catch(() => {});
      await loadParticipants();
      setBootstrapping(false);
    })();
  }, [cohortId, loadParticipants]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!participants) return [];
    if (!q) return participants;
    return participants.filter((p) => p.name.toLowerCase().includes(q));
  }, [participants, query]);

  const selectParticipant = useCallback(
    (p: Participant) => {
      setStoredParticipant({ cohortId, id: p.id, name: p.name });
      router.push(`/c/${cohortId}`);
    },
    [cohortId, router]
  );

  const addPerson = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    setAddError("");
    try {
      const res = await fetch("/api/participants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cohort: cohortId, name, major: newMajor.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not add person");
      await loadParticipants();
      setNewName("");
      setNewMajor("");
      setShowAdd(false);
      setQuery(name);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Could not add person");
    } finally {
      setAdding(false);
    }
  }, [cohortId, newName, newMajor, loadParticipants]);

  const patchCohort = useCallback(
    async (payload: { semesters?: string[]; currentSemester?: string; password?: string }) => {
      setSavingSemester(true);
      setCohort((c) => (c ? { ...c, ...payload } : c));
      try {
        await fetch("/api/cohorts", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: cohortId, ...payload }),
        });
      } catch {
        /* keep optimistic value */
      } finally {
        setSavingSemester(false);
      }
    },
    [cohortId]
  );

  const savePassword = useCallback(async () => {
    setSavingPassword(true);
    setPasswordMessage("");
    try {
      const res = await fetch("/api/cohorts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cohortId, password: passwordDraft.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save password");
      setCohortPassword(passwordDraft.trim());
      setPasswordMessage("Import password saved.");
    } catch (e) {
      setPasswordMessage(e instanceof Error ? e.message : "Could not save password");
    } finally {
      setSavingPassword(false);
    }
  }, [cohortId, passwordDraft]);

  const selectSemester = useCallback(
    (value: string) => {
      if (cohort?.currentSemester === value) return;
      void patchCohort({ currentSemester: value });
    },
    [cohort?.currentSemester, patchCohort]
  );

  const addSemester = useCallback(() => {
    const current = cohort?.semesters ?? [];
    const next = nextSemester(current[current.length - 1]);
    if (current.includes(next)) return;
    void patchCohort({ semesters: [...current, next] });
  }, [cohort?.semesters, patchCohort]);

  const removeSemester = useCallback(
    (value: string) => {
      const current = cohort?.semesters ?? [];
      const remaining = current.filter((s) => s !== value);
      const payload: { semesters: string[]; currentSemester?: string } = {
        semesters: remaining,
      };
      if (cohort?.currentSemester === value) {
        payload.currentSemester = remaining[0] ?? "";
      }
      void patchCohort(payload);
    },
    [cohort?.semesters, cohort?.currentSemester, patchCohort]
  );

  if (cohortLoaded && !cohort) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Unknown cohort</CardTitle>
            <CardDescription>Cohort &quot;{cohortId}&quot; does not exist yet.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/">
              <Button variant="secondary">Back to home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-background px-6 py-10">
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>
      <div className="mx-auto max-w-lg space-y-8">
        <Link href="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-2 size-4" />
          All cohorts
        </Link>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {(cohort?.semesters ?? []).map((sem) => {
              const selected = cohort?.currentSemester === sem;
              return (
                <div
                  key={sem}
                  className={`inline-flex items-center gap-1 rounded-full border py-1 pl-3 pr-1 text-sm font-medium transition-colors ${
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border/80 bg-transparent text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => selectSemester(sem)}
                    disabled={savingSemester}
                    title={selected ? `${sem} (current semester)` : `Set ${sem} as current semester`}
                    aria-pressed={selected}
                    className="disabled:opacity-50"
                  >
                    {sem}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSemester(sem)}
                    disabled={savingSemester}
                    title={`Remove ${sem}`}
                    aria-label={`Remove ${sem}`}
                    className={`inline-flex size-4 items-center justify-center rounded-full transition-colors disabled:opacity-50 ${
                      selected
                        ? "text-primary-foreground/70 hover:bg-primary-foreground/20 hover:text-primary-foreground"
                        : "text-muted-foreground/70 hover:bg-foreground/10 hover:text-foreground"
                    }`}
                  >
                    <X className="size-3" />
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              onClick={addSemester}
              disabled={savingSemester}
              title="Add next semester"
              aria-label="Add next semester"
              className="inline-flex size-6 items-center justify-center rounded-full border border-border/80 text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-50"
            >
              {savingSemester ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
            </button>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{cohort?.name ?? `Cohort ${cohortId}`}</h1>
          <p className="text-muted-foreground">Find your name to open your cohort workspace.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Extension import password</CardTitle>
            <CardDescription>
              Students enter this once in the Chrome extension to save schedules.
              {cohortPassword ? " A password is set." : " Not set yet — set one before students import."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              type="password"
              placeholder={cohortPassword ? "Enter new password to change" : "Set cohort import password"}
              value={passwordDraft}
              onChange={(e) => {
                setPasswordDraft(e.target.value);
                setPasswordMessage("");
              }}
            />
            {passwordMessage ? (
              <p className={`text-sm ${passwordMessage.includes("saved") ? "text-green-600" : "text-destructive"}`}>
                {passwordMessage}
              </p>
            ) : null}
            <Button size="sm" onClick={() => void savePassword()} disabled={savingPassword || !passwordDraft.trim()}>
              {savingPassword ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
              Save password
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Who are you?</CardTitle>
            <CardDescription>{participants?.length ?? 0} students in this cohort</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="Search your name…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setError("");
              }}
              autoFocus
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {bootstrapping || participants === null ? (
              <p className="text-sm text-muted-foreground">Loading roster…</p>
            ) : (
              <ScrollArea className="h-72 rounded-lg border border-border/80">
                <div className="p-1">
                  {participants && participants.length === 0 ? (
                    <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                      No members in this cohort yet.
                    </p>
                  ) : filtered.length === 0 ? (
                    <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                      No matches. Try your first or last name.
                    </p>
                  ) : (
                    filtered.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => selectParticipant(p)}
                        className="flex w-full rounded-md px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent"
                      >
                        {p.name}
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
            )}

            {showAdd ? (
              <div className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
                <Input
                  placeholder="Full name"
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value);
                    setAddError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void addPerson();
                  }}
                  autoFocus
                />
                <Input
                  placeholder="Major (optional)"
                  value={newMajor}
                  onChange={(e) => setNewMajor(e.target.value)}
                />
                {addError ? <p className="text-sm text-destructive">{addError}</p> : null}
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void addPerson()} disabled={adding || !newName.trim()}>
                    {adding ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
                    Add
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setShowAdd(false);
                      setAddError("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" className="w-full" onClick={() => setShowAdd(true)}>
                <UserPlus className="mr-2 size-4" />
                Add someone new
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
