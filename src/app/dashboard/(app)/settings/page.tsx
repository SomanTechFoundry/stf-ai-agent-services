"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface SettingsData {
  business: {
    name: string;
    slug: string;
    email: string | null;
    phone: string | null;
    timezone: string;
    cancellationPolicyHours: number;
  };
  agent: {
    agentName: string;
    welcomeMessage: string | null;
    aiProvider: string;
    aiModel: string;
  } | null;
  widget?: {
    token: string;
    snippet: string;
    demoUrl: string;
    allowedOrigins: string[];
  };
}

export default function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [cancellationHours, setCancellationHours] = useState(24);
  const [agentName, setAgentName] = useState("");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [allowedOriginsText, setAllowedOriginsText] = useState("");
  const [widget, setWidget] = useState<SettingsData["widget"]>();
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
      setWidget(json.data.widget);
      setAllowedOriginsText((json.data.widget?.allowedOrigins ?? []).join("\n"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
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
            allowedChatOrigins: allowedOriginsText
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean),
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

  const { business, agent } = data;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">Business profile and AI receptionist</p>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      )}
      {saved && (
        <p className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          Settings saved.
        </p>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="font-semibold text-gray-900">Business profile</h2>
          <p className="text-sm text-gray-500">
            {business.name} · {business.slug} · {business.timezone}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Phone</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
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

        <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="font-semibold text-gray-900">AI receptionist</h2>
          {agent && (
            <p className="text-xs text-gray-400">
              Model: {agent.aiProvider} / {agent.aiModel}
            </p>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Agent name</label>
            <input
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Welcome message</label>
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
          className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>

      {widget && (
        <section className="mt-8 space-y-4 rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="font-semibold text-gray-900">Website chat widget</h2>
          <p className="text-sm text-gray-500">
            Paste this snippet before <code>&lt;/body&gt;</code> on the salon website.
            Local demo:{" "}
            <a className="text-teal-800 hover:underline" href={widget.demoUrl} target="_blank" rel="noreferrer">
              open widget demo
            </a>
          </p>
          <textarea
            readOnly
            value={widget.snippet}
            rows={3}
            className="w-full rounded-lg border border-gray-300 bg-stone-50 px-3 py-2 font-mono text-xs"
          />
          <p className="text-xs text-stone-500">
            Token: <span className="font-mono">{widget.token}</span>
          </p>
          <label className="block text-xs font-medium text-gray-500">
            Allowed website origins (optional, one per line, include https://)
            <textarea
              value={allowedOriginsText}
              onChange={(e) => setAllowedOriginsText(e.target.value)}
              rows={3}
              placeholder="Leave empty to allow any site that has the token"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs"
            />
          </label>
          <button
            type="button"
            onClick={async () => {
              const res = await fetch("/api/dashboard/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ regenerateWidgetToken: true }),
              });
              if (res.ok) await load();
            }}
            className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
          >
            Regenerate widget token
          </button>
        </section>
      )}

      <section className="mt-8 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-2 font-semibold text-gray-900">Day-to-day setup</h2>
        <p className="mb-3 text-sm text-gray-500">
          Use the sidebar to manage services, staff, hours, FAQs, and team logins.
        </p>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link className="text-teal-800 hover:underline" href="/dashboard/services">
            Services
          </Link>
          <Link className="text-teal-800 hover:underline" href="/dashboard/staff">
            Staff
          </Link>
          <Link className="text-teal-800 hover:underline" href="/dashboard/hours">
            Hours
          </Link>
          <Link className="text-teal-800 hover:underline" href="/dashboard/faqs">
            FAQs
          </Link>
          <Link className="text-teal-800 hover:underline" href="/dashboard/team">
            Team
          </Link>
        </div>
      </section>

      <p className="mt-6 text-sm text-stone-500">
        The business account cannot be deleted from this dashboard. Contact STF if you need to close it.
      </p>
    </div>
  );
}
