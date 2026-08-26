# Go Live — Step-by-Step (Customer POV Test)

Use this when you want a **public URL** so you can act like a customer and gradually improve.

**Hosting:** Vercel + Neon (already in stack).  
**Demo business:** Sunset Salon (`/chat/sunset-salon`).

---

## Who does what

| Step | Who | What |
|------|-----|------|
| 0 | **You** (or ask me) | Commit & push all code to GitHub |
| 1 | **You** | Create / confirm Neon production DB |
| 2 | **You** | Create Vercel project + link GitHub repo |
| 3 | **You** | Paste env vars in Vercel |
| 4 | Auto | Vercel builds, migrates DB, deploys |
| 5 | **You** | Run demo bootstrap once (salon + owner login) |
| 6 | **You** | Wire Twilio + Resend (optional for first chat test) |
| 7 | **You** | Customer POV smoke test |
| 8 | Both | Iterate features from real feedback |

I can prepare the repo, scripts, and docs. **Only you** can log into Neon / Vercel / Twilio / Resend with your accounts.

---

## Step 0 — Get code on GitHub

Your production features are still mostly **uncommitted** on `main`.

**Option A — ask me:** reply with `commit and push for production`.

**Option B — you run:**

```bash
git add -A
git status   # confirm no .env / .env.local
git commit -m "Ship production-ready agent, dashboard, SMS, and deploy config"
git push origin main
```

Do **not** commit `.env` or `.env.local`.

---

## Step 1 — Neon database (YOU)

