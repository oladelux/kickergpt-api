# KickerGPT API Roadmap

What's planned for the KickerGPT backend, roughly in priority order. The client roadmap is in [oladelux/kickergpt](https://github.com/oladelux/kickergpt/blob/main/ROADMAP.md).

## Now: hardening and cleanup

- [ ] **Test coverage.** Add unit tests for the prediction engine, strategy matching and natural-query parsing, and e2e tests for auth → analysis → usage limits.
- [ ] **CI on pull requests.** Run lint, tests and the build on every PR, not just on deploy.
- [ ] **Remove the add-on purchase endpoints.** `subscriptions/addon-purchase*` is no longer used by the client.
- [ ] **Lock down debug routes.** Put `GET /fixtures/redis-cache` and the `admin/*` warm-cache routes behind the admin guard, or remove them.
- [ ] **Rate limiting.** Throttle per user and per IP on `/analyze` and `/query` to protect OpenAI and data-provider quotas.
- [ ] **Clean up boilerplate.** Trim the inherited Brocoders docs and any template code KickerGPT does not use.

## Next: tech stack

- [ ] **Move to a monorepo.** Bring the web app, the mobile apps and the API into one repository, using npm workspaces with Turborepo:
  - `apps/web`: the React + Vite web client
  - `apps/mobile`: the Capacitor Android (and later iOS) apps
  - `apps/api`: the NestJS backend
  - `packages/shared`: shared TypeScript types and API contracts (fixtures, strategies, subscriptions), so the client and server stay in sync
- [ ] **One pipeline.** Run lint, type-check, tests and builds for every app from a single CI workflow, and only rebuild the apps that changed.

## Next: product

- [ ] **Strategy alerts.** A cron job that emails or pushes users when a new fixture matches one of their active strategies.
- [ ] **Strategy back-testing.** Score a strategy against historical fixtures using Control Room outcomes.
- [ ] **Prediction accuracy reporting.** Public, aggregated accuracy stats per market and league.
- [ ] **Apple App Store purchases.** Verify iOS in-app subscriptions alongside Google Play.
- [ ] **Streaming analysis.** Stream AI responses (SSE) to make the chat feel faster.

## Later: ideas

- [ ] Live in-play data and updated predictions during matches
- [ ] More leagues and lower divisions
- [ ] Multi-language AI responses (French, Portuguese and Spanish first)
- [ ] Public read-only API for predictions
