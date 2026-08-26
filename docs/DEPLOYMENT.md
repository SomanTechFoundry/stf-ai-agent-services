# Deployment Guide

> **Start here for your first production launch:** [GO_LIVE.md](./GO_LIVE.md)  
> This file is the technical reference; GO_LIVE is the step-by-step checklist.

Production deployment target: **Vercel** + **Neon PostgreSQL**.

## Prerequisites

- Neon project with pooled `DATABASE_URL` and direct `DIRECT_URL`
- Google AI Studio API key (Gemini)
- Resend account (email confirmations)
- Twilio account (SMS — upgrade from trial for custom messages)
- Strong `API_SECRET_KEY` (`openssl rand -hex 32`)

## Environment Variables (Production)

Copy from `.env.example` and set in Vercel → Settings → Environment Variables:

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes | Neon pooled connection |
| `DIRECT_URL` | Yes | Neon direct (migrations) |
| `API_SECRET_KEY` | Yes | Dashboard sessions + admin API |
| `GEMINI_API_KEY` | Yes | AI agent |
| `NEXT_PUBLIC_APP_URL` | Yes | e.g. `https://your-app.vercel.app` |
| `RESEND_API_KEY` | Recommended | Email confirmations |
| `RESEND_FROM_EMAIL` | Recommended | Verified sender |
| `TWILIO_ACCOUNT_SID` | Recommended | SMS |
| `TWILIO_AUTH_TOKEN` | Recommended | SMS + webhook validation |
| `TWILIO_PHONE_NUMBER` | Recommended | Outbound + inbound |
| `TWILIO_BUSINESS_SLUG` | Optional | Fallback business for inbound SMS |
| `SENTRY_DSN` | Recommended | Error monitoring |
| `RATE_LIMIT_AGENT_RPM` | Optional | Default 60 |

## Deploy to Vercel

```bash
npm i -g vercel
vercel login
vercel --prod
```

After first deploy:

```bash
npx prisma migrate deploy
npm run db:seed   # dev/demo only — never on production
```

Create the dashboard owner user in production via a one-off script or Prisma Studio.

## Twilio Inbound SMS

1. Upgrade Twilio account (trial blocks custom SMS bodies)
2. In Twilio Console → Phone Number → Messaging:
   - Webhook URL: `https://your-domain.com/api/webhooks/twilio/sms`
   - Method: POST
3. Set `TWILIO_BUSINESS_SLUG=sunset-salon` if business phone doesn't match Twilio number

## Health Check

Load balancers and uptime monitors should hit:

```
GET /api/health
```

Returns `503` if database is unreachable.

## Security Checklist

- [ ] `API_SECRET_KEY` is unique per environment
- [ ] Appointment admin APIs require `x-api-key` header
- [ ] Dashboard login rate-limited (10/min per IP)
- [ ] Agent chat rate-limited (`RATE_LIMIT_AGENT_RPM`)
- [ ] Twilio webhook signature validation enabled (auto in production)
- [ ] HTTPS enforced (Vercel default + HSTS header)

## Monitoring

Optional Sentry — install and set `SENTRY_DSN`:

```bash
npm install @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

The app initializes Sentry automatically via `src/instrumentation.ts` when the DSN is set.

## Post-Deploy Smoke Test

```bash
curl https://your-domain.com/api/health
node scripts/test-dashboard.mjs   # set NEXT_PUBLIC_APP_URL
```

Test chat: `https://your-domain.com/chat/sunset-salon`  
Test dashboard: `https://your-domain.com/dashboard/login`

## Known Limitations

- Rate limiting is in-memory (single instance). For multi-region production, use Redis/Upstash.
- Google Calendar sync is not yet implemented.
- Per-business Twilio numbers use global config until Integration model is wired.
