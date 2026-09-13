"use client";

import { useCallback, useEffect, useState } from "react";

interface TeamUser {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export default function TeamPage() {
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteResult, setInviteResult] = useState<{
    email: string;
    temporaryPassword: string;
    emailed: boolean;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/team");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Failed to load team.");
      setUsers(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setInviteResult(null);
    try {
      const res = await fetch("/api/dashboard/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), role: "STAFF" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Invite failed.");
      setInviteResult({
        email: json.data.user.email,
        temporaryPassword: json.data.temporaryPassword,
        emailed: json.data.emailed,
      });
      setName("");
      setEmail("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invite failed.");
    } finally {
      setSaving(false);
    }
  }

  async function setActive(id: string, isActive: boolean) {
    const res = await fetch(`/api/dashboard/team/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json?.error?.message ?? "Could not update team member.");
      return;
    }
    await load();
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Team</h1>
        <p className="mt-1 text-sm text-gray-500">
          Front-desk logins can see appointments. They cannot change catalog, hours, FAQs, or the business.
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      )}

      {inviteResult && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-medium">Give these credentials to your teammate. The password is shown once.</p>
          <p className="mt-2">
            Email: <span className="font-mono">{inviteResult.email}</span>
          </p>
          <p>
            Temporary password:{" "}
            <span className="font-mono">{inviteResult.temporaryPassword}</span>
          </p>
          <p className="mt-1 text-amber-800">
            {inviteResult.emailed
              ? "An email was also sent."
              : "Email is not configured locally — copy the password yourself."}
          </p>
        </div>
      )}

      <form
        onSubmit={handleInvite}
        className="mb-8 space-y-4 rounded-xl border border-gray-200 bg-white p-5"
      >
        <h2 className="font-semibold text-gray-900">Invite front desk</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-medium text-gray-500">
            Name
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
            />
          </label>
          <label className="text-xs font-medium text-gray-500">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {saving ? "Creating…" : "Create login"}
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
          {users.map((user) => (
            <li key={user.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div>
                <p className="font-medium text-gray-900">
                  {user.name}
                  <span className="ml-2 text-xs font-medium uppercase text-stone-400">
                    {user.role === "STAFF" ? "Front desk" : "Owner"}
                  </span>
                  {!user.isActive && (
                    <span className="ml-2 text-xs font-medium text-amber-700">Inactive</span>
                  )}
                </p>
                <p className="text-sm text-gray-500">{user.email}</p>
              </div>
              {user.role === "STAFF" && (
                <button
                  type="button"
                  onClick={() => void setActive(user.id, !user.isActive)}
                  className={
                    user.isActive
                      ? "rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                      : "rounded-lg bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100"
                  }
                >
                  {user.isActive ? "Deactivate" : "Reactivate"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
