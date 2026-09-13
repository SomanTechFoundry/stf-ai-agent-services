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
    smsFromNumber?: string | null;
    smsFromName?: string | null;
    logoUrl?: string | null;
  };
  agent: {
    agentName: string;
    welcomeMessage: string | null;
    aiProvider: string;
    aiModel: string;
    humanHandoffPhone?: string | null;
    humanHandoffEmail?: string | null;
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
  const [smsFromNumber, setSmsFromNumber] = useState("");
  const [smsFromName, setSmsFromName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [handoffPhone, setHandoffPhone] = useState("");
  const [handoffEmail, setHandoffEmail] = useState("");
  const [testTo, setTestTo] = useState("");
  const [simulateFrom, setSimulateFrom] = useState("+12145550199");
  const [simulateBody, setSimulateBody] = useState("STOP");
  const [simulateClosed, setSimulateClosed] = useState(false);
  const [smsResult, setSmsResult] = useState<string | null>(null);
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
      setSmsFromNumber(json.data.business.smsFromNumber ?? "");
      setSmsFromName(json.data.business.smsFromName ?? "");
      setLogoUrl(json.data.business.logoUrl ?? "");
      setHandoffPhone(json.data.agent?.humanHandoffPhone ?? "");
      setHandoffEmail(json.data.agent?.humanHandoffEmail ?? "");
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
            smsFromNumber: smsFromNumber.trim() || null,
            smsFromName: smsFromName.trim() || null,
            logoUrl: logoUrl.trim() || null,
          },
          agent: {
            agentName,
            welcomeMessage: welcomeMessage || null,
            humanHandoffPhone: handoffPhone.trim() || null,
            humanHandoffEmail: handoffEmail.trim() || null,
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

        <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="font-semibold text-gray-900">Communications</h2>
          <p className="text-sm text-gray-500">
            Per-business SMS branding and who gets “needs you” alerts.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-medium text-gray-500">
              SMS from-number (E.164)
              <input
                value={smsFromNumber}
                onChange={(e) => setSmsFromNumber(e.target.value)}
                placeholder="+12145550100"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-gray-500">
              SMS / email from-name
              <input
                value={smsFromName}
                onChange={(e) => setSmsFromName(e.target.value)}
                placeholder="Sunset Salon"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-gray-500 sm:col-span-2">
              Logo URL (used in customer emails)
              <input
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://…"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-gray-500">
              Alert phone (owner SMS)
              <input
                value={handoffPhone}
                onChange={(e) => setHandoffPhone(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-gray-500">
              Alert email (owner email)
              <input
                type="email"
                value={handoffEmail}
                onChange={(e) => setHandoffEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-xs text-stone-500">
            <li>Upgrade Twilio off trial so custom SMS bodies are delivered.</li>
            <li>Point the number’s messaging webhook to <code>/api/webhooks/twilio/sms</code>.</li>
            <li>Register 10DLC / A2P for US SMS before going live.</li>
            <li>Verify the Resend from-domain for branded email.</li>
          </ul>
        </section>

        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>

      <section className="mt-8 space-y-4 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="font-semibold text-gray-900">Test SMS locally</h2>
        <p className="text-sm text-gray-500">
          Without Twilio, these return a preview. With Twilio, Test send actually texts the number.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-gray-500">
            Send test to
            <input
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="+1…"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={async () => {
                setSmsResult(null);
                const res = await fetch("/api/dashboard/sms/test", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ to: testTo }),
                });
                const json = await res.json();
                setSmsResult(json.data?.preview ?? json.error?.message ?? "Done");
              }}
              className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700"
            >
              Send test SMS
            </button>
          </div>
          <label className="text-xs font-medium text-gray-500">
            Simulate inbound from
            <input
              value={simulateFrom}
              onChange={(e) => setSimulateFrom(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-medium text-gray-500">
            Message
            <input
              value={simulateBody}
              onChange={(e) => setSimulateBody(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={simulateClosed}
            onChange={(e) => setSimulateClosed(e.target.checked)}
          />
          Pretend we&apos;re closed (after-hours reply)
        </label>
        <button
          type="button"
          onClick={async () => {
            setSmsResult(null);
            const res = await fetch("/api/dashboard/sms/simulate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                from: simulateFrom,
                body: simulateBody,
                afterHours: simulateClosed,
              }),
            });
            const json = await res.json();
            setSmsResult(json.data?.reply ?? json.error?.message ?? "Done");
          }}
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"
        >
          Simulate inbound SMS
        </button>
        {smsResult && (
          <pre className="whitespace-pre-wrap rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-700">
            {smsResult}
          </pre>
        )}
      </section>

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
