import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-gray-50">
      <div className="max-w-3xl w-full text-center">
        {/* Hero */}
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 bg-violet-100 text-violet-700 text-xs font-semibold px-3 py-1 rounded-full mb-4">
            <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
            Phase 6 — Production Ready
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 mb-3">
            STF AI Agent Services
          </h1>
          <p className="text-lg text-gray-500 max-w-xl mx-auto">
            Multi-tenant AI receptionist platform for local businesses.
            Book, cancel, and reschedule appointments — via web chat or SMS — with an owner dashboard.
          </p>
        </div>

        {/* Demo CTAs */}
        <div className="grid sm:grid-cols-2 gap-4 mb-8">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <h2 className="font-semibold text-gray-900 mb-1">Live Demo — Sunset Salon</h2>
            <p className="text-sm text-gray-500 mb-4">
              Chat with Sunny, the AI receptionist. Book an appointment or ask about services.
            </p>
            <Link
              href="/chat/sunset-salon"
              className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors active:scale-95"
            >
              Open Chat Demo
            </Link>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <h2 className="font-semibold text-gray-900 mb-1">Owner Dashboard</h2>
            <p className="text-sm text-gray-500 mb-4">
              View appointments, conversations, and business settings. Run{" "}
              <code className="text-xs bg-gray-100 px-1 rounded">npm run db:seed</code> for demo login.
            </p>
            <Link
              href="/dashboard/login"
              className="inline-flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors active:scale-95"
            >
              Open Dashboard
            </Link>
          </div>
        </div>

        {/* Status grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-6 mb-8">
          {[
            { label: "Foundation", phase: "1", done: true },
            { label: "Multi-tenant Core", phase: "2", done: true },
            { label: "AI Agent Core", phase: "3", done: true },
            { label: "Booking Engine", phase: "4", done: true },
            { label: "SMS + Email", phase: "5", done: true },
            { label: "Owner Dashboard", phase: "6", done: true },
          ].map((p) => (
            <div key={p.phase} className="rounded-xl border bg-white px-3 py-3 text-left shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Phase {p.phase}</span>
                {p.done && (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-green-500">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              <p className="text-xs text-gray-700 font-medium">{p.label}</p>
            </div>
          ))}
        </div>

        {/* API links */}
        <div className="flex items-center justify-center gap-4 text-xs text-gray-400">
          <a href="/api/health" className="hover:text-violet-600 transition-colors">Health check</a>
          <span>·</span>
          <a href="/dashboard/login" className="hover:text-violet-600 transition-colors">Dashboard</a>
          <span>·</span>
          <span className="text-gray-300">v0.6.0</span>
        </div>
      </div>
    </main>
  );
}
