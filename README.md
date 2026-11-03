# KickerGPT API

The backend for **KickerGPT**, an AI-powered football match analysis platform. The API gathers fixture, team, injury and weather data from several providers, turns it into probability-based predictions, and powers an AI analyst that answers questions about any match. It also handles accounts, subscriptions and user-defined match strategies.

**Frontend (web + Android):** [oladelux/kickergpt](https://github.com/oladelux/kickergpt)

---

## Who it's for

KickerGPT is for people interested in **football match analysis**: fans who want a clear breakdown of upcoming fixtures, analysts who want form, head-to-head and team news in one place, and data-minded followers who want to write their own rules to find matches worth studying.

This repository is for developers who run or extend the KickerGPT backend.

## Features

- **AI match analysis.** Chat-style analysis of any fixture using OpenAI (`gpt-4o-mini`), with conversation history saved per user and fixture.
- **Natural-language search.** Find fixtures with plain-English queries such as *"BTTS from La Liga"* or *"Over 2.5 goals from England"*.
- **Prediction engine.** Daily BTTS, over/under goals and match-result predictions with confidence levels.
- **Multi-source data.** Combines Sportmonks and API-Football fixture data with weather data, cached in Redis.
- **Strategies.** Users define rule-based conditions (form, H2H, goals, clean sheets and more), and the API finds the fixtures that match.
- **Control Room.** Tracks how past predictions turned out.
- **Subscriptions and credits.** Free and PRO tiers with prompt allowances. Payments run through Stripe (USD/EUR/GBP), Paystack (NGN) and Google Play, and mobile users can earn credits from rewarded ads.
- **Admin endpoints.** User, subscription, usage and revenue metrics, plus cache control, behind an admin API key.
- **Scheduled jobs.** Prediction generation, cache warming and email notifications run as cron jobs.

## Tech stack

- **Framework:** [NestJS 11](https://nestjs.com) with TypeScript, built on the [Brocoders NestJS boilerplate](https://github.com/brocoders/nestjs-boilerplate)
- **Database:** PostgreSQL 17 with TypeORM (migrations and seeds)
- **Cache:** Redis (Upstash)
- **AI:** OpenAI API
- **Football data:** Sportmonks, API-Football, plus a weather API
- **Payments:** Stripe, Paystack, Google Play
- **Email:** Nodemailer over SMTP (Resend in production, Maildev locally)
- **Storage:** AWS S3 or local disk
- **Docs:** Swagger / OpenAPI at `/docs`
- **Deployment:** Docker, with GitHub Actions workflows for staging and production

## Getting started

### Prerequisites

- Node.js 22 (see `.nvmrc`) and npm
- PostgreSQL 17, or Docker
- A Redis / Upstash instance
- API keys for OpenAI, Sportmonks and API-Football. Payment provider keys are only needed if you test checkout.

### Install and run

```bash
git clone https://github.com/oladelux/kickergpt-api.git
cd kickergpt-api
npm install
cp env-example-relational .env     # then fill in your own values
npm run migration:run
npm run seed:run:relational        # optional sample data
npm run start:dev                  # http://localhost:3000/api/v1
```

Swagger docs are served at `http://localhost:3000/docs`.

To use the API from the frontend, set `VITE_API_URL=http://localhost:3000/api/v1` in the [frontend's](https://github.com/oladelux/kickergpt) `.env`.

### Run with Docker

```bash
cp env-example-relational .env
docker compose up -d
```

This starts PostgreSQL (5432), Maildev (1080 web / 1025 SMTP), Adminer (8080) and the API (3000).

### Environment variables

`env-example-relational` lists every variable, with placeholder values only. The main groups are:

| Group | Variables |
| --- | --- |
| App | `APP_PORT`, `API_PREFIX`, `FRONTEND_DOMAIN`, `NODE_ENV` |
| Database | `DATABASE_*` |
| Auth | `AUTH_*_SECRET`, `AUTH_*_EXPIRES_IN` |
| AI | `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_TEMPERATURE` |
| Football data | `SPORTMONKS_*`, `API_FOOTBALL_*`, `WEATHER_API_KEY` |
| Cache | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` |
| Payments | `STRIPE_*`, `PAYSTACK_*` |
| Email | `MAIL_*` |
| Storage | `FILE_DRIVER`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `AWS_*` |
| Admin and ads | `ADMIN_API_KEY`, `MAX_ADS_PER_DAY`, `AD_COOLDOWN_MINUTES`, `CREDITS_PER_AD` |

Never commit `.env`. It is listed in `.gitignore`.

## API overview

All routes are prefixed with `/api/v1`. The full reference is in Swagger at `/docs`.

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/email/register`, `POST /auth/email/login`, `POST /auth/email/confirm`, `POST /auth/forgot/password`, `POST /auth/reset/password`, `GET /auth/me`, `POST /auth/refresh`, `POST /auth/logout` |
| Matches | `GET /matches/today`, `GET /matches/three-days`, `GET /fixtures/today` |
| Analysis | `POST /analyze/{fixtureId}`, `GET /fixtures/user/chats`, `GET /fixtures/{fixtureId}/chats` |
| Predictions | `GET /predictions` |
| Natural-language query | `POST /query`, `GET /query/suggestions`, `GET /query/countries`, `GET /query/leagues` |
| Strategies | `GET/POST /strategies`, `GET/PATCH/DELETE /strategies/{id}`, `POST /strategies/{id}/find-matches` |
| Control Room | `GET /control-room`, `POST /control-room/outcomes` |
| Subscriptions | `GET /subscriptions/me`, `POST /subscriptions/select-plan`, `GET /subscriptions/usage`, `POST /subscriptions/verify`, `POST /subscriptions/cancel` |
| Ads | `POST /ads/reward` |
| Admin | `/admin/metrics`, `/admin/users`, `/admin/subscriptions`, `/admin/prompt-usage/*` and more (admin API key required) |

Example analysis request:

```http
POST /api/v1/analyze/123456
Authorization: Bearer <token>
Content-Type: application/json

{ "message": "Give me the tactical matchup for this game", "tone": "concise" }
```

## Project structure

```
src/
├── admin/           # Admin metrics and tools
├── ads/             # Rewarded-ad credits
├── analysis/        # AI fixture analysis
├── auth/            # Email auth, JWT, refresh tokens
├── control-room/    # Prediction outcome tracking
├── fixture-chats/   # Saved analysis conversations
├── fixtures/        # API-Football fixtures
├── natural-query/   # Plain-English fixture search
├── openai/          # OpenAI client
├── paystack/        # Paystack payments
├── predictions/     # Daily prediction engine
├── prompt-usage/    # Credit and usage limits
├── redis/           # Upstash Redis cache
├── sportmonks/      # Sportmonks data and match lists
├── strategies/      # User strategies and matching
├── stripe/          # Stripe payments
├── subscriptions/   # Plans, checkout and webhooks
├── weather/         # Weather data for fixtures
└── users/, mail/, files/, database/ ...   # Boilerplate modules
```

## Scripts

| Script | Description |
| --- | --- |
| `npm run start:dev` | Start with hot reload |
| `npm run build` / `npm run start:prod` | Build and run the production server |
| `npm run lint` / `npm run format` | ESLint / Prettier |
| `npm test` / `npm run test:e2e` | Unit / end-to-end tests |
| `npm run migration:generate` / `migration:run` | TypeORM migrations |
| `npm run seed:run:relational` | Seed the database |

More background on the boilerplate's architecture, auth, database and testing is in [`docs/`](docs/readme.md).

## Roadmap

The plans for what comes next are in **[ROADMAP.md](ROADMAP.md)**.

## License

[MIT](LICENSE) © Oladele Olorunsola. Built on the MIT-licensed Brocoders NestJS boilerplate.
