"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface UsageData {
  today: {
    conversations: number;
    appointments: number;
    aiRequests: number;
    estimatedCostUsd: number;
  };
  month: {
    conversations: number;
    appointments: number;
    aiRequests: number;
    estimatedCostUsd: number;
  };
  plan: {
    status: string;
    trialEndsAt: string | null;
    subscribed: boolean;
    stripeConfigured: boolean;
    monthlyPriceUsd: number;
  };
  urls: { chatPath: string; customDomain: string | null };
}

export default function UsagePage() {
  const [data, setData] = useState<UsageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [billingMsg, setBillingMsg] = useState<string | null>(null);
  const [welcome, setWelcome] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/dashboard/usage");
    const json = await res.json();
    if (!res.ok) {
      setError(json.error?.message ?? "Failed to load usage.");
      return;
    }
    setData(json.data);
  }, []);

  useEffect(() => {
    void load();
    const q = new URLSearchParams(window.location.search);
    if (q.get("welcome") === "1") {
      const slug = q.get("slug");
      setWelcome(slug ? `Your customer chat is /chat/${slug}` : "Business created.");
    }
    if (q.get("billing") === "success") setBillingMsg("Subscription updated.");
    if (q.get("billing") === "cancel") setBillingMsg("Checkout canceled.");
  }, [load]);

  async function startCheckout() {
    setBillingMsg(null);
    const res = await fetch("/api/dashboard/billing/checkout", { method: "POST" });
    const json = await res.json();
    if (!res.ok) {
      setBillingMsg(json.error?.message ?? "Checkout failed.");
      return;
    }
    if (json.data.url) {
      window.location.href = json.data.url;
      return;
    }
    setBillingMsg(json.data.message ?? "Preview only.");
  }

  if (!data && !error) return <p className="text-sm text-gray-500">Loading usage…</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Usage</h1>
      <p className="mt-1 text-sm text-gray-500">Chats, bookings, and estimated AI cost.</p>

      {welcome && (
        <p className="mt-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">{welcome}</p>
      )}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {billingMsg && <p className="mt-4 text-sm text-stone-700">{billingMsg}</p>}

      {data && (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <StatCard title="Today" stats={data.today} />
            <StatCard title="This month" stats={data.month} />
          </div>

          <section className="mt-8 rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold text-gray-900">Customer URL</h2>
            <p className="mt-2 font-mono text-sm text-slate-800">{data.urls.chatPath}</p>
            {data.urls.customDomain && (
              <p className="mt-1 text-sm text-stone-500">Custom domain: {data.urls.customDomain}</p>
            )}
            <Link
              href={data.urls.chatPath}
              className="mt-3 inline-block text-sm text-teal-800 hover:underline"
              target="_blank"
            >
              Open customer chat
            </Link>
          </section>

          <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold text-gray-900">Plan</h2>
            <p className="mt-2 text-sm text-gray-600">
              Status: {data.plan.status}
              {data.plan.trialEndsAt
                ? ` · trial through ${new Date(data.plan.trialEndsAt).toLocaleDateString()}`
                : ""}
              {data.plan.subscribed ? " · subscribed" : ""}
            </p>
            <p className="mt-1 text-sm text-stone-500">
              ${data.plan.monthlyPriceUsd}/month for the AI receptionist.
            </p>
            <button
              type="button"
              onClick={() => void startCheckout()}
              className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              {data.plan.stripeConfigured ? "Subscribe $49/mo" : "Preview $49/mo plan"}
            </button>
          </section>
        </>
      )}
    </div>
  );
}

function StatCard({
  title,
  stats,
}: {
  title: string;
  stats: UsageData["today"];
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-stone-500">Chats</dt>
          <dd className="font-medium text-slate-900">{stats.conversations}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-stone-500">Bookings</dt>
          <dd className="font-medium text-slate-900">{stats.appointments}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-stone-500">AI replies</dt>
          <dd className="font-medium text-slate-900">{stats.aiRequests}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-stone-500">Est. AI cost</dt>
          <dd className="font-medium text-slate-900">${stats.estimatedCostUsd.toFixed(2)}</dd>
        </div>
      </dl>
    </div>
  );
}
