# KickerGPT API

AI-powered football analysis and predictions platform API. Provides intelligent match analysis, real-time fixture data, AI-powered predictions, and natural language query capabilities.

## Features

- **AI Match Analysis** - GPT-4o-mini powered fixture analysis and predictions
- **Natural Language Queries** - Search fixtures using plain English (e.g., "BTTS from La Liga", "Over 2.5 goals from England")
- **Multi-Source Data** - Integrates Sportmonks and API-Football for comprehensive coverage
- **Prediction Engine** - BTTS, Over/Under goals, match result predictions with confidence levels
- **Custom Strategies** - User-defined betting strategy creation and matching
- **Subscription Tiers** - Free, 3-Day Pass, 7-Day Pass, Pro, and Monthly Unlimited plans
- **Multi-Payment Support** - Stripe (USD/EUR/GBP), Paystack (NGN), mobile IAP
- **Ad Rewards** - Credit earning through ad viewing for mobile users

## Tech Stack

- **Framework**: NestJS 11.x with TypeScript
- **Database**: PostgreSQL 17 with TypeORM
- **Caching**: Redis (Upstash)
- **AI**: OpenAI API (gpt-4o-mini)
- **Payments**: Stripe, Paystack, RevenueCat, Google Play
- **Email**: Nodemailer with Resend SMTP
- **Storage**: AWS S3
- **Docs**: Swagger/OpenAPI

## Prerequisites

- Node.js >= 16.0.0
- PostgreSQL 17+
- Redis (or Upstash account)
- npm or yarn

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd match-gpt-api
```

2. Install dependencies:
```bash
npm install
```

3. Copy the environment template and configure:
```bash
cp env-example-relational .env
```

4. Update `.env` with your credentials:
```env
# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USERNAME=root
DATABASE_PASSWORD=secret
DATABASE_NAME=api

# Authentication
AUTH_JWT_SECRET=your-secret-key
AUTH_JWT_TOKEN_EXPIRES_IN=1h

# OpenAI
OPENAI_API_KEY=your-openai-key

# Sportmonks
SPORTMONKS_API_TOKEN=your-sportmonks-token

# Redis/Upstash
UPSTASH_REDIS_REST_URL=your-upstash-url
UPSTASH_REDIS_REST_TOKEN=your-upstash-token
```

5. Run database migrations:
```bash
npm run migration:run
```

6. Seed the database (optional):
```bash
npm run seed:run:relational
```

## Running the Application

### Development
```bash
npm run start:dev
```

### Production
```bash
npm run build
npm run start:prod
```

### Docker
```bash
docker-compose up -d
```

This starts:
- PostgreSQL on port 5432
- Maildev on port 1080 (web) / 1025 (SMTP)
- Adminer on port 8080
- API on port 3000

## API Documentation

Swagger documentation is available at `/docs` when the server is running.

### Key Endpoints

#### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/email/register` | Register new user |
| POST | `/api/v1/auth/email/login` | Login |
| POST | `/api/v1/auth/email/confirm` | Confirm email |
| GET | `/api/v1/auth/me` | Get current user |
| POST | `/api/v1/auth/refresh` | Refresh token |

#### Fixtures & Matches
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/matches/today` | Today's fixtures |
| GET | `/api/v1/matches/three-days` | Next 3 days fixtures |
| GET | `/api/v1/fixtures/today` | Today's fixtures (API-Football) |
| POST | `/api/v1/fixtures/{fixtureId}/analyze` | AI analysis for a fixture |

#### Predictions
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/predictions` | Today's match predictions |

#### Natural Language Query
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/query` | Search fixtures with natural language |
| GET | `/api/v1/query/suggestions` | Example queries |
| GET | `/api/v1/query/countries` | Available countries |
| GET | `/api/v1/query/leagues` | Available leagues |

#### Subscriptions
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/subscriptions/me` | Current subscription |
| POST | `/api/v1/subscriptions/select-plan` | Initiate checkout |
| GET | `/api/v1/subscriptions/usage` | Credit usage |

#### Strategies
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/strategies` | Create strategy |
| GET | `/api/v1/strategies` | List strategies |
| POST | `/api/v1/strategies/{id}/find-matches` | Find matching fixtures |

## Fixture Analysis

The API exposes `POST /api/v1/fixtures/{fixtureId}/analyze` for AI-powered match analysis:

```http
POST /api/v1/fixtures/123456/analyze
Content-Type: application/json
Authorization: Bearer <token>

{
  "message": "Give me the tactical matchup for this game",
  "tone": "concise"
}
```

Chat history endpoints:
```
GET /api/v1/fixtures/user/chats?limit=20&offset=0
GET /api/v1/fixtures/{fixtureId}/chats?limit=20
```

## Project Structure

```
src/
├── admin/              # Admin dashboard & metrics
├── ads/                # Ad reward system
├── auth/               # Authentication & authorization
├── fixtures/           # Fixture data & AI analysis
├── natural-query/      # Natural language search
├── openai/             # OpenAI integration
├── paystack/           # Paystack payments
├── predictions/        # Match predictions
├── prompt-usage/       # API credit management
├── redis/              # Redis/Upstash integration
├── sportmonks/         # Sportmonks API integration
├── strategies/         # User betting strategies
├── stripe/             # Stripe payments
├── subscriptions/      # Subscription management
├── users/              # User management
└── utils/              # Shared utilities
```

## Subscription Plans

| Plan | Features |
|------|----------|
| Free | 5 predictions per request |
| 3-Day Pass | 5 predictions per request, 3 days access |
| 7-Day Pass | 5 predictions per request, 7 days access |
| Pro | Unlimited predictions, advanced strategies |
| Monthly Unlimited | All features, monthly billing |

## Testing

```bash
# Unit tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:cov

# E2E tests
npm run test:e2e

# Docker E2E
npm run test:e2e:relational:docker
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run start:dev` | Start in development mode |
| `npm run start:prod` | Start in production mode |
| `npm run build` | Build the application |
| `npm run lint` | Run ESLint |
| `npm run format` | Format with Prettier |
| `npm run migration:generate` | Generate migration |
| `npm run migration:run` | Run migrations |
| `npm run seed:run:relational` | Run database seeds |

## Environment Variables

See `env-example-relational` for the complete list. Key categories:

- **Database**: PostgreSQL connection settings
- **Authentication**: JWT secrets and token expiration
- **APIs**: OpenAI, Sportmonks, API-Football keys
- **Payments**: Stripe, Paystack credentials
- **Email**: SMTP configuration
- **Storage**: AWS S3 settings
- **Redis**: Upstash connection details

Required for AI analysis:
```env
OPENAI_API_KEY=<your key>
OPENAI_MODEL=gpt-4o-mini
OPENAI_TEMPERATURE=0.3
OPENAI_BASE_URL=https://api.openai.com/v1
```

## Scheduled Tasks

The API runs several cron jobs:

- **Prediction Generation**: Daily at 00:00 UTC
- **Cache Warming**: Periodic fixture and prediction updates
- **Email Notifications**: Subscription reminders, strategy announcements

## Documentation

Additional documentation available in `/docs`:
- Architecture patterns
- Authentication flows
- Database schema
- File uploading
- Mobile app integration
- Installation guides

## License

Private - All rights reserved
