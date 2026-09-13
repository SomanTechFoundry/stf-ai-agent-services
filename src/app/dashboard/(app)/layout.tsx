import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export default async function ProtectedDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/dashboard/login");
  }

  const business = await prisma.business.findUnique({
    where: { id: session.businessId },
    select: { name: true, slug: true },
  });

  return (
    <DashboardShell
      businessName={business?.name ?? "Business"}
      businessSlug={business?.slug}
      userName={session.name}
      userRole={session.role}
    >
      {children}
    </DashboardShell>
  );
}
