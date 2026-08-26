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
  userName: string;
  children: React.ReactNode;
}

export function DashboardShell({ businessName, userName, children }: Props) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <aside className="w-56 shrink-0 border-r border-gray-200 bg-white flex flex-col">
        <div className="p-5 border-b border-gray-100">
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600 mb-1">
            Owner Dashboard
          </p>
          <h1 className="font-semibold text-gray-900 truncate">{businessName}</h1>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{userName}</p>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-violet-50 text-violet-700"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-gray-100 space-y-2">
          <Link
            href="/chat/sunset-salon"
            className="block text-xs text-center text-gray-500 hover:text-violet-600 py-1"
          >
            Open chat demo →
          </Link>
          <LogoutButton />
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto p-6 md:p-8">{children}</div>
      </main>
    </div>
  );
}
