"use client";

import { useCallback, useEffect, useState } from "react";

interface CatalogService {
  id: string;
  name: string;
  isActive: boolean;
}

interface StaffRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  bio: string | null;
  isActive: boolean;
  acceptsBookings: boolean;
  services: { serviceId: string }[];
}

const emptyForm = {
  name: "",
  title: "",
  email: "",
  phone: "",
  bio: "",
  isActive: true,
  acceptsBookings: true,
  serviceIds: [] as string[],
};

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [catalog, setCatalog] = useState<CatalogService[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/staff");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Failed to load staff.");
      setStaff(json.data.staff);
      setCatalog(json.data.services);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function startEdit(row: StaffRow) {
    setEditingId(row.id);
    setForm({
      name: row.name,
      title: row.title ?? "",
      email: row.email ?? "",
      phone: row.phone ?? "",
      bio: row.bio ?? "",
      isActive: row.isActive,
      acceptsBookings: row.acceptsBookings,
      serviceIds: row.services.map((s) => s.serviceId),
    });
    setShowForm(true);
  }

  function toggleService(id: string) {
    setForm((prev) => ({
      ...prev,
      serviceIds: prev.serviceIds.includes(id)
        ? prev.serviceIds.filter((x) => x !== id)
        : [...prev.serviceIds, id],
    }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        title: form.title.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        bio: form.bio.trim() || null,
        isActive: form.isActive,
        acceptsBookings: form.acceptsBookings,
        serviceIds: form.serviceIds,
      };
      const res = await fetch(
        editingId ? `/api/dashboard/staff/${editingId}` : "/api/dashboard/staff",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Save failed.");
      setShowForm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(id: string) {
    if (!window.confirm("Stop this person from taking new bookings?")) return;
    const res = await fetch(`/api/dashboard/staff/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) {
      setError(json?.error?.message ?? "Could not deactivate.");
      return;
    }
    await load();
  }

  function serviceNames(row: StaffRow) {
    const names = row.services
      .map((link) => catalog.find((s) => s.id === link.serviceId)?.name)
      .filter(Boolean);
    return names.length ? names.join(", ") : "No services assigned";
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Staff</h1>
          <p className="mt-1 text-sm text-gray-500">
            Who can perform each service. The AI only books assigned stylists.
          </p>
        </div>
        <button
          type="button"
          onClick={startCreate}
          className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
        >
          Add staff
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      )}

      {showForm && (
        <form
          onSubmit={handleSave}
          className="mb-6 space-y-4 rounded-xl border border-gray-200 bg-white p-5"
        >
          <h2 className="font-semibold text-gray-900">
            {editingId ? "Edit staff" : "New staff"}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-medium text-gray-500">
              Name
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
              />
            </label>
            <label className="text-xs font-medium text-gray-500">
              Title
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Senior stylist"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
              />
            </label>
            <label className="text-xs font-medium text-gray-500">
              Email
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
              />
            </label>
            <label className="text-xs font-medium text-gray-500">
              Phone
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
              />
            </label>
          </div>
          <label className="block text-xs font-medium text-gray-500">
            Bio
            <textarea
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              rows={2}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
            />
          </label>
          <div className="flex flex-wrap gap-4 text-sm text-gray-700">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              Active
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.acceptsBookings}
                onChange={(e) => setForm({ ...form, acceptsBookings: e.target.checked })}
              />
              Accepts bookings
            </label>
          </div>
          <fieldset>
            <legend className="mb-2 text-xs font-medium text-gray-500">
              Services this person can perform
            </legend>
            {catalog.length === 0 ? (
              <p className="text-sm text-stone-500">Add services first, then assign them here.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {catalog.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={form.serviceIds.includes(s.id)}
                      onChange={() => toggleService(s.id)}
                    />
                    {s.name}
                    {!s.isActive && <span className="text-xs text-amber-700">(inactive)</span>}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-xl bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : staff.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-500">
          No staff yet. Add stylists so the AI can assign appointments.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
          {staff.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div>
                <p className="font-medium text-gray-900">
                  {row.name}
                  {row.title ? <span className="font-normal text-gray-500"> · {row.title}</span> : null}
                  {!row.isActive && (
                    <span className="ml-2 text-xs font-medium text-amber-700">Inactive</span>
                  )}
                </p>
                <p className="text-sm text-gray-500">{serviceNames(row)}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => startEdit(row)}
                  className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
                >
                  Edit
                </button>
                {row.isActive && (
                  <button
                    type="button"
                    onClick={() => void deactivate(row.id)}
                    className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                  >
                    Deactivate
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
