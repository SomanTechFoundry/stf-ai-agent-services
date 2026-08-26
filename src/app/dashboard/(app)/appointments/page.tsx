"use client";

import { useCallback, useEffect, useState } from "react";

interface Appointment {
  id: string;
  status: string;
  localDate: string;
  localTime: string;
  price: number;
  currency: string;
  notes: string | null;
  customer: { name: string; phone: string | null } | null;
  service: { name: string; durationMinutes: number } | null;
  staff: { name: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  CONFIRMED: "bg-green-100 text-green-800",
  COMPLETED: "bg-gray-100 text-gray-700",
  CANCELLED: "bg-red-100 text-red-700",
  NO_SHOW: "bg-orange-100 text-orange-800",
  RESCHEDULED: "bg-blue-100 text-blue-800",
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function AppointmentsPage() {
  const [dateFrom, setDateFrom] = useState(todayISO());
  const [dateTo, setDateTo] = useState(todayISO());
  const [statusFilter, setStatusFilter] = useState("");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [timezone, setTimezone] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ dateFrom, dateTo });
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/dashboard/appointments?${params}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "Failed to load appointments.");
        return;
      }
      setAppointments(json.data.appointments);
      setTimezone(json.data.timezone);
    } catch {
      setError("Network error loading appointments.");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function runAction(
    id: string,
    action: "confirm" | "cancel" | "complete" | "reschedule",
    extra?: { date?: string; time?: string; reason?: string }
  ) {
    setActionId(id);
    try {
      const body: Record<string, string> = { action };
      if (action === "cancel" && extra?.reason) body.reason = extra.reason;
      if (action === "reschedule") {
        if (!extra?.date || !extra?.time) return;
        body.date = extra.date;
        body.time = extra.time;
      }

      const res = await fetch(`/api/dashboard/appointments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json();
        alert(json?.error?.message ?? "Action failed.");
        return;
      }
      await load();
    } finally {
      setActionId(null);
    }
  }

  function promptReschedule(id: string) {
    const date = window.prompt("New date (YYYY-MM-DD):");
    if (!date) return;
    const time = window.prompt("New time (HH:MM, 24-hour):");
    if (!time) return;
    void runAction(id, "reschedule", { date, time });
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Appointments</h1>
        {timezone && (
          <p className="text-sm text-gray-500 mt-1">Timezone: {timezone}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-3 mb-6 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          >
            <option value="">All</option>
            <option value="PENDING">Pending</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
        <button
          type="button"
          onClick={load}
          className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          Refresh
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3 mb-4">{error}</p>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : appointments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
          <p className="text-gray-600 font-medium">No appointments in this range</p>
          <p className="text-sm text-gray-400 mt-1">
            Book one via the{" "}
            <a href="/chat/sunset-salon" className="text-violet-600 hover:underline">
              chat demo
            </a>{" "}
            to see it here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {appointments.map((a) => (
            <div
              key={a.id}
              className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-gray-900">
                      {a.localDate} at {a.localTime}
                    </span>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        STATUS_COLORS[a.status] ?? "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {a.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700">
                    {a.service?.name ?? "Service"} · {a.staff?.name ?? "Any staff"}
                  </p>
                  <p className="text-sm text-gray-500">
                    {a.customer?.name ?? "Walk-in"}
                    {a.customer?.phone ? ` · ${a.customer.phone}` : ""}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    ${a.price.toFixed(2)} {a.currency} · {a.service?.durationMinutes ?? "?"} min
                  </p>
                </div>
                <div className="flex gap-2">
                  {a.status === "PENDING" && (
                    <button
                      type="button"
                      disabled={actionId === a.id}
                      onClick={() => runAction(a.id, "confirm")}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      Confirm
                    </button>
                  )}
                  {(a.status === "PENDING" || a.status === "CONFIRMED" || a.status === "RESCHEDULED") && (
                    <>
                      <button
                        type="button"
                        disabled={actionId === a.id}
                        onClick={() => promptReschedule(a.id)}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 disabled:opacity-50"
                      >
                        Reschedule
                      </button>
                      <button
                        type="button"
                        disabled={actionId === a.id}
                        onClick={() => runAction(a.id, "complete")}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                      >
                        Complete
                      </button>
                      <button
                        type="button"
                        disabled={actionId === a.id}
                        onClick={() => runAction(a.id, "cancel")}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