1. Open [https://console.neon.tech](https://console.neon.tech)
2. Use your existing project **or** create a new one named `stf-ai-agent-prod`
3. Copy:
   - **Pooled** connection → `DATABASE_URL`
   - **Direct** connection → `DIRECT_URL`
4. Keep these for Step 3

Tip: for a clean customer test, prefer a **separate** Neon branch/project from local dev so test bookings don’t mix with your laptop data.

---

## Step 2 — Vercel project (YOU)

1. Open [https://vercel.com](https://vercel.com) → **Add New Project**
2. Import `somantechfoundry/stf-ai-agent-services`
3. Framework: Next.js (auto)
4. Root directory: repo root
5. Do **not** deploy yet — add env vars first (Step 3), then Deploy

If the CLI is easier:

```bash
npm i -g vercel
vercel login
vercel link
vercel --prod
```

---

## Step 3 — Environment variables (YOU)

In Vercel → Project → **Settings → Environment Variables**, add for **Production**:

### Required (chat + dashboard work)

| Name | Value |
|------|--------|
| `DATABASE_URL` | Neon pooled URL |
| `DIRECT_URL` | Neon direct URL |
| `API_SECRET_KEY` | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `GEMINI_API_KEY` | From [Google AI Studio](https://aistudio.google.com/) |
| `NEXT_PUBLIC_APP_URL` | Your Vercel URL, e.g. `https://stf-ai-agent-services.vercel.app` (update after first deploy if needed) |
| `NODE_ENV` | `production` |
| `LOG_LEVEL` | `info` |
| `AI_DEFAULT_PROVIDER` | `gemini` |
| `GEMINI_MODEL` | `gemini-3.1-flash-lite` (or your preferred model) |
| `RATE_LIMIT_AGENT_RPM` | `60` |

### Recommended for real customer feel (email + SMS)

| Name | Value |
|------|--------|
| `RESEND_API_KEY` | From Resend |
| `RESEND_FROM_EMAIL` | Verified sender (or `onboarding@resend.dev` for early tests) |
| `TWILIO_ACCOUNT_SID` | Twilio console |
| `TWILIO_AUTH_TOKEN` | Twilio console |
| `TWILIO_PHONE_NUMBER` | E.164, e.g. `+1…` |
| `TWILIO_BUSINESS_SLUG` | `sunset-salon` |

### Optional

| Name | Value |
|------|--------|
| `SENTRY_DSN` | After you install Sentry |

Copy the same keys from your local `.env.local` where they already work — but use a **new** `API_SECRET_KEY` for production (don’t reuse a weak/dev value if you can avoid it).

---

## Step 4 — Deploy (YOU click / auto on push)

1. Click **Deploy** on Vercel (or push to `main` if Git integration is on)
2. Build runs: `prisma generate` → `prisma migrate deploy` → `next build`
3. When green, open: `https://YOUR-APP.vercel.app/api/health`
4. Expect `"status":"ok"` and `"database":"ok"`

If health fails: check Neon URLs and that migrate ran (Vercel build logs).

Update `NEXT_PUBLIC_APP_URL` to the final Vercel domain and **redeploy** once if the first URL was a placeholder.

---

## Step 5 — Create demo salon + owner (YOU, once)

From your laptop (with production `DATABASE_URL` temporarily in the shell — not committed):

**PowerShell:**

```powershell
$env:ALLOW_DEMO_BOOTSTRAP="true"
$env:DATABASE_URL="postgresql://...pooled..."
$env:DIRECT_URL="postgresql://...direct..."
$env:DEMO_OWNER_EMAIL="you@yourdomain.com"
$env:DEMO_OWNER_PASSWORD="ChooseAStrongPassword!"
npm run db:bootstrap-demo
```

**Bash:**

```bash
ALLOW_DEMO_BOOTSTRAP=true \
DATABASE_URL="..." \
DIRECT_URL="..." \
DEMO_OWNER_EMAIL="you@yourdomain.com" \
DEMO_OWNER_PASSWORD='ChooseAStrongPassword!' \
npm run db:bootstrap-demo
```

This creates Sunset Salon services/staff/AI config + dashboard owner.

---

## Step 6 — Twilio / Resend (YOU, for full customer POV)

### Minimum for first test
Skip SMS/email — **web chat alone** is enough to feel the product.

### Full customer path
1. **Resend:** API key + from-address (domain verified when you can)
2. **Twilio:** upgrade off trial if you need custom SMS bodies
3. Twilio number → Messaging webhook:
   - URL: `https://YOUR-APP.vercel.app/api/webhooks/twilio/sms`
   - Method: `POST`
4. Redeploy if you just added Twilio env vars

---

## Step 7 — Customer POV smoke test (YOU)

Act like a salon customer, then like the owner.

### As customer
1. Open `https://YOUR-APP.vercel.app/chat/sunset-salon`
2. Ask: “What services do you offer?”
3. Book: “I’d like a women’s haircut tomorrow afternoon”
4. Finish with name + phone
5. If Resend/Twilio set: confirm email/SMS arrive
6. Try: “Cancel my appointment” / “Reschedule to Friday at 2pm”

### As owner
1. `https://YOUR-APP.vercel.app/dashboard/login`
2. Email/password from Step 5
3. See the appointment → Confirm / Reschedule / Cancel
4. Open Conversations → read the chat thread
5. Settings → change welcome message → Save → refresh chat

### Health / API
```bash
curl https://YOUR-APP.vercel.app/api/health
```

---

## Step 8 — Improve gradually (recommended order)

Ship feedback in this order so customers feel progress:

1. **Copy & UX** — greeting, shorter replies, mobile chat polish  
2. **Real business data** — your first salon’s name, hours, services, phone (replace demo)  
3. **SMS reliability** — Twilio production + inbound webhook  
4. **Reminders** — day-before SMS (new feature)  
5. **Dashboard CRUD** — edit services/staff/FAQs in UI  
6. **Custom domain** — `receptionist.yourbrand.com` in Vercel  
7. **Sentry** — catch production errors early  
8. **Second tenant** — prove multi-business onboarding  

Tell me which item you want next after smoke testing; I’ll implement it.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Build fails on Prisma | Confirm `DATABASE_URL` + `DIRECT_URL` on Vercel Production |
| Health `database: error` | Neon IP / wrong URL / migrate not applied |
| Login fails | Re-run bootstrap; check `API_SECRET_KEY` is set |
| Chat AI errors | Check `GEMINI_API_KEY` + model name |
| No SMS | Twilio trial / missing env / `smsOptIn` |
| Webhook 403 | Signature validation — URL must match exactly; auth token correct |

More detail: [DEPLOYMENT.md](./DEPLOYMENT.md)

---

## Ready checklist

- [ ] Code pushed to GitHub
- [ ] Neon prod URLs in Vercel
- [ ] `API_SECRET_KEY` + `GEMINI_API_KEY` set
- [ ] Deploy green + `/api/health` ok
- [ ] Demo bootstrap run once
- [ ] Chat booking works
- [ ] Dashboard shows the booking
- [ ] (Optional) Email/SMS confirmation works
