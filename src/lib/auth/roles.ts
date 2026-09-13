export function isOwnerRole(role: string): boolean {
  return role === "BUSINESS_OWNER" || role === "SUPER_ADMIN";
}
