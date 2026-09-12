import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#f4f2ee]">
      <header className="border-b border-stone-200/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-800">
              Soman Tech Foundry
            </p>
            <p className="text-sm font-medium text-stone-800">AI Agent Services</p>
          </div>
          <Link
            href="/dashboard/login"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Sign in
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-20 md:py-28">
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-slate-900 md:text-5xl">
          Reception that answers, books, and follows through.
        </h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-stone-600">
          An AI receptionist for local businesses. Customers book, reschedule, or
          cancel by chat or SMS. Owners manage the calendar from one dashboard.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/dashboard/login"
            className="rounded-lg bg-teal-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-900"
          >
            Open dashboard
          </Link>
        </div>
      </section>

      <section className="border-t border-stone-200 bg-white">
        <div className="mx-auto grid max-w-5xl gap-8 px-6 py-14 sm:grid-cols-3">
          {[
            {
              title: "Bookings",
              body: "Availability, conflicts, and confirmations handled in one conversation.",
            },
            {
              title: "Inbox",
              body: "Every chat and SMS thread is stored for the business that owns it.",
            },
            {
              title: "Operations",
              body: "Confirm, complete, reschedule, or cancel from the owner dashboard.",
            },
          ].map((item) => (
            <div key={item.title}>
              <h2 className="text-sm font-semibold text-slate-900">{item.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">{item.body}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
