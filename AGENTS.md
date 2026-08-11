# CardLedger Project Memory

## What This Project Is

CardLedger is a credit-card ledger for tracking cards, holders/friends, card handovers, spending, payments, bank bill payments, budgets, SMS imports, statement imports, recommendations, and dashboard analytics.

This is not a single Vite app. It is a pnpm/Turbo monorepo with three main product surfaces:

- `packages/app`: React + Vite + TypeScript web/PWA client.
- `packages/server`: Fastify API backed by PostgreSQL through Drizzle ORM.
- `packages/android-native`: Native Android Kotlin/Jetpack Compose client that talks to the same API.
- `packages/shared`: Shared TypeScript domain logic, models, Zod schemas, and SMS parsing utilities.

## Commands

Use pnpm from the repo root.

- Install: `pnpm install`
- Run all dev tasks: `pnpm dev`
- Build all packages: `pnpm build`
- Test all packages: `pnpm test`
- Lint all packages: `pnpm lint`
- Server dev only: `pnpm --filter @cardledger/server dev`
- App dev only: `pnpm --filter @cardledger/app dev`
- Shared tests only: `pnpm --filter @cardledger/shared test`
- Server tests only: `pnpm --filter @cardledger/server test`
- Generate DB migration: `pnpm --filter @cardledger/server db:generate`
- Run DB migrations manually: `pnpm --filter @cardledger/server db:migrate`

The root package pins `pnpm@11.5.1`. Turbo task outputs are configured in `turbo.json`.

## Environment

Use `.env.example` for variable names. Do not expose real `.env` values in responses.

Important variables:

- `POSTGRES_URL`: PostgreSQL connection string used by Drizzle and migrations.
- `JWT_SECRET`: Fastify JWT secret; production value should be strong and at least 32 chars.
- `DEFAULT_PASSWORD`: password used when seeding the default `admin` user.
- `PORT`: server port, default `3001`.
- `CORS_ORIGIN`: optional comma-separated allowed origins; defaults to `http://localhost:5173`.
- `VITE_API_URL`: web client API base. In Docker it can be empty so `/api` is proxied by nginx.
- `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`: AI parsing/recommendation provider settings.
- `GOOGLE_CLIENT_ID`: Google login validation for server/native app.

`docker-compose.yml` defines `postgres`, `server`, and `app`. It expects an external Docker network named `dokploy-network`, so local Docker runs may need that network created or the compose file adjusted.

## Web App

`packages/app` is a React 18, Vite 5, TypeScript app using:

- React Router for routes in `packages/app/src/App.tsx`.
- React Query for server state in `packages/app/src/data/hooks`.
- Axios API client in `packages/app/src/data/apiClient.ts`.
- Zustand for local UI and pending mutation state.
- Tailwind CSS and Framer Motion for UI.

Main routes:

- `/login`
- `/`
- `/analytics`
- `/search`
- `/cards`
- `/cards/new`
- `/cards/:id`
- `/cards/:id/edit`
- `/holders`
- `/recommender`
- `/settings`
- `/lock`

The web app stores only local client state in browser storage:

- `cl_token`: JWT access token.
- `cl_pin_hash`: local PIN hash for app lock.
- `cl-pending-mutations`: persisted Zustand queue for pending mutations.

The durable ledger data source is the server/PostgreSQL database, not localStorage.

## Native Android App

`packages/android-native` is a Kotlin + Jetpack Compose app with app id `com.imvj.cardledger`.

Important native architecture:

- Single-activity Compose app.
- MVVM with ViewModel + StateFlow.
- Manual DI through `AppContainer`.
- Retrofit API surface in `data/net/ApiService.kt`.
- DataStore for token, PIN, biometric preference, and settings.
- Offline cache stored as `offline_cache.json` by `CacheStore`.
- SMS import through Android SMS permissions, local parser, and review flow.

The native API base is currently configured in Gradle as `https://cards.imvj.host/api/`.

## Server

`packages/server` is a Fastify TypeScript API.

Key files:

- `src/index.ts`: runs Drizzle migrations with retry, builds Fastify app, seeds defaults, starts server.
- `src/app.ts`: registers CORS, rate limiting, JWT auth plugin, and routes.
- `src/plugins/auth.ts`: JWT authentication decorator.
- `src/db/index.ts`: PostgreSQL pool and Drizzle client.
- `src/db/schema.ts`: canonical database schema.
- `src/db/migrate.ts`: manual migration runner.
- `drizzle.config.ts`: Drizzle Kit config.
- `src/db/seed.ts`: creates default `admin` user and default `Me` holder when needed.

Registered API route groups:

- Auth: `/auth/login`, `/auth/register`, `/auth/link-password`, `/auth/google`
- Cards: `/cards`
- Card recommendations: `/cards/recommend`
- Holders: `/holders`
- Assignments: `/assignments`
- Transactions: `/transactions`
- Friend payments: `/payments`
- Budgets: `/budgets`
- Statements: `/statements/upload`
- Metadata: `/metadata/banks`, `/metadata/detect-palette`
- SMS AI parsing: `/sms/parse/ai`
- Dashboard: `/dashboard/summary`

Most route groups require JWT auth through `app.authenticate`.

## Database

The real DB is PostgreSQL. Drizzle ORM defines the schema in `packages/server/src/db/schema.ts`, and migration SQL lives in `packages/server/drizzle`.

Primary tables:

- `users`: account identity; supports username/password, email, and Google OAuth.
- `holders`: people using cards. Has `user_id`; `relationship` is currently `me` or `friend`.
- `cards`: user-owned credit cards. Stores network, bank, last4, billing/due days, credit limit, BIN, variant, palette, shared limit link, and rewards schema.
- `assignments`: card-to-holder handover windows. Used to resolve who used a card on a transaction date.
- `transactions`: spends, refunds, and some payment-like ledger events tied to a card and holder-at-time.
- `payments`: money collected from a holder/friend, optionally linked to a transaction.
- `card_payments`: payments made to the bank/card account, optionally linked to a transaction.
- `budgets`: user category budgets.

