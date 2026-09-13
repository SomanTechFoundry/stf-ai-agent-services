import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { isOwnerRole } from "@/lib/auth/roles";

export default async function SettingsOwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/dashboard/login");
  }
  if (!isOwnerRole(session.role)) {
    redirect("/dashboard/appointments");
  }
  return children;
}
