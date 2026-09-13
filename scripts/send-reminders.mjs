/**
 * Local/ops helper: POST /api/cron/reminders
 * Requires the Next.js server to be running.
 *
 *   npm run reminders
 *   npm run reminders -- --maxHours=72
 */

const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
const apiKey = process.env.API_SECRET_KEY;
if (!apiKey) {
  console.error("API_SECRET_KEY is missing. Load .env.local or set the variable.");
  process.exit(1);
}

const extra = process.argv.slice(2).join("&").replace(/--/g, "");
const qs = extra ? `?${extra}` : "";

const res = await fetch(`${appUrl}/api/cron/reminders${qs}`, {
  method: "POST",
  headers: { "x-api-key": apiKey },
});
const json = await res.json();
if (!res.ok) {
  console.error(json);
  process.exit(1);
}
console.log(JSON.stringify(json, null, 2));
