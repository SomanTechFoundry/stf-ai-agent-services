import Link from "next/link";
import { LegalLinks } from "@/components/legal/LegalLinks";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#f4f2ee] px-4 py-12">
      <article className="mx-auto max-w-2xl rounded-2xl border border-stone-200 bg-white p-8 text-sm leading-relaxed text-stone-700">
        <Link href="/" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-800">
          STF AI Agent Services
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">Terms</h1>
        <p className="mt-4">
          The platform provides an AI receptionist that can book, reschedule, and answer questions
          for a subscribed business. The business is responsible for its hours, prices, staff, and
          the accuracy of information it stores.
        </p>
        <p className="mt-3">
          Service is offered on a monthly plan. A trial may be limited in time. We may suspend an
          account for abuse, unpaid invoices, or legal risk. The AI can make mistakes — confirm
          unusual requests in the dashboard.
        </p>
        <p className="mt-3">
          These terms are governed by the laws applicable to Soman Tech Foundry&apos;s place of
          business. Contact STF for account closure.
        </p>
        <LegalLinks className="mt-8 text-xs text-stone-500" />
      </article>
    </main>
  );
}
