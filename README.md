# STF AI Agent Services

A professional, multi-tenant AI Agent Services Platform for local businesses.

## Business Goal

Operate AI-powered customer-facing agents for local businesses (salons, auto repair, cleaning, etc.) with one shared platform supporting multiple clients simultaneously.

**First vertical:** Salon / Barber AI Receptionist — booking, FAQ, appointment management via chat and SMS.

## Current Phase

**Phases 1–6 complete for first production test** ✅  
Foundation, multi-tenant APIs, AI agent + booking, SMS/email, owner dashboard, rate limiting, health checks, Vercel deploy config.

**Next:** Deploy with [docs/GO_LIVE.md](docs/GO_LIVE.md), test as a customer, then iterate.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript (strict) |
| Database | PostgreSQL via Neon |
| ORM | Prisma |
| AI | Google Gemini (abstracted — OpenAI/Anthropic pluggable) |
| Hosting | Vercel |
| SMS/Voice | Twilio (Phase 5) |
| Email | Resend (Phase 5) |
| Calendar | Google Calendar API (Phase 4) |
| Monitoring | Sentry (Phase 6) |

## Getting Started

### Prerequisites

- Node.js 22+
- npm 10+
- A [Neon](https://neon.tech) PostgreSQL database (free tier available)

### Setup

1. **Clone and install**

```bash
git clone <repo-url>
cd STF-AI-AGENT-SERVICES
npm install
```

2. **Configure environment**

```bash
cp .env.example .env.local
```

Edit `.env.local` and fill in at minimum:
- `DATABASE_URL` — your Neon pooled connection string
- `DIRECT_URL` — your Neon direct connection string

3. **Set up the database**

```bash
npm run db:migrate      # Run migrations (creates all tables)
npm run db:seed         # Seed demo data (development only)
```

4. **Start development server**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Verify health

```
GET http://localhost:3000/api/health
```

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run type-check` | Run TypeScript type check |
| `npm test` | Run all tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage |
| `npm run db:generate` | Regenerate Prisma client |
| `npm run db:migrate` | Run database migrations (dev) |
| `npm run db:migrate:prod` | Run database migrations (production) |
| `npm run db:studio` | Open Prisma Studio (database browser) |
| `npm run db:seed` | Seed development data |

## Project Structure

```
src/
├── app/
│   ├── api/                    # API endpoints
│   │   ├── health/             # Health check
│   │   ├── agent/              # AI agent conversation (Phase 3)
│   │   ├── appointments/       # Appointment CRUD (Phase 4)
│   │   ├── businesses/         # Business management (Phase 2)
│   │   └── customers/          # Customer management (Phase 2)
│   └── (dashboard)/            # Admin dashboard (Phase 6)
└── lib/
    ├── ai/                     # AI provider abstraction
    │   └── providers/          # Gemini, OpenAI, Anthropic
    ├── agent/                  # Agent core (Phase 3)
    │   ├── tools/              # Agent tools
    │   ├── state/              # Conversation state
    │   └── prompts/            # System prompt builders
    ├── db/                     # Prisma client singleton
    ├── services/               # Business logic services
    ├── integrations/           # External API integrations
    ├── auth/                   # Authentication (Phase 2)
    ├── config/                 # Environment configuration
    ├── logger/                 # Structured logging
    ├── errors/                 # Error types
    └── utils/                  # Shared utilities

prisma/
├── schema.prisma               # Full multi-tenant schema
└── seed.ts                     # Development seed data

tests/
├── unit/                       # Unit tests
├── integration/                # Integration tests
└── e2e/                        # End-to-end scenarios

docs/                           # Documentation
```

## Environment Variables

See `.env.example` for the complete list with descriptions.

**Required for Phase 1:**
- `DATABASE_URL`

**Required for Phase 3+ (AI):**
- `GEMINI_API_KEY`

**Required for Phase 4 (Calendar):**
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

**Required for Phase 5 (Communications):**
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
- `RESEND_API_KEY`

## Multi-Tenancy

Every data record is associated with a `businessId`. The platform enforces strict tenant isolation — no client can ever access another client's data.

Onboarding a new client is done through data configuration, not code changes:
- Create a `Business` record with their details
- Configure their `Service`, `Staff`, `BusinessHours`
- Set up their `AIConfiguration` (agent name, personality, instructions)
- Add `KnowledgeItem` entries for their FAQs/policies

## Security

- All secrets stored in environment variables, never in code
- Tenant isolation enforced at the service layer
- Structured error handling — internal details never exposed to clients
- Audit log for all significant actions
- HTTPS enforced in production

## Implementation Phases

| Phase | Status | Description |
|---|---|---|
| 1 | ✅ Complete | Foundation, schema, testing, logging |
| 2 | 🔜 Next | Multi-tenant auth, business/customer/service APIs |
| 3 | ⏳ Planned | Agent core, AI tools, conversation state |
| 4 | ⏳ Planned | Salon booking tools, Google Calendar |
| 5 | ⏳ Planned | Twilio SMS/voice, Resend email, human handoff |
| 6 | ⏳ Planned | Admin dashboard, usage tracking, Sentry |
| 7 | ⏳ Planned | Production deployment, security review |

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Database Schema](docs/DATABASE.md)
- [API Reference](docs/API.md) *(Phase 2+)*
- [Client Onboarding](docs/CLIENT_ONBOARDING.md) *(Phase 2+)*
- [Deployment](docs/DEPLOYMENT.md) *(Phase 7)*
