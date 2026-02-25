"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { getStoredParticipant, clearStoredParticipant } from "@/lib/participant";

type ScheduleRow = {
  subject: string;
  number: string;
  days: string;
  start: string;
  duration: number;
  lab?: string | null;
  lab_days?: string | null;
  lab_start?: string | null;
  lab_duration?: number | null;
};

const emptyForm = (): ScheduleRow => ({
  subject: "",
  number: "",
  days: "",
  start: "",
  duration: 50,
  lab: null,
  lab_days: null,
  lab_start: null,
  lab_duration: null,
});

function rowToPayload(r: ScheduleRow) {
  return {
    subject: r.subject,
    number: r.number,
    days: r.days,
    start: r.start,
    duration: r.duration,
    lab: r.lab ?? undefined,
    labDays: r.lab_days ?? undefined,
    labStart: r.lab_start ?? undefined,
    labDuration: r.lab_duration ?? undefined,
  };
}

export default function DashboardPage() {
  const participant = getStoredParticipant();
  const router = useRouter();
  const [rows, setRows] = useState<ScheduleRow[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [form, setForm] = useState<ScheduleRow>(emptyForm());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const participantId = participant?.id;

  const loadSchedule = useCallback(async () => {
    if (!participantId) return;
    const res = await fetch(`/api/schedule?participantId=${encodeURIComponent(participantId)}`);
    if (!res.ok) {
      setRows([]);
      return;
    }
    const data = await res.json();
    setRows(data);
  }, [participantId]);

  useEffect(() => {
    if (!participantId) {
      router.replace("/login");
      return;
    }
    loadSchedule();
  }, [participantId, router, loadSchedule]);

  const saveRows = useCallback(
    async (newRows: ScheduleRow[]) => {
      if (!participantId) return;
      setSaving(true);
      try {
        const res = await fetch("/api/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            participantId,
            rows: newRows.map(rowToPayload),
          }),
        });
        if (!res.ok) throw new Error("Failed to save");
        setRows(newRows);
        setShowForm(false);
        setEditingIndex(null);
        setForm(emptyForm());
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Failed to save");
      } finally {
        setSaving(false);
      }
    },
    [participantId]
  );

  const handleAdd = useCallback(() => {
    setForm(emptyForm());
    setEditingIndex(null);
    setShowForm(true);
  }, []);

  const handleEdit = useCallback((index: number) => {
    const r = rows?.[index];
    if (!r) return;
    setForm({
      subject: r.subject,
      number: r.number,
      days: r.days,
      start: r.start,
      duration: r.duration,
      lab: r.lab ?? null,
      lab_days: r.lab_days ?? null,
      lab_start: r.lab_start ?? null,
      lab_duration: r.lab_duration ?? null,
    });
    setEditingIndex(index);
    setShowForm(true);
  }, [rows]);

  const handleDelete = useCallback(
    async (index: number) => {
      if (rows === null || !confirm("Remove this class from your schedule?")) return;
      const newRows = rows.filter((_, i) => i !== index);
      await saveRows(newRows);
    },
    [rows, saveRows]
  );

  const handleFormSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!form.subject.trim() || !form.number.trim() || !form.days.trim() || !form.start.trim()) {
        setUploadError("Subject, Number, Days, and Start are required.");
        return;
      }
      setUploadError("");
      const newRow: ScheduleRow = {
        subject: form.subject.trim().toUpperCase(),
        number: form.number.trim(),
        days: form.days.trim().toUpperCase(),
        start: form.start.trim(),
        duration: Number(form.duration) || 50,
        lab: form.lab || null,
        lab_days: form.lab_days || null,
        lab_start: form.lab_start || null,
        lab_duration: form.lab_duration ?? null,
      };
      if (editingIndex !== null && rows) {
        const newRows = [...rows];
        newRows[editingIndex] = newRow;
        saveRows(newRows);
      } else {
        saveRows([...(rows ?? []), newRow]);
      }
    },
    [form, editingIndex, rows, saveRows]
  );

  const handleFormCancel = useCallback(() => {
    setShowForm(false);
    setEditingIndex(null);
    setForm(emptyForm());
    setUploadError("");
  }, []);

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !participant) return;
      setUploadError("");
      setUploading(true);
      try {
        const formData = new FormData();
        formData.set("image", file);
        const res = await fetch("/api/actions/extract-schedule", {
          method: "POST",
          body: formData,
        });
        const result = await res.json();
        if (result.error) {
          setUploadError(result.error);
          return;
        }
        if (!result.rows?.length) {
          setUploadError("No classes detected. Try a clearer screenshot.");
          return;
        }
        const saveRes = await fetch("/api/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            participantId: participant.id,
            rows: result.rows.map((r: { subject: string; number: string; days: string; start: string; duration: number; lab?: string; labDays?: string; labStart?: string; labDuration?: number }) => ({
              subject: r.subject,
              number: r.number,
              days: r.days,
              start: r.start,
              duration: r.duration,
              lab: r.lab,
              labDays: r.labDays,
              labStart: r.labStart,
              labDuration: r.labDuration,
            })),
          }),
        });
        if (!saveRes.ok) throw new Error("Failed to save schedule");
        await loadSchedule();
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [participant, loadSchedule]
  );

  const handleSignOut = useCallback(() => {
    clearStoredParticipant();
    router.replace("/login");
  }, [router]);

  if (!participant) return null;

  const hasLab = form.lab === "Y" || form.lab === "YES" || form.lab === "1";

  return (
    <div className="min-h-screen bg-stone-100">
      <header className="border-b border-stone-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <h1 className="text-xl font-bold text-stone-900">ZLP Scheduler</h1>
          <div className="flex items-center gap-4">
            <span className="text-stone-600">{participant.name}</span>
            <button
              onClick={handleSignOut}
              className="text-sm text-rose-700 hover:underline"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-8 flex flex-wrap items-center gap-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="rounded-lg bg-rose-800 px-4 py-2 font-medium text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {uploading ? "Extracting…" : "Upload schedule screenshot"}
          </button>
          <a
            href="/cohort"
            className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-stone-800 hover:bg-stone-50"
          >
            Who has same classes
          </a>
          <a
            href="/meeting-times"
            className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-stone-800 hover:bg-stone-50"
          >
            Best meeting times
          </a>
        </div>
        {uploadError && (
          <p className="mb-4 text-sm text-red-600">{uploadError}</p>
        )}

        <section className="rounded-xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-stone-900">
              Your schedule
            </h2>
            <button
              type="button"
              onClick={handleAdd}
              className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
            >
              + Add class
            </button>
          </div>

          {showForm && (
            <form
              onSubmit={handleFormSubmit}
              className="mb-6 rounded-lg border border-stone-200 bg-stone-50 p-4"
            >
              <h3 className="mb-3 text-sm font-medium text-stone-800">
                {editingIndex !== null ? "Edit class" : "Add class"}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="block text-sm text-stone-600">
                  Subject (e.g. ECEN)
                  <input
                    type="text"
                    value={form.subject}
                    onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                    placeholder="ECEN"
                    maxLength={4}
                    className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-stone-900"
                  />
                </label>
                <label className="block text-sm text-stone-600">
                  Number
                  <input
                    type="text"
                    value={form.number}
                    onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
                    placeholder="214"
                    className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-stone-900"
                  />
                </label>
                <label className="block text-sm text-stone-600" title="R = Thursday">
                  Days (e.g. M/W/F, T/R)
                  <input
                    type="text"
                    value={form.days}
                    onChange={(e) => setForm((f) => ({ ...f, days: e.target.value }))}
                    placeholder="MWF or TR"
                    className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-stone-900"
                  />
                  <span className="mt-0.5 block text-xs text-stone-500">M T W R F — R = Thursday</span>
                </label>
                <label className="block text-sm text-stone-600">
                  Start (24h HH:MM)
                  <input
                    type="text"
                    value={form.start}
                    onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))}
                    placeholder="09:10"
                    className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-stone-900"
                  />
                </label>
                <label className="block text-sm text-stone-600">
                  Duration (min)
                  <input
                    type="number"
                    value={form.duration}
                    onChange={(e) => setForm((f) => ({ ...f, duration: Number(e.target.value) || 0 }))}
                    min={1}
                    className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-stone-900"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm text-stone-600 sm:items-end">
                  <input
                    type="checkbox"
                    checked={hasLab}
                    onChange={(e) => setForm((f) => ({ ...f, lab: e.target.checked ? "Y" : "" }))}
                    className="rounded border-stone-300"
                  />
                  Has lab
                </label>
                {hasLab && (
                  <>
                    <label className="block text-sm text-stone-600">
                      Lab days
                      <input
                        type="text"
                        value={form.lab_days ?? ""}
                        onChange={(e) => setForm((f) => ({ ...f, lab_days: e.target.value || null }))}
                        placeholder="R"
                        className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-stone-900"
                      />
                    </label>
                    <label className="block text-sm text-stone-600">
                      Lab start
                      <input
                        type="text"
                        value={form.lab_start ?? ""}
                        onChange={(e) => setForm((f) => ({ ...f, lab_start: e.target.value || null }))}
                        placeholder="15:00"
                        className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-stone-900"
                      />
                    </label>
                    <label className="block text-sm text-stone-600">
                      Lab duration (min)
                      <input
                        type="number"
                        value={form.lab_duration ?? ""}
                        onChange={(e) => setForm((f) => ({ ...f, lab_duration: e.target.value ? Number(e.target.value) : null }))}
                        min={1}
                        className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-stone-900"
                      />
                    </label>
                  </>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-rose-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={handleFormCancel}
                  className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-100"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {rows === null ? (
            <p className="text-stone-500">Loading…</p>
          ) : rows.length === 0 && !showForm ? (
            <p className="text-stone-500">
              No schedule yet. Upload a screenshot or add a class manually.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200">
                    <th className="pb-2 pr-4 font-medium text-stone-700">Course</th>
                    <th className="pb-2 pr-4 font-medium text-stone-700" title="R = Thursday">Days</th>
                    <th className="pb-2 pr-4 font-medium text-stone-700">Start</th>
                    <th className="pb-2 pr-4 font-medium text-stone-700">Duration</th>
                    <th className="w-0 pb-2 pl-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b border-stone-100">
                      <td className="py-2 pr-4">{r.subject} {r.number}</td>
                      <td className="py-2 pr-4">{r.days ? r.days.split("").join("/") : ""}</td>
                      <td className="py-2 pr-4">{r.start}</td>
                      <td className="py-2 pr-4">{r.duration} min</td>
                      <td className="py-2 pl-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleEdit(i)}
                            title="Edit"
                            className="rounded p-1.5 text-stone-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(i)}
                            title="Delete"
                            className="rounded p-1.5 text-stone-400 transition-colors hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
