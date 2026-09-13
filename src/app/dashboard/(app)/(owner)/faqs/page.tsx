"use client";

import { useCallback, useEffect, useState } from "react";

interface FaqRow {
  id: string;
  category: string;
  question: string;
  answer: string;
  isActive: boolean;
  priority: number;
}

const emptyForm = {
  category: "faq",
  question: "",
  answer: "",
  priority: 100,
  isActive: true,
};

export default function FaqsPage() {
  const [items, setItems] = useState<FaqRow[]>([]);
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
      const res = await fetch("/api/dashboard/faqs");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Failed to load FAQs.");
      setItems(json.data);
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

  function startEdit(item: FaqRow) {
    setEditingId(item.id);
    setForm({
      category: item.category,
      question: item.question,
      answer: item.answer,
      priority: item.priority,
      isActive: item.isActive,
    });
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        category: form.category,
        question: form.question.trim(),
        answer: form.answer.trim(),
        priority: Number(form.priority),
        isActive: form.isActive,
      };
      const res = await fetch(
        editingId ? `/api/dashboard/faqs/${editingId}` : "/api/dashboard/faqs",
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
    const res = await fetch(`/api/dashboard/faqs/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) {
      setError(json?.error?.message ?? "Could not deactivate FAQ.");
      return;
    }
    await load();
  }

  async function reactivate(id: string) {
    const res = await fetch(`/api/dashboard/faqs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: true }),
    });
    if (!res.ok) {
      const json = await res.json();
      setError(json?.error?.message ?? "Could not reactivate FAQ.");
      return;
    }
    await load();
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">FAQs</h1>
          <p className="mt-1 text-sm text-gray-500">
            Answers the AI uses for parking, payments, policies, and similar questions.
          </p>
        </div>
        <button
          type="button"
          onClick={startCreate}
          className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
        >
          Add FAQ
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
          <h2 className="font-semibold text-gray-900">{editingId ? "Edit FAQ" : "New FAQ"}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-medium text-gray-500">
              Category
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
              >
                <option value="faq">FAQ</option>
                <option value="policy">Policy</option>
                <option value="service_info">Service info</option>
              </select>
            </label>
            <label className="text-xs font-medium text-gray-500">
              Priority (lower shows first)
              <input
                type="number"
                min={1}
                max={1000}
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
              />
            </label>
          </div>
          <label className="block text-xs font-medium text-gray-500">
            Question
            <input
              required
              value={form.question}
              onChange={(e) => setForm({ ...form, question: e.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
            />
          </label>
          <label className="block text-xs font-medium text-gray-500">
            Answer
            <textarea
              required
              rows={4}
              value={form.answer}
              onChange={(e) => setForm({ ...form, answer: e.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            Active (AI can use this)
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
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-500">
          No FAQs yet. Add answers so the AI does not invent them.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-stone-400">{item.category}</p>
                  <p className="mt-1 font-medium text-gray-900">{item.question}</p>
                  <p className="mt-1 text-sm text-gray-600">{item.answer}</p>
                  {!item.isActive && (
                    <p className="mt-2 text-xs font-medium text-amber-700">Inactive</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(item)}
                    className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
                  >
                    Edit
                  </button>
                  {item.isActive ? (
                    <button
                      type="button"
                      onClick={() => void deactivate(item.id)}
                      className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                    >
                      Deactivate
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void reactivate(item.id)}
                      className="rounded-lg bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100"
                    >
                      Reactivate
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
