"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Loader2, LogOut, Plus, Trash2, Users } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cohortImportPassword } from "@/lib/cohorts";
import type { CohortSummary } from "@/app/api/cohorts/route";

export default function AdminDashboardPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [cohorts, setCohorts] = useState<CohortSummary[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newSemester, setNewSemester] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/cohorts");
    setCohorts(res.ok ? await res.json() : []);
  }, []);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/session");
      const data = (await res.json().catch(() => ({ admin: false }))) as { admin: boolean };
      if (!data.admin) {
        router.replace("/admin/login");
        return;
      }
      setAuthed(true);
      await load();
    })();
  }, [router, load]);

  const createCohort = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/cohorts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: newId, name: newName, semester: newSemester }),
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

  const deleteCohort = async (id: string, name: string) => {
    if (!confirm(`Delete ${name} and all its members and schedules? This cannot be undone.`)) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/cohorts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not delete cohort");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete cohort");
    } finally {
      setDeletingId(null);
    }
  };

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
  };

  if (authed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border/80 bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
          <div className="flex-1">
            <h1 className="text-lg font-semibold">Admin</h1>
            <p className="text-sm text-muted-foreground">Manage cohorts and members</p>
          </div>
          <ThemeToggle />
          <Button variant="ghost" size="sm" onClick={() => void logout()}>
            <LogOut className="mr-1.5 size-4" />
            Log out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-6 sm:px-6">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">Cohorts</p>
          <Button size="sm" variant="secondary" onClick={() => setShowForm((v) => !v)}>
            <Plus className="mr-1.5 size-4" />
            Add cohort
          </Button>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {showForm ? (
          <Card className="border-primary/40 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">New cohort</CardTitle>
              <CardDescription>
                Import password is set automatically once created.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <Input placeholder="Code (e.g. L)" value={newId} maxLength={8} onChange={(e) => setNewId(e.target.value)} />
                <Input
                  placeholder="Name (e.g. Cohort L)"
                  value={newName}
                  className="sm:col-span-2"
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <Input placeholder="Semester (e.g. Fall 2026)" value={newSemester} onChange={(e) => setNewSemester(e.target.value)} />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void createCohort()} disabled={saving || !newId.trim() || !newName.trim()}>
                  {saving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
                  Create
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
            Loading…
          </div>
        ) : cohorts.length === 0 ? (
          <p className="py-8 text-sm text-muted-foreground">No cohorts yet.</p>
        ) : (
          <div className="grid gap-3">
            {cohorts.map((cohort) => (
              <Card key={cohort.id}>
                <CardContent className="flex items-center gap-4 py-4">
                  <Link href={`/admin/c/${cohort.id}`} className="group flex min-w-0 flex-1 items-center gap-4">
                    <span className="font-mono text-2xl text-primary">{cohort.id}</span>
                    <div className="min-w-0">
                      <p className="font-medium group-hover:underline">{cohort.name}</p>
                      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Users className="size-3" />
                          {cohort.participantCount} students
                        </span>
                        <span>·</span>
                        <span>
                          import password:{" "}
                          <code className="rounded bg-muted px-1 py-0.5 font-mono">
                            {cohortImportPassword(cohort.id)}
                          </code>
                        </span>
                      </p>
                    </div>
                  </Link>
                  {cohort.currentSemester ? (
                    <Badge variant="outline" className="hidden sm:inline-flex">
                      {cohort.currentSemester}
                    </Badge>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    title={`Delete ${cohort.name}`}
                    disabled={deletingId === cohort.id}
                    onClick={() => void deleteCohort(cohort.id, cohort.name)}
                  >
                    {deletingId === cohort.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
