"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResetUrl(null);
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Request failed.");
      setDone(true);
      if (json.data.resetUrl) setResetUrl(json.data.resetUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f2ee] p-6">
      <div className="w-full max-w-md">
        <Link href="/dashboard/login" className="text-sm text-teal-800 hover:underline">
          Back to sign in
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-slate-900">Forgot password</h1>
        <p className="mt-1 text-sm text-stone-500">
          Enter the email for your dashboard login.
        </p>

        <form
          onSubmit={handleSubmit}
          className="mt-6 space-y-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"
        >
          <label className="block text-sm font-medium text-stone-700">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
          </label>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {done && (
            <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
              If that email is on file, you can reset the password.
            </p>
          )}
          {resetUrl && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
              Local testing link:{" "}
              <Link href={resetUrl} className="font-medium underline">
                Reset password
              </Link>
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? "Sending…" : "Continue"}
          </button>
        </form>
      </div>
    </main>
  );
}
