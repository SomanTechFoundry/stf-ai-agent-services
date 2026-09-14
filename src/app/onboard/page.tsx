"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { slugify } from "@/lib/utils/slug";

interface ServiceDraft {
  name: string;
  durationMinutes: number;
  price: number;
}

const DEFAULT_SERVICES: ServiceDraft[] = [
  { name: "Haircut", durationMinutes: 45, price: 45 },
  { name: "Color", durationMinutes: 90, price: 95 },
  { name: "Blowout", durationMinutes: 30, price: 35 },
];

export default function OnboardPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [businessName, setBusinessName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [timezone, setTimezone] = useState("America/Chicago");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [password, setPassword] = useState("");
  const [weekdayOpen, setWeekdayOpen] = useState("09:00");
  const [weekdayClose, setWeekdayClose] = useState("18:00");
  const [saturdayOpen, setSaturdayOpen] = useState(true);
  const [services, setServices] = useState<ServiceDraft[]>(DEFAULT_SERVICES);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const previewSlug = useMemo(
    () => (slugTouched ? slugify(slug) : slugify(businessName)),
    [slug, slugTouched, businessName]
  );

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName,
          slug: previewSlug,
          timezone,
          city,
          state,
          ownerName,
          ownerEmail,
          password,
          weekdayOpen,
          weekdayClose,
          saturdayOpen,
          services: services.filter((s) => s.name.trim()),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message ?? "Could not create the business.");
        return;
      }
      router.push(`/dashboard/usage?welcome=1&slug=${json.data.business.slug}`);
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f2ee] px-4 py-10">
      <div className="mx-auto max-w-xl">
        <Link href="/" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-800">
          STF AI Agent Services
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">Set up your receptionist</h1>
        <p className="mt-1 text-sm text-stone-500">Step {step} of 3 · About 5 minutes.</p>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        {step === 1 && (
          <section className="mt-6 space-y-4 rounded-2xl border border-stone-200 bg-white p-6">
            <label className="block text-xs font-medium text-gray-500">
              Business name
              <input
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="block text-xs font-medium text-gray-500">
              Chat URL
              <input
                value={slugTouched ? slug : previewSlug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value);
                }}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm"
              />
              <span className="mt-1 block text-[11px] text-stone-400">
                localhost:3000/chat/{previewSlug || "your-salon"}
              </span>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-gray-500">
                City
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs font-medium text-gray-500">
                State
                <input
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <label className="block text-xs font-medium text-gray-500">
              Timezone
              <input
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          </section>
        )}

        {step === 2 && (
          <section className="mt-6 space-y-4 rounded-2xl border border-stone-200 bg-white p-6">
            <label className="block text-xs font-medium text-gray-500">
              Your name
              <input
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs font-medium text-gray-500">
              Login email
              <input
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs font-medium text-gray-500">
              Password (8+ characters)
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-gray-500">
                Weekday open
                <input
                  type="time"
                  value={weekdayOpen}
                  onChange={(e) => setWeekdayOpen(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs font-medium text-gray-500">
                Weekday close
                <input
                  type="time"
                  value={weekdayClose}
                  onChange={(e) => setWeekdayClose(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={saturdayOpen}
                onChange={(e) => setSaturdayOpen(e.target.checked)}
              />
              Open Saturday
            </label>
          </section>
        )}

        {step === 3 && (
          <section className="mt-6 space-y-4 rounded-2xl border border-stone-200 bg-white p-6">
            <p className="text-sm text-gray-500">At least one service. You can edit these later.</p>
            {services.map((s, i) => (
              <div key={i} className="grid grid-cols-6 gap-2">
                <input
                  value={s.name}
                  onChange={(e) => {
                    const next = [...services];
                    next[i] = { ...s, name: e.target.value };
                    setServices(next);
                  }}
                  className="col-span-3 rounded-lg border border-gray-300 px-2 py-2 text-sm"
                />
                <input
                  type="number"
                  value={s.durationMinutes}
                  onChange={(e) => {
                    const next = [...services];
                    next[i] = { ...s, durationMinutes: Number(e.target.value) };
                    setServices(next);
                  }}
                  className="col-span-1 rounded-lg border border-gray-300 px-2 py-2 text-sm"
                />
                <input
                  type="number"
                  value={s.price}
                  onChange={(e) => {
                    const next = [...services];
                    next[i] = { ...s, price: Number(e.target.value) };
                    setServices(next);
                  }}
                  className="col-span-2 rounded-lg border border-gray-300 px-2 py-2 text-sm"
                />
              </div>
            ))}
            <p className="text-[11px] text-stone-400">Name · minutes · price (USD)</p>
          </section>
        )}

        <div className="mt-6 flex justify-between">
          <button
            type="button"
            disabled={step === 1}
            onClick={() => setStep((s) => s - 1)}
            className="rounded-lg px-4 py-2 text-sm text-stone-600 disabled:opacity-40"
          >
            Back
          </button>
          {step < 3 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={() => void submit()}
              className="rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Creating…" : "Create business"}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
