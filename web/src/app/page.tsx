"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { CohortSummary } from "@/app/api/cohorts/route";

export default function LandingPage() {
  const [cohorts, setCohorts] = useState<CohortSummary[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newSemester, setNewSemester] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/cohorts");
    if (res.ok) setCohorts(await res.json());
    else setCohorts([]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createCohort = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/cohorts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: newId,
          name: newName,
          semester: newSemester,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create cohort");
      setNewId("");
      setNewName("");
      setNewSemester("");
      setShowForm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create cohort");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 bg-primary/[0.07] dark:bg-primary/[0.14]" />
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>
      <main className="relative mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-6 py-16">
        <div className="mb-10 space-y-3">
          <Badge variant="secondary" className="font-mono text-xs uppercase tracking-widest">
            Zachry Leadership Program
          </Badge>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            ZLP Scheduler
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            Upload your schedule, see who shares your sections, and find the best 100-minute
            meeting window for your cohort.
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">Select your cohort</p>
            <Button size="sm" variant="secondary" onClick={() => setShowForm((v) => !v)}>
              <Plus className="mr-1.5 size-4" />
              Add cohort
            </Button>
          </div>

          {showForm ? (
            <Card className="border-primary/40 bg-primary/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">New cohort</CardTitle>
                <CardDescription>
                  Create the cohort now — you can add its members next.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Input
                    placeholder="Code (e.g. L)"
                    value={newId}
                    onChange={(e) => setNewId(e.target.value)}
                    maxLength={8}
                  />
                  <Input
                    placeholder="Name (e.g. Cohort L)"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="sm:col-span-2"
                  />
                </div>
                <Input
                  placeholder="Semester (e.g. Fall 2026)"
                  value={newSemester}
                  onChange={(e) => setNewSemester(e.target.value)}
                />
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => void createCohort()}
                    disabled={saving || !newId.trim() || !newName.trim()}
                  >
                    {saving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
                    Create cohort
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {cohorts === null ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading cohorts…
            </div>
          ) : cohorts.length === 0 ? (
            <p className="py-8 text-sm text-muted-foreground">
              No cohorts yet. Add one to get started.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {cohorts.map((cohort) => (
                <Link key={cohort.id} href={`/c/${cohort.id}/login`} className="group block">
                  <Card className="border-border/80 transition-colors group-hover:border-primary/50 group-hover:bg-card/80">
                    <CardHeader>
                      <CardTitle className="flex items-baseline gap-3">
                        <span className="font-mono text-3xl text-primary">{cohort.id}</span>
                        <span>{cohort.name}</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        {cohort.participantCount} students
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>

      <footer className="relative mx-auto w-full max-w-4xl px-6 pb-8 pt-4">
        <p className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-center text-xs text-muted-foreground">
          <span>An open-source project maintained by students.</span>
          <a
            href="https://github.com/aishasalim/class-scheduler"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
              className="size-3.5"
            >
              <path d="M12 .5C5.37.5 0 5.78 0 12.29c0 5.21 3.44 9.63 8.21 11.19.6.11.82-.25.82-.57 0-.28-.01-1.02-.02-2.01-3.34.71-4.04-1.58-4.04-1.58-.55-1.37-1.34-1.74-1.34-1.74-1.09-.73.08-.71.08-.71 1.2.08 1.84 1.21 1.84 1.21 1.07 1.8 2.81 1.28 3.5.98.11-.76.42-1.28.76-1.58-2.67-.3-5.47-1.31-5.47-5.81 0-1.28.47-2.33 1.23-3.15-.12-.3-.53-1.51.12-3.15 0 0 1-.31 3.3 1.2a11.6 11.6 0 0 1 3-.4c1.02 0 2.05.13 3 .4 2.28-1.51 3.29-1.2 3.29-1.2.65 1.64.24 2.85.12 3.15.77.82 1.23 1.87 1.23 3.15 0 4.51-2.81 5.5-5.49 5.8.43.36.81 1.08.81 2.18 0 1.58-.01 2.85-.01 3.24 0 .32.21.69.83.57A12.02 12.02 0 0 0 24 12.29C24 5.78 18.63.5 12 .5Z" />
            </svg>
            View on GitHub
          </a>
          <span aria-hidden="true">·</span>
          <Link
            href="/admin/login"
            className="underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            Log in as admin
          </Link>
        </p>
      </footer>
    </div>
  );
}
