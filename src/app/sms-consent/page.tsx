import Link from "next/link";
import { LegalLinks } from "@/components/legal/LegalLinks";

export default function SmsConsentPage() {
  return (
    <main className="min-h-screen bg-[#f4f2ee] px-4 py-12">
      <article className="mx-auto max-w-2xl rounded-2xl border border-stone-200 bg-white p-8 text-sm leading-relaxed text-stone-700">
        <Link href="/" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-800">
          STF AI Agent Services
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">SMS consent</h1>
        <p className="mt-4">
          By giving a mobile number when you book or text the business, you agree that the business
          may send appointment confirmations, reminders, and replies related to your visit. Message
          frequency varies. Message and data rates may apply.
        </p>
        <p className="mt-3">
          Reply STOP to unsubscribe. Reply START to subscribe again. Reply HELP for help. Consent
          to texts is not required to book if you prefer to use chat or call the business.
        </p>
        <LegalLinks className="mt-8 text-xs text-stone-500" />
      </article>
    </main>
  );
}
