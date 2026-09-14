const RESERVED = new Set([
  "api",
  "app",
  "admin",
  "booking",
  "chat",
  "dashboard",
  "go",
  "integrations",
  "onboard",
  "privacy",
  "sms-consent",
  "terms",
  "www",
  "widget-demo",
]);

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED.has(slug);
}

export function chatPath(slug: string): string {
  return `/chat/${slug}`;
}
