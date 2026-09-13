"use client";

import { useCallback, useEffect, useState } from "react";

const DAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

type Day = (typeof DAYS)[number];

interface HoursRow {
  dayOfWeek: Day;
  isOpen: boolean;
  openTime: string;
  closeTime: string;
}

function defaultWeek(): HoursRow[] {
  return DAYS.map((day) => ({
    dayOfWeek: day,
    isOpen: day !== "SUNDAY",
    openTime: "09:00",
    closeTime: "18:00",
  }));
}

function label(day: string) {
  return day.charAt(0) + day.slice(1).toLowerCase();
}

export default function HoursPage() {
  const [hours, setHours] = useState<HoursRow[]>(defaultWeek());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/hours");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Failed to load hours.");
      const savedHours = (json.data as HoursRow[]) ?? [];
      setHours(
        defaultWeek().map((fallback) => {
          const match = savedHours.find((h) => h.dayOfWeek === fallback.dayOfWeek);
          return match
            ? {
                dayOfWeek: match.dayOfWeek,
                isOpen: match.isOpen,
                openTime: match.openTime,
                closeTime: match.closeTime,
              }
            : fallback;
        })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function update(day: Day, patch: Partial<HoursRow>) {
    setHours((prev) => prev.map((h) => (h.dayOfWeek === day ? { ...h, ...patch } : h)));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/hours", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hours: hours.map((h) => ({
            ...h,
            openTime: h.openTime.slice(0, 5),
            closeTime: h.closeTime.slice(0, 5),
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Save failed.");
      setSaved(true);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Hours</h1>
        <p className="mt-1 text-sm text-gray-500">
          Closed days cannot be booked. Changes apply to the AI immediately.
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      )}
      {saved && (
        <p className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          Hours saved.
        </p>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <form onSubmit={handleSave} className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            {hours.map((h) => (
              <div
                key={h.dayOfWeek}
                className="grid items-center gap-3 border-b border-gray-100 px-5 py-3 last:border-b-0 sm:grid-cols-[8rem_auto_1fr_1fr]"
              >
                <p className="text-sm font-medium text-gray-900">{label(h.dayOfWeek)}</p>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={h.isOpen}
                    onChange={(e) => update(h.dayOfWeek, { isOpen: e.target.checked })}
                  />
                  Open
                </label>
                <label className="text-xs font-medium text-gray-500">
                  Opens
                  <input
                    type="time"
                    disabled={!h.isOpen}
                    value={h.openTime}
                    onChange={(e) => update(h.dayOfWeek, { openTime: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50"
                  />
                </label>
                <label className="text-xs font-medium text-gray-500">
                  Closes
                  <input
                    type="time"
                    disabled={!h.isOpen}
                    value={h.closeTime}
                    onChange={(e) => update(h.dayOfWeek, { closeTime: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50"
                  />
                </label>
              </div>
            ))}
          </div>
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save hours"}
          </button>
        </form>
      )}
    </div>
  );
}
