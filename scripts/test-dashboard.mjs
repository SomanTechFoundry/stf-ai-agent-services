/**
 * Smoke-test dashboard APIs against a running dev server.
 *
 * Usage:
 *   node scripts/test-dashboard.mjs
 *
 * Requires:
 *   - npm run dev (localhost:3000)
 *   - API_SECRET_KEY in .env.local
 *   - npm run db:seed (demo owner user)
 */

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const EMAIL = "owner@sunsetsalon.example";
const PASSWORD = "Sunset2026!";

function fail(msg) {
  console.error("FAIL:", msg);
  process.exit(1);
}

async function main() {
  console.log("Dashboard API smoke test →", BASE);

  const loginRes = await fetch(`${BASE}/api/dashboard/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const loginJson = await loginRes.json();
  if (!loginRes.ok) {
    fail(`Login ${loginRes.status}: ${loginJson?.error?.message ?? "unknown"}`);
  }
  console.log("OK  POST /api/dashboard/login →", loginJson.data.user.email);

  const cookie = loginRes.headers.get("set-cookie");
  if (!cookie?.includes("stf_dashboard_session")) {
    fail("Login did not set stf_dashboard_session cookie");
  }

  const authHeaders = { Cookie: cookie.split(";")[0] };

  for (const path of [
    "/api/dashboard/me",
    "/api/dashboard/appointments",
    "/api/dashboard/conversations",
    "/api/dashboard/settings",
  ]) {
    const res = await fetch(`${BASE}${path}`, { headers: authHeaders });
    const json = await res.json();
    if (!res.ok) {
      fail(`${path} ${res.status}: ${json?.error?.message ?? "unknown"}`);
    }
    console.log(`OK  GET ${path}`);
  }

  const logoutRes = await fetch(`${BASE}/api/dashboard/logout`, {
    method: "POST",
    headers: authHeaders,
  });
  if (!logoutRes.ok) fail("Logout failed");
  console.log("OK  POST /api/dashboard/logout");

  console.log("\nAll dashboard endpoints passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
