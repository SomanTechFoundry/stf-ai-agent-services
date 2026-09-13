"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { LogoutButton } from "./LogoutButton";
import { isOwnerRole } from "@/lib/auth/roles";

const NAV = [
  { href: "/dashboard/appointments", label: "Appointments", ownerOnly: false },
  { href: "/dashboard/conversations", label: "Conversations", ownerOnly: false },
  { href: "/dashboard/services", label: "Services", ownerOnly: true },
  { href: "/dashboard/staff", label: "Staff", ownerOnly: true },
  { href: "/dashboard/hours", label: "Hours", ownerOnly: true },
  { href: "/dashboard/faqs", label: "FAQs", ownerOnly: true },
  { href: "/dashboard/team", label: "Team", ownerOnly: true },
  { href: "/dashboard/settings", label: "Settings", ownerOnly: true },
  { href: "/dashboard/account", label: "Account", ownerOnly: false },
];

interface Props {
  businessName: string;
  businessSlug?: string | null;
  userName: string;
  userRole: string;
  children: React.ReactNode;
}

export function DashboardShell({
  businessName,
  businessSlug,
  userName,
  userRole,
  children,
}: Props) {
  const pathname = usePathname();
  const owner = isOwnerRole(userRole);
  const items = NAV.filter((item) => !item.ownerOnly || owner);
  const [escalatedCount, setEscalatedCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function loadBadge() {
      try {
        const res = await fetch("/api/dashboard/escalations");
        const json = await res.json();
        if (!cancelled && res.ok) setEscalatedCount(json.data.count ?? 0);
      } catch {
        /* ignore */
      }
    }
    void loadBadge();
    const timer = setInterval(() => void loadBadge(), 30_000);
    window.addEventListener("stf:escalations-changed", loadBadge);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("stf:escalations-changed", loadBadge);
    };
  }, [pathname]);

  return (
    <div className="flex min-h-screen bg-[#f4f2ee]">
      <aside className="flex w-60 shrink-0 flex-col border-r border-stone-200 bg-white">
        <div className="border-b border-stone-100 p-5">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-teal-800">
            Operations
          </p>
          <h1 className="truncate font-semibold text-slate-900">{businessName}</h1>
          <p className="mt-0.5 truncate text-xs text-stone-500">{userName}</p>
          <p className="mt-1 text-[11px] uppercase tracking-wide text-stone-400">
            {owner ? "Owner" : "Front desk"}
          </p>
        </div>
        <nav className="flex-1 space-y-0.5 p-3">
          {items.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-teal-50 text-teal-900"
                    : "text-stone-600 hover:bg-stone-50 hover:text-slate-900"
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  {item.label}
                  {item.href === "/dashboard/conversations" && escalatedCount > 0 && (
                    <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {escalatedCount}
                    </span>
                  )}
                </span>
              </Link>
            );
          })}
        </nav>
        <div className="space-y-2 border-t border-stone-100 p-3">
          {businessSlug && (
            <Link
              href={`/chat/${businessSlug}`}
              className="block py-1 text-center text-xs text-stone-500 hover:text-teal-800"
            >
              Customer chat
            </Link>
          )}
          <LogoutButton />
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-5xl p-6 md:p-8">{children}</div>
      </main>
    </div>
  );
}