Important DB implementation details:

- IDs are UUID primary keys generated by Postgres/Drizzle.
- Money columns use PostgreSQL `numeric(12, 2)`. Drizzle returns numeric values as strings in many places, so server code often writes `String(amount)` and parses with `parseFloat` for calculations.
- Date-only fields use `date` and are passed around as `YYYY-MM-DD` strings.
- `created_at` uses timestamps with `defaultNow()`.
- User scoping is explicit on `users`, `holders`, `cards`, and `budgets`. `assignments`, `transactions`, `payments`, and `card_payments` are scoped through joins to user-owned cards or holders.
- Indexes exist for common user/card/holder/date lookups.

Current relationships:

- `holders.user_id -> users.id`
- `cards.user_id -> users.id`
- `budgets.user_id -> users.id`
- `assignments.card_id -> cards.id`
- `assignments.holder_id -> holders.id`
- `transactions.card_id -> cards.id`
- `transactions.holder_id_at_time -> holders.id`
- `payments.holder_id -> holders.id`
- `payments.transaction_id -> transactions.id`
- `card_payments.card_id -> cards.id`
- `card_payments.holder_id -> holders.id`
- `card_payments.transaction_id -> transactions.id`

## Domain Rules To Preserve

- A card's `current_spend` is derived, not stored. The server computes it from unpaid spend/refund-like transactions and subtracts `card_payments`.
- `transactions.type` can include `spend`, `payment`, `bill_payment`, and `refund` in shared validation. Keep shared types, DB behavior, app assumptions, and native DTOs aligned when changing this.
- Friend repayment collection is represented in `payments`.
- Friend collected/to-collect totals must only use friend spend/refund rows plus `payments`. `card_payments` must never increase friend collected or to-collect totals.
- Bank/card bill payment is represented in `card_payments`; `/transactions` merges these into transaction-shaped `bill_payment` rows for client consistency. Client-side friend collection calculations must ignore those merged `bill_payment` rows.
- If `holder_id_at_time` is omitted when creating a transaction, the server resolves the holder from card assignments for the transaction date, then falls back to the default `me` holder.
- Partial friend payments can split a linked transaction: the original transaction is reduced to the unpaid remainder, and a paid clone is created for the paid portion.
- Dashboard numbers in `/dashboard/summary` are derived from cards, holders, transactions, payments, card payments, and budgets. Avoid duplicating these calculations client-side unless there is a clear reason.
- `shared_limit_with` means a card shares a credit limit; summary excludes shared-limit child cards from `totalLimit`.
- Rewards are derived on transaction creation from `cards.rewards_schema` when present.
- SMS dedupe uses `dedupe_hash`; preserve this field when importing or syncing transactions.

## Shared Package

`packages/shared` should be the first place to update cross-platform contracts.

Important files:

- `src/schemas/index.ts`: Zod request schemas for server validation.
- `src/models/index.ts`: shared TypeScript model interfaces consumed by web.
- `src/domain/resolveHolder.ts`: card assignment holder resolution.
- `src/domain/billingCycle.ts`: due/cycle logic.
- `src/domain/analytics.ts`: shared analytics helpers.
- `src/domain/cardType.ts`: card network/type detection.
- `src/sms/*`: SMS normalization, parsing, dedupe hashing, parser rules, and tests.

If API payloads change, update shared schemas/models, server routes, web hooks/screens, and Android DTOs together.

## Testing And Verification

Prefer targeted verification first, then broader checks when touching shared contracts.

- Shared domain changes: `pnpm --filter @cardledger/shared test`
- Server route/DB changes: `pnpm --filter @cardledger/server test`
- Web TypeScript/build changes: `pnpm --filter @cardledger/app build`
- Whole repo confidence check: `pnpm test && pnpm build`

Server tests expect a reachable PostgreSQL database from `POSTGRES_URL`; defaults in some tests point to `postgresql://cardledger:cardledger@localhost:5432/cardledger`.

## Known Gotchas

- Do not assume data lives in browser localStorage. Ledger data lives in PostgreSQL through the Fastify server.
- Do not read or print real `.env` secrets. Use `.env.example` for documentation.
- Keep money conversion explicit because DB numerics are string-like at the API boundary.
- Keep date-only values as `YYYY-MM-DD`; avoid accidental timezone shifts from `Date` serialization.
- `packages/app/src/data/hooks/useStatements.ts` uses `localStorage.getItem('token')`, while the main API client stores `cl_token`; check this before changing statement upload auth.
- Android README mentions `app/build.gradle.kts`, but the repo currently has `app/build.gradle`.
- Comments or docs may have encoding artifacts from prior edits. Prefer ASCII in new files unless a file already clearly needs Unicode.
- Generated files include Drizzle migration SQL/meta snapshots, build outputs, Turbo cache, and Android Gradle outputs. Avoid editing generated output unless the task is specifically about it.

## Development Style

- Follow existing package boundaries: shared contracts in `packages/shared`, API behavior in `packages/server`, web client behavior in `packages/app`, native behavior in `packages/android-native`.
- Keep route authorization scoped by authenticated user. New queries should prove ownership through `user_id` or joins to user-owned cards/holders.
- Use existing Zod schemas for validation and add/update schemas before route changes.
- Use React Query invalidation patterns already present in `packages/app/src/data/hooks`.
- For frontend work, preserve the existing dense financial-dashboard feel and avoid unrelated visual rewrites.
