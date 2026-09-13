"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get("token") ?? "", [searchParams]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Reset failed.");
      router.push("/dashboard/login");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reset failed.");
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
        <h1 className="mt-4 text-2xl font-semibold text-slate-900">Set a new password</h1>
        <form
          onSubmit={handleSubmit}
          className="mt-6 space-y-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"
        >
          {!token && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              This reset link is missing a token. Request a new one.
            </p>
          )}
          <label className="block text-sm font-medium text-stone-700">
            New password
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm font-medium text-stone-700">
            Confirm password
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
          </label>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button
            type="submit"
            disabled={loading || !token}
            className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? "Saving…" : "Update password"}
          </button>
        </form>
      </div>
    </main>
  );
}
