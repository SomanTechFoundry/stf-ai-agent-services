import Link from "next/link";
import { LegalLinks } from "@/components/legal/LegalLinks";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#f4f2ee] px-4 py-12">
      <article className="mx-auto max-w-2xl rounded-2xl border border-stone-200 bg-white p-8 text-sm leading-relaxed text-stone-700">
        <Link href="/" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-800">
          STF AI Agent Services
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">Privacy</h1>
        <p className="mt-4">
          Soman Tech Foundry operates this receptionist platform for local businesses. We collect
          what is needed to book appointments and run the dashboard: names, phone numbers, emails,
          chat and SMS messages, and booking details.
        </p>
        <p className="mt-3">
          Each business only sees its own customers. We do not sell personal information. Messages
          are sent to the AI provider configured for that business so the receptionist can reply.
        </p>
        <p className="mt-3">
          You can ask the business or STF to correct or delete customer records that we store.
          Payment data, when used, is handled by Stripe and is not stored as card numbers on our
          servers.
        </p>
        <LegalLinks className="mt-8 text-xs text-stone-500" />
      </article>
    </main>
  );
}
