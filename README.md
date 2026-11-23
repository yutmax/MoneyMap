# MoneyMap

Personal finance tracking across several accounts in different fiat and crypto currencies.
Specification — [docs/SPEC.md](docs/SPEC.md), styling system — [docs/styles.md](docs/styles.md).

Current state: **phases 0–5 are done** and running in production. Phase 6 (polish) is in progress — see [What's missing](#whats-missing).

## Stack

| Layer        | Choice                                                                  |
| ------------ | ----------------------------------------------------------------------- |
| Monorepo     | pnpm workspaces                                                         |
| API          | Fastify 5 + Drizzle ORM + PostgreSQL 17                                 |
| Frontend     | Vite 6 + React 19 + TypeScript + SCSS Modules                           |
| Server state | TanStack Query                                                          |
| Forms        | React Hook Form + zod                                                   |
| Shared code  | `packages/shared` — zod schemas and money arithmetic used by both sides |

## Running locally

You need Node 24 and pnpm:

```bash
corepack enable pnpm
```

On Windows this command writes to `C:\Program Files\nodejs` and needs an elevated console. Either run it once as administrator, install pnpm directly with `npm i -g pnpm`, or call it as `corepack pnpm …` without enabling.

Then:

```bash
pnpm install
cp .env.example .env
```

Put a `JWT_SECRET` into `.env`; one way to generate it:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Start the database, apply migrations and load the currency catalog:

```bash
pnpm db:up
pnpm db:migrate
pnpm db:seed
```

Run the API and the frontend:

```bash
pnpm dev
```

- frontend — http://localhost:5173
- API — http://localhost:5000 (proxied under `/api`)
- pgweb — http://localhost:8081

In development only Postgres runs in a container: the API and Vite run natively, because on Windows HMR and the debugger degrade inside containers.

Emails (email verification, password reset) are not sent through a provider yet — they are printed to the API log together with a working link.

## Commands

```bash
pnpm dev            # API + frontend
pnpm build          # production build of both apps
pnpm typecheck      # tsc across all packages
pnpm lint           # eslint
pnpm format         # prettier --write
pnpm test           # vitest

pnpm db:up          # start Postgres + pgweb
pnpm db:down        # stop them
pnpm db:generate    # generate a migration from the Drizzle schema
pnpm db:migrate     # apply migrations
pnpm db:seed        # currency catalog
```

## Layout

```
apps/
  api/                  Fastify + Drizzle
    src/db/             schema and migrations
    src/modules/        by domain: auth, accounts, transactions, reports, …
    src/lib/            env, errors, money, scoping, tokens, password
    src/plugins/        requireAuth, csrf
  web/                  Vite + React, Feature-Sliced Design
    src/app/            providers, router, guards, global styles
    src/pages/          route screens, composition only
    src/widgets/        composite blocks: app shell, auth card, home widgets
    src/features/       actions: sign-in, sign-up, onboarding, forms
    src/entities/       entities: user, session, account, transaction, …
    src/shared/         UI kit, HTTP client, utilities, style tokens
packages/
  shared/               zod schemas, money arithmetic, i18n dictionaries
```

The frontend follows Feature-Sliced Design: a layer imports only from layers strictly below it (`app → pages → widgets → features → entities → shared`) and reaches a neighbouring slice only through its `index.ts`. `pnpm lint` enforces the import direction — it's a rule in `eslint.config.js`, not a verbal agreement.

`packages/shared` is the key piece: a validation schema is declared once, the API validates incoming requests with it, the frontend validates form fields with it, and types on both sides are inferred from it.

## Phase 0

- Monorepo, TypeScript in strict mode, ESLint, Prettier, CI.
- Schema for `users`, `sessions`, `refresh_tokens`, `user_tokens`, `currencies` + migrations.
- Sign-up (name, email, password), sign-in, refresh with rotation and reuse detection, sign-out, sign-out everywhere.
- First-run setup after the first sign-in: base currency and time zone, in a modal over the home page that can't be skipped. The time zone is picked from a list with cities and offsets rather than typed.
- Active devices list with per-session revocation (`/sessions`). Next to the address there's a city and a country: a bare IP doesn't answer "is this really me?", because nobody remembers their own addresses. The location is resolved at sign-in and stored with the session rather than looked up every time the list opens; when the address changes, the old location is cleared immediately. Can be turned off with `GEOIP_LOOKUP`. Each device shows its OS logo (Windows, Apple, Android, Linux, ChromeOS).
- Password change, password reset via an email token, email verification.
- argon2id, password check against breach data via k-anonymity, protection against user enumeration, CSRF, rate limiting.
- Money arithmetic on decimal.js with tests at the `NUMERIC(38,18)` boundaries.
- Production `Dockerfile`, `compose.prod.yml`, `Caddyfile`.

## Phase 1

Accounts: CRUD, balance, archive.

The balance is computed in the same query as the list — the opening balance plus the sum of the account's transactions. `amount_account` is stored signed, so it's a plain column sum with no `case`.

An account's currency is set at creation and never changes: `updateAccountSchema` simply doesn't contain it, so the field is silently dropped from the request body. Changing it retroactively would leave a history computed in one unit under a heading in another.

Any account can be deleted, archived or not. Deleting one with history takes its transactions with it (and both legs of every transfer it took part in, as deleting a single transfer does), its recurring rules and its budget — all soft and in one database transaction. The account dialog says what will go before it deletes. Archiving remains the way to hide an account and keep its history.

Categories are a fixed catalog defined in code, not user data: they can't be created, renamed or deleted, and their names follow the interface language. Income and expense categories are separate lists.

Transactions are income, expense and transfer. The sign is derived from the kind on the server: if the client sent it, an expense with a positive amount would increase the balance, and the mistake would only surface at reconciliation.

A transfer is two transactions sharing a `transfer_group_id`, inserted in one database transaction: a transfer whose debit happened but whose credit didn't is missing money. A leg can't be edited or deleted on its own. For accounts in different currencies the person enters both amounts and the cross rate is derived from them.

Retrying a request doesn't create a duplicate: `POST /transactions` accepts an `Idempotency-Key`, the key lives as long as the open form, and a second click returns the transaction already created.

The list uses cursor pagination over `(occurred_on DESC, id DESC)`. The cursor keeps both parts: the date alone can't tell two transactions on the same day apart, and `OFFSET` drifts as soon as a backdated transaction is added between page requests.

## Phase 2

Exchange rates live in `exchange_rates` against a single pivot currency — the euro. Cross rates are derived by division, because a full matrix of three hundred currencies would cost a hundred thousand rows a day for values that are fully recoverable from those three hundred.

The source from the spec didn't work out. The ECB knows 29 currencies, and none of them is the Belarusian rouble, the hryvnia, the tenge or the lari — exactly the ones this app is multi-currency for; exchangerate.host has since gone behind a key. Fiat comes from `@fawazahmed0/currency-api` (served from a CDN, no keys, with history by date), crypto from CoinGecko as the spec asked: it also has Toncoin, which the first source lacks. Sources are queried in turn and each one only gets the currencies not found yet, so one source failing costs its own currencies, not the whole load.

A missing rate blocks nothing. The nearest rate not later than the date is used, and if history doesn't reach that far — the earliest known one; both are marked stale and the client sees their real date. Currencies with no rate at all are left out of the total and listed separately: showing an incomplete total as complete is worse than saying one currency wasn't counted. Historical rates are never overwritten — only today's rate is updated until the day ends.

The combined balance is computed in the base currency and can be switched to any other right on the home page. Data doesn't change: accounts stay in their currencies, only the total is recalculated. The chart is built from `net_worth_snapshots` — daily snapshots rather than recomputing the whole history on every page open; a snapshot stores the currency it was computed in, so changing the base currency doesn't rewrite history.

A transaction can be entered in a foreign currency: a card in roubles, a receipt in złoty. The debited amount is optional — without it the rate for the transaction date is used — but a reference rate and the bank's rate are different numbers, and there's a field for the latter. The rate is fixed in the transaction and isn't recalculated when the amount is edited.

Background jobs run on pg-boss on the same Postgres: the daily rate load and the daily snapshot. An in-process schedule would mean a job lost on every restart and two jobs at once as soon as there are two processes. The worker lives inside the API process — on a single-core server a separate container for two jobs a day costs more than it gives.

By hand: `pnpm --filter @moneymap/api db:rates --days 30` and `db:snapshots --days 30` fill in history from before the app was installed.

## What's missing

Phase 6 (polish) from the spec:

- **Sending email.** The mailer is a stub: in production it logs an error instead of sending, so verification and password-reset emails don't go out. Waiting on a sending mailbox or an own domain.
- **Off-server backups.** Daily dumps are kept on the server itself for now (see [Backups](#backups)).
- **Automated integration tests** on a real Postgres and an end-to-end test; everything below that isn't unit-tested was checked by hand.
- **Full data export** to CSV and JSON (only the report export exists).
- **Two-factor authentication.**
- **Email reminders** and storing each user's language for emails.

## Installing on a phone

The icon is drawn once in `apps/web/scripts/icons.mjs` — a single source for all variants: an M monogram in one stroke on a lime plate. The script writes `favicon.svg` (rounded square) and `icon-maskable.svg` (full bleed, with the letter inside Android's "safe circle" that no mask will crop) and packs `favicon.ico`. The PNGs next to them are committed: they're rendered from those SVGs by a browser (headless Edge or a canvas), to avoid adding a rasteriser to the project for images that change once in a lifetime.

`manifest.webmanifest` with `display: standalone` and `apple-mobile-web-app-capable` in the markup make "Add to Home Screen" produce an app with its own icon rather than a shortcut with the address bar and browser buttons. iOS takes the icon only from `apple-touch-icon` and only as PNG, and keeps it from the moment it was added — a new icon appears only after removing the app and adding it again. Android takes it from the manifest, separately for normal display and for the mask.

`public/sw.js` caches nothing. Chrome needs it: a site without a service worker with a `fetch` handler isn't considered installable, and "Add to Home Screen" creates a shortcut. Caching an app that holds financial records is a separate decision with its own cost, and not one to make alongside an icon.

All of this works only over a secure connection, which is why the app moved from a bare IP to a name with a Let's Encrypt certificate (see [Certificate](#certificate)). On an IP with a self-signed certificate the browser doesn't register the service worker and doesn't offer installation.

## Deployment

Push to `master` → CI (format, lint, types, tests, build) → API image in GHCR → **waits for approval** → rollout to the server. Approval is configured through the GitHub Environment `production`: nothing reaches the server without a click.

There's deliberately no `prod` branch. The project has one developer, nobody merges into `master` in parallel, and a second branch would be a manual switch dressed as a branch — at risk of falling behind and turning "what's in production" into an investigation. If named releases are needed, tags are better: a tag is immutable, and a rollback is "deploy `v0.1.0`".

### Port 8443, not 443

On the server, 443 is taken by OpenVPN (`proto tcp`), and that's on purpose — the VPN is there to get around blocking. So the app lives on 8443 and 443 isn't touched at all: no sslh, no `port-share`, no risk of breaking working access.

Two consequences:

- **The port stays in the address.** Caddy listens on 80 and redirects to HTTPS, so the bare address still gets you where you need to go, but the browser shows `:8443`.
- **HSTS is off, and must be.** The header is remembered per host name and knows nothing about ports: after the first visit the browser would rewrite `http://host` to `https://host`, i.e. to 443, where the VPN is. Turn it back on only together with a move to 443 — there's a comment at that spot in the `Caddyfile`.

### Certificate

The app answers on `77-239-97-120.nip.io` — not a domain of ours but a service that resolves "IP with dashes" to that IP. It's needed because a bare IP can only have a self-signed certificate, and with one the browser treats the site as insecure: it doesn't register the service worker or offer installation. With a name, Caddy gets a normal Let's Encrypt certificate via HTTP-01 over the free port 80 — TLS-ALPN doesn't work here, it requires 443.

The cost: `nip.io` isn't on the [Public Suffix List](https://publicsuffix.org/), so for Let's Encrypt all its subdomains are one "registered domain" with a shared limit of 50 certificates a week across all users of the service. Issuance went through on the first try, but a renewal may hit someone else's traffic. If it does, the fix is switching to a PSL subdomain (`duckdns.org`, `freemyip.com`) or a real domain; four lines change in `/opt/moneymap/.env`, and Caddy does the rest.

### What a rollout does

[`scripts/deploy.sh`](scripts/deploy.sh), step by step:

1. Dumps the database to `/opt/moneymap/backups` — **before** migrations; the last 10 are kept.
2. Pulls the image by commit tag.
3. Runs migrations as a separate step, before the new API starts (§10.2).
4. Starts `api` and `caddy`, then the daily backup container (see below).
5. Waits for `healthy` from Docker itself — the `HEALTHCHECK` is defined in the image.
6. If migrations failed or the container didn't become healthy, rolls back to the previous image tag.

The frontend is built in CI and arrives ready: the server has one core, and a Vite build would take it from the running app. For the same reason the API image is built in CI, not on the server.

The script lives in the repository rather than inside the YAML, because a deployment is something you want to read in full before it touches the production database, and something you sometimes need to run by hand.

### Backups

Two kinds of dumps, both in `/opt/moneymap/backups` on the server:

| When           | Where                    | Kept    | Taken by                                                         |
| -------------- | ------------------------ | ------- | ---------------------------------------------------------------- |
| Before deploys | `backups/*.sql.gz`       | last 10 | [`scripts/deploy.sh`](scripts/deploy.sh)                         |
| Once a day     | `backups/daily/*.sql.gz` | last 14 | the `backup` container, [`scripts/backup.sh`](scripts/backup.sh) |

The daily dump is taken after 03:00 UTC (06:00 Moscow time). The container checks every ten minutes whether there's already a dump for today, so a restart or downtime at the scheduled hour doesn't lose the backup — it's taken at the first check afterwards. The hour and the number of dumps kept are set with `BACKUP_HOUR` and `BACKUP_KEEP` in `.env`.

A file appears under its real name only when complete: the dump is written to a temporary file, the archive is verified along with the line `pg_dump` writes only at the end of a finished dump, and only then is it renamed. A failed dump leaves a log entry and nothing on disk.

A one-off backup right now (on the server, from `/opt/moneymap`):

```bash
docker compose -f compose.prod.yml run --rm -e BACKUP_ONCE=1 backup
```

What the backups have been doing:

```bash
docker compose -f compose.prod.yml logs --tail 50 backup
```

Restoring — a dump is applied over the existing database with one command: it's taken with `--clean --if-exists` and drops what it recreates. Stop `api` first so nothing writes to the database mid-restore:

```bash
cd /opt/moneymap && set -a && . ./.env && set +a
docker compose -f compose.prod.yml stop api
gunzip -c backups/daily/daily-YYYYMMDD-HHMMSS.sql.gz \
  | docker compose -f compose.prod.yml exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1
docker compose -f compose.prod.yml start api
```

Verified locally: a dump restored into an empty database matched the source in users, accounts, transactions, sessions and the sum of all transactions.

**Backups stay on the server for now — a deliberate choice.** They protect against mistakes, a bad migration and corrupted data, but not against losing the server itself, since they share its disk. An off-server copy (S3-compatible storage, §10.2) is the next step once a place for it is chosen; the off-site job would just pick up the files from `backups/daily`.

### One-time setup

Already done on the server: the `/opt/moneymap` directory, `.env` with secrets (mode 600), a separate SSH key for CI with the `restrict` option, ports 80 and 8443 open in ufw, rsync installed.

In GitHub (Settings → Secrets and variables → Actions):

| Secret               | Value                     |
| -------------------- | ------------------------- |
| `DEPLOY_HOST`        | server address            |
| `DEPLOY_USER`        | `root`                    |
| `DEPLOY_SSH_KEY`     | the whole private key     |
| `DEPLOY_KNOWN_HOSTS` | a line from `ssh-keyscan` |

Plus the `production` Environment with a required reviewer — that's the approval button.

The host fingerprint comes from a secret rather than being accepted on first connect: `StrictHostKeyChecking=no` would accept a substituted server too, and the deployment carries secrets there.

**What this costs in security.** The key gives CI root on the server, so whoever gets access to the repository gets the server too. For a personal project that's a usual trade-off, but worth knowing.

## Phase 3

Recurring transactions: subscriptions, rent, salary. A rule is a template, not a schedule of what it already created: editing a rule doesn't touch what it produced, otherwise a subscription price change would rewrite a year of payments.

Two things generate, and the spec explains why two. The daily pg-boss job is only a trigger; the second one, catch-up generation on sign-in, is required: a server that was off at three in the morning would otherwise lose a charge forever. Running both is safe — uniqueness of `(rule_id, due_on)` makes generation idempotent at the database level, not by agreement between two code paths.

Occurrences live in their own table rather than in a `transactions.occurrence_date` column from the spec (see [Deviations](#deviations-from-the-spec)). Posting goes in this order: occurrence row → transaction → "posted" mark. A break in the middle leaves a pending occurrence that the next run finishes; the reverse order would leave a charge nobody made.

Dates are computed in the user's time zone — otherwise "the first of the month" arrives for some people on the 28th at eleven at night. Schedule arithmetic lives in the shared package with its own tests: short months, February 29, a rule that can never fire, and a years-old daily rule that must not be walked day by day.

A start date in the past means "the rule applies from that date", not "backfill a year of charges": a new rule's first occurrence is never before today. Upcoming charges are computed from rules and stored nowhere — they haven't happened yet, and a row about what "might happen" would be stale after the first edit.

## Phase 4

Balance reconciliation is the main quality check for the books: the person enters what the bank shows, the app shows the difference from its own calculation, and a difference means a transaction that wasn't recorded.

Both numbers are stored: the entered one and the computed one **at the time of entry**. The computed value is remembered rather than recalculated on read: a backdated transaction would change the calculation and erase the very discrepancy the record was made for.

A discrepancy can be closed in one action — with an ordinary transaction, not a special record. It should behave like an ordinary one: show up in the feed, the balance and the reports. A discrepancy means a forgotten transaction, and the honest way to close it is to record that transaction, even without details. Reconciling the same account on the same date again overwrites the record rather than adding a second one: two answers to "how much was on the account that day" isn't history, it's a contradiction.

The reconciliation reminder is a day of the month (or "the last day"), a time and channels: an in-app notification, an email. The job runs hourly rather than daily: the time is in the user's zone, and a daily run would only hit it for people whose zone matches the server's. A row is "claimed" with a conditional update before the email goes out: two processes waking up at once get one winning UPDATE between them. The reverse order — send first, mark later — would duplicate the reminder on any interruption, and a duplicate is worse than a miss here.

Notifications store only parameters; the interface builds the text in its own language. They're behind the bell in the header, with an unread counter.

## Phase 5

Reports answer four questions for a period: how much came in and went out, where it went, in which currencies, and which transactions were large. Amounts are converted to one currency at the rate **on the transaction date**: an expense in złoty last spring cost what it cost then, and revaluing it at today's rate would quietly rewrite a closed month.

### Charts

The report charts are drawn by hand — a donut, a stacked bar and grouped columns — and only the home page's balance-over-time chart uses Recharts, loaded lazily so it doesn't delay the first screen. Recharts weighs about as much as the rest of the app compressed; here the shapes are the cheap part of a chart, and the axes, ticks and tooltips took about two hundred lines. The deciding argument is theming: our colours are CSS variables with separately tuned light and dark steps, while a library wants hex props, and every theme switch would have to go through React instead of the cascade.

Expenses by category and by currency are donuts: they answer "what was the month made of" at a glance, and every legend row carries its amount and percentage, so precision isn't lost. Every category gets its own segment; the first eight use palette colours and the rest a neutral grey rather than a generated ninth hue. Cash flow is grouped columns on one shared scale, showing at least the last six months: a second axis would turn comparison into a game with scale. Totals are tiles, not single-column charts.

The series palette is validated rather than picked by eye: both light and dark steps pass checks for lightness band, chroma, separation of adjacent pairs under colour blindness, and contrast against our surfaces. The dark theme has its own steps, not lightened light ones.

### Budgets

A budget is a monthly limit either for a category or for a whole account, and it's permanent — the month is part of the calculation, not of storage: "six hundred for groceries" is a decision, not monthly work. Unspent rollover is taken only from a month in which the limit already existed, and only one month back: zero spent before the limit existed isn't savings, and a year's worth of remainders is no longer a budget but a second account.

### Import and export

The export is the same rows as the report. Fields starting with `=`, `+` or `@` get an apostrophe so a spreadsheet doesn't execute someone's note as a formula; numbers are exempt from this rule, otherwise every negative amount would arrive as text.

The import reads a bank statement: the delimiter and date format are detected, column mapping is suggested from headers and edited by the person before anything is written. Importing the same file again duplicates nothing — each row gets a fingerprint from account, date, amount and description, and a unique index guards against duplicates rather than a comparison in the app. CSV parsing is our own: the format is described in RFC 4180 in a page and a half, and the part we need fit in thirty lines.

### Currency converter

A converter for fiat and crypto in the header, next to the bell. Both fields are equal: type in either and the other is computed instantly — the pair's rate is fetched once, and multiplication happens on the client with the same `convert()` the server uses. Commas and dots are accepted in either role, and thousands are always grouped with a space, so whatever the converter prints parses back to the same number in any interface language.

## Design

The interface uses the "graphite" theme: a near-black background, surfaces half a step above it, almost no borders, and lime only as an accent — the primary button, the active section icon, chart lines. Lists are single surfaces with hairline rows; a row opens its item, and rare actions (edit, archive, delete) live inside that dialog. Fields are filled rather than underlined, and where the browser supports it (Chrome and Edge 135+, `appearance: base-select`) select dropdowns and checkboxes are styled too. The light theme is the same system with neutral greys and a darker accent for lines and icons.

## Icons

[lucide](https://lucide.dev) — a maintained fork of Feather, in whose style the interface was already drawn.

The project knows about the library in one file — `apps/web/src/shared/ui/Icon/icons.ts`. It holds an explicit map "our name → component", and components write `<Icon name="eye" />`.

The map is explicit rather than `import * as icons` for two reasons. Only what's listed ends up in the bundle. And category icons are stored by name in the database; the name stays ours, so a renamed icon in the library is fixed here, not with a migration of user data.

OS logos on the devices page aren't in lucide (it has no brand icons). Apple, Android, Linux and Chrome paths are copied from [Simple Icons](https://simpleicons.org) (CC0) into `entities/session/lib/os-logos.ts`; Windows isn't in Simple Icons and is drawn as four squares.

## Languages

The interface is in Russian and English. The language and theme switches are in the profile; on the sign-in and sign-up pages they stay visible in the corner, because a signed-out person has no settings and can land on an unfamiliar language.

The choice is remembered in `localStorage`, not in the profile: it's a property of the device, not the person — a phone in the dark theme and a work computer in the light one is normal, and one value per account would overwrite one with the other. On the first visit the language comes from the browser.

Dictionaries — one file per language:

```
packages/shared/src/i18n/locales/ru.json
packages/shared/src/i18n/locales/en.json
```

They live in the shared package rather than the frontend because both sides use them: validation messages are born in zod schemas, and the same "At least 8 characters" is shown by the form before submit and by the API after. Inside the app, messages travel as keys; the text appears on the server by `Accept-Language` and on the client by the selected language.

To add a language, put a third JSON next to these and add its code to `LOCALES`. A test in `packages/shared` fails if a dictionary is missing a key, has an empty string or mismatched placeholders.

## Deviations from the spec

Made deliberately, open to discussion:

1. **Styles written from scratch rather than ported.** §3.2 and §14 assumed porting `adaptiveValue`, `null.scss` and mixins from the prototype. Instead there's our own system: a `fluid()` function instead of the `adaptiveValue` mixin, our own reset, CSS Modules, tokens in CSS variables, cascade layers. Reasons — in [docs/styles.md](docs/styles.md).

2. **Sessions split into two tables.** §7 describes one `sessions` table with `refresh_token_hash` and `replaced_by`. Here `sessions` (the device) and `refresh_tokens` (issued tokens) are separate: otherwise "revoke a device" requires walking the rotation chain, and the active devices list requires filtering its heads. The semantics of §6.3 are fully preserved.

3. **A `user_tokens` table was added.** §9 requires email verification and password reset endpoints, and the phase 0 table list has nothing to carry them.

4. **Sign-up reports a taken email.** The non-enumeration requirement of §6.5 is implemented for sign-in (same response and timing). Hiding that an address is taken on sign-up would break its main scenario; `/forgot-password` always answers the same.

5. **Refresh-token rotation has a 10-second window** in which a repeated presentation counts as a network retry, not theft. Without it any retried request would sign the user out. The client also serialises refreshes into a single stream.

6. **Onboarding instead of fields on sign-up.** §8.1 originally asked for the base currency and time zone right on the sign-up form. They moved to a modal over the home page after the first sign-in, and the spec was updated accordingly. Sign-up kept three fields: name, email, password.

7. **Recurring occurrences are a separate table.** §7 puts generation idempotency on `transactions (recurring_rule_id, occurrence_date)`. Here there's `recurring_occurrences` for that: an occurrence has states a transaction doesn't. A pending one isn't a charge yet, and a declined one must stay declined, otherwise catch-up generation would offer it again tomorrow. Splitting the record of one occurrence across two tables would give two answers to "did it happen".

8. **Minimum password length is 8, not 10.** §6.5 originally required ten. Eight was chosen as the lower bound compatible with the breach check: at six characters practically any password a person comes up with is already in the dumps, and the form would reject almost everything it promised to accept.

9. **Categories are a fixed catalog.** The spec treated categories as user data; here the set is defined in code and identical for everyone, so names follow the interface language and there's no editing.

## What's verified and what isn't

Passing: `typecheck`, `lint`, `format:check`, `vitest` (93 tests), production build of the API and the frontend.

Checked by hand against a live database (Postgres 17 in Docker): sign-up, sign-in, refresh-token rotation, reuse detection with session revocation, the devices list and revocation, sign-out everywhere, password change and reset, email verification, rate limiting, data isolation between users, onboarding and both route guards; daily backup, restore, rotation and the failure path.

**Not verified:** there are still no automated integration tests on a real Postgres (testcontainers) — everything above was checked by hand.
