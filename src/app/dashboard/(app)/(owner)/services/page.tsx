"use client";

import { useCallback, useEffect, useState } from "react";

interface ServiceRow {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  price: number;
  category: string | null;
  bufferMinutes: number;
  isActive: boolean;
}

const emptyForm = {
  name: "",
  description: "",
  durationMinutes: 30,
  price: 0,
  category: "",
  bufferMinutes: 0,
  isActive: true,
};

export default function ServicesPage() {
  const [services, setServices] = useState<ServiceRow[]>([]);
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
      const res = await fetch("/api/dashboard/services");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Failed to load services.");
      setServices(json.data);
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

  function startEdit(s: ServiceRow) {
    setEditingId(s.id);
    setForm({
      name: s.name,
      description: s.description ?? "",
      durationMinutes: s.durationMinutes,
      price: s.price,
      category: s.category ?? "",
      bufferMinutes: s.bufferMinutes,
      isActive: s.isActive,
    });
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        durationMinutes: Number(form.durationMinutes),
        price: Number(form.price),
        category: form.category.trim() || null,
        bufferMinutes: Number(form.bufferMinutes),
        isActive: form.isActive,
      };
      const res = await fetch(
        editingId ? `/api/dashboard/services/${editingId}` : "/api/dashboard/services",
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
    if (!window.confirm("Hide this service from booking? Existing appointments stay on the calendar.")) {
      return;
    }
    const res = await fetch(`/api/dashboard/services/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) {
      setError(json?.error?.message ?? "Could not deactivate service.");
      return;
    }
    await load();
  }

  async function reactivate(id: string) {
    const res = await fetch(`/api/dashboard/services/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: true }),
    });
    if (!res.ok) {
      const json = await res.json();
      setError(json?.error?.message ?? "Could not reactivate service.");
      return;
    }
    await load();
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Services</h1>
          <p className="mt-1 text-sm text-gray-500">
            Prices and durations the AI quotes to customers.
          </p>
        </div>
        <button
          type="button"
          onClick={startCreate}
          className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
        >
          Add service
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
            {editingId ? "Edit service" : "New service"}
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
              Category
              <input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="Hair, Nails…"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
              />
            </label>
            <label className="text-xs font-medium text-gray-500">
              Duration (minutes)
              <input
                type="number"
                min={5}
                max={480}
                required
                value={form.durationMinutes}
                onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
              />
            </label>
            <label className="text-xs font-medium text-gray-500">
              Price (USD)
              <input
                type="number"
                min={0}
                step="0.01"
                required
                value={form.price}
                onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
              />
            </label>
            <label className="text-xs font-medium text-gray-500">
              Buffer after (minutes)
              <input
                type="number"
                min={0}
                max={120}
                value={form.bufferMinutes}
                onChange={(e) => setForm({ ...form, bufferMinutes: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
              />
            </label>
            <label className="flex items-center gap-2 pt-6 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              Active (bookable)
            </label>
          </div>
          <label className="block text-xs font-medium text-gray-500">
            Description
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
            />
          </label>
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
      ) : services.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-500">
          No services yet. Add the first one so customers can book.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
          {services.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div>
                <p className="font-medium text-gray-900">
                  {s.name}
                  {!s.isActive && (
                    <span className="ml-2 text-xs font-medium text-amber-700">Inactive</span>
                  )}
                </p>
                <p className="text-sm text-gray-500">
                  {s.durationMinutes} min · ${s.price.toFixed(2)}
                  {s.category ? ` · ${s.category}` : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => startEdit(s)}
                  className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
                >
                  Edit
                </button>
                {s.isActive ? (
                  <button
                    type="button"
                    onClick={() => void deactivate(s.id)}
                    className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                  >
                    Deactivate
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void reactivate(s.id)}
                    className="rounded-lg bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100"
                  >
                    Reactivate
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
