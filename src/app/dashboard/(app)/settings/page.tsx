"use client";

import { useCallback, useEffect, useState } from "react";

interface SettingsData {
  business: {
    name: string;
    slug: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    timezone: string;
    bookingLeadTimeMinutes: number;
    bookingMaxDaysAhead: number;
    cancellationPolicyHours: number;
  };
  agent: {
    agentName: string;
    welcomeMessage: string | null;
    personality: string | null;
    aiProvider: string;
    aiModel: string;
  } | null;
  services: Array<{ id: string; name: string; durationMinutes: number; price: number }>;
  staff: Array<{ id: string; name: string; title: string | null }>;
}

export default function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [cancellationHours, setCancellationHours] = useState(24);
  const [agentName, setAgentName] = useState("");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/settings");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Failed to load settings.");
      setData(json.data);
      setPhone(json.data.business.phone ?? "");
      setEmail(json.data.business.email ?? "");
      setCancellationHours(json.data.business.cancellationPolicyHours);
      setAgentName(json.data.agent?.agentName ?? "");
      setWelcomeMessage(json.data.agent?.welcomeMessage ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business: {
            phone: phone || null,
            email: email || null,
            cancellationPolicyHours: cancellationHours,
          },
          agent: {
            agentName,
            welcomeMessage: welcomeMessage || null,
          },
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

  if (loading) return <p className="text-sm text-gray-500">Loading settings…</p>;
  if (!data) return <p className="text-sm text-red-600">{error ?? "No data"}</p>;

  const { business, agent, services, staff } = data;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage business profile and AI receptionist</p>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3 mb-4">{error}</p>
      )}
      {saved && (
        <p className="text-sm text-green-700 bg-green-50 rounded-lg px-4 py-3 mb-4">
          Settings saved.
        </p>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Business profile</h2>
          <p className="text-sm text-gray-500">
            {business.name} · {business.slug} · {business.timezone}
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Cancellation notice (hours)
              </label>
              <input
                type="number"
                min={0}
                value={cancellationHours}
                onChange={(e) => setCancellationHours(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">AI receptionist</h2>
          {agent && (
            <p className="text-xs text-gray-400">
              Model: {agent.aiProvider} / {agent.aiModel}
            </p>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Agent name</label>
            <input
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Welcome message
            </label>
            <textarea
              value={welcomeMessage}
              onChange={(e) => setWelcomeMessage(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </section>

        <button
          type="submit"
          disabled={saving}
          className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-semibold text-sm px-5 py-2.5 rounded-xl"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>

      <div className="space-y-6 mt-8">
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-3">Services ({services.length})</h2>
          <ul className="divide-y divide-gray-100">
            {services.map((s) => (
              <li key={s.id} className="py-2 flex justify-between text-sm">
                <span className="text-gray-900">{s.name}</span>
                <span className="text-gray-500">
                  {s.durationMinutes} min · ${s.price.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-3">Staff ({staff.length})</h2>
          <ul className="divide-y divide-gray-100">
            {staff.map((s) => (
              <li key={s.id} className="py-2 flex justify-between text-sm">
                <span className="text-gray-900">{s.name}</span>
                <span className="text-gray-500">{s.title ?? "—"}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
