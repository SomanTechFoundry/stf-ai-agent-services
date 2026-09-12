"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "./LogoutButton";

const NAV = [
  { href: "/dashboard/appointments", label: "Appointments" },
  { href: "/dashboard/conversations", label: "Conversations" },
  { href: "/dashboard/settings", label: "Settings" },
];

interface Props {
  businessName: string;
  businessSlug?: string | null;
  userName: string;
  children: React.ReactNode;
}

export function DashboardShell({
  businessName,
  businessSlug,
  userName,
  children,
}: Props) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-[#f4f2ee]">
      <aside className="flex w-60 shrink-0 flex-col border-r border-stone-200 bg-white">
        <div className="border-b border-stone-100 p-5">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-teal-800">
            Operations
          </p>
          <h1 className="truncate font-semibold text-slate-900">{businessName}</h1>
          <p className="mt-0.5 truncate text-xs text-stone-500">{userName}</p>
        </div>
        <nav className="flex-1 space-y-0.5 p-3">
          {NAV.map((item) => {
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
                {item.label}
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
