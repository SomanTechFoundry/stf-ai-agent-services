import Link from "next/link";

export function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <nav className={`flex flex-wrap items-center justify-center gap-x-3 gap-y-1 ${className}`}>
      <Link href="/privacy" className="hover:underline">
        Privacy
      </Link>
      <Link href="/sms-consent" className="hover:underline">
        SMS consent
      </Link>
      <Link href="/terms" className="hover:underline">
        Terms
      </Link>
    </nav>
  );
}
