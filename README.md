# CareUnfold

Increment A is a persistent account and household application. It covers account creation, email verification, email/password sign-in, optional Google sign-in, family setup, patient access controls, optional typed coverage, and resumable onboarding.

Bills, explanations of benefits, document reading, provider messages, and payment reconciliation are not in this version. Screens do not offer those actions.

## Requirements

- Node.js 22 or newer
- npm
- PostgreSQL 17, or the built-in local PGlite fallback

This project was built with Next.js 16.4, React 19.3, TypeScript 5.9, Drizzle ORM 0.45, postgres.js 3.4, Zod 4.6, Better Auth 1.7, and Vitest 5. Better Auth owns password hashing. The app stores the account profile and the provider identity reference.

## Install

```bash
npm install
cp .env.example .env.local
openssl rand -base64 32
```

Put the generated value in `BETTER_AUTH_SECRET` in `.env.local`. An empty or short secret stops the server from starting.

## Database

PostgreSQL:

```bash
docker compose up -d
npm run db:migrate
```

`docker-compose.yml` starts Postgres 17 with database, user, and password `careunfold` on port 5432. That matches the `DATABASE_URL` in `.env.example`.

If Docker is not available, use PGlite in `.env.local`:

```bash
DATABASE_URL=pglite:./.data/pglite
```

Then run the same migration command:

```bash
npm run db:migrate
```

## Check, test, and run

```bash
npm run doctor
npm test
npm run typecheck
npm run dev
```

Open http://localhost:3000.

`npm run doctor` checks that the database answers and reports whether Google and email delivery are configured. It does not sign anyone in.

Automated tests use an in-memory PGlite database and an in-memory mailbox. They do not read `.env.local`.

## Email

`EMAIL_DELIVERY=dev-sink` stores verification, reset, and invitation messages at http://localhost:3000/dev/outbox. Those messages are not delivered to an inbox. This mode is refused when `NODE_ENV=production`.

To send real mail, create a Resend API key and set:

```bash
RESEND_API_KEY=
EMAIL_FROM=CareUnfold <you@your-domain>
EMAIL_DELIVERY=
```

Leave `EMAIL_DELIVERY` empty when both Resend values are set. The app then uses Resend. If they are missing, sign-up still responds, and the screen says delivery is not configured. It does not pretend a message was sent.

## Google

Google sign-up and sign-in use Google's OAuth 2.0 and OpenID Connect sign-in with the `openid`, `email`, and `profile` scopes. No other Google API needs to be enabled.

1. Open https://console.cloud.google.com and create or choose a project.
2. Go to Google Auth Platform, then Branding. Set the app name and support email.
3. Under Audience, choose External. While the app is in Testing, add each Google account that will sign in as a test user.
4. Under Clients, create an OAuth client with application type Web application.
5. Add this authorized JavaScript origin:

```text
http://localhost:3000
```

6. Add this authorized redirect URI:

```text
http://localhost:3000/api/auth/callback/google
```

Put the client id and secret in `.env.local`:

```bash
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

Restart the server. Both values are required. If either is missing, Google is not registered and the sign-in page explains that. Canceling Google consent returns to sign-in without a session. A successful Google sign-in only happens after those credentials are real.

Linking Google to an existing account is available from Settings while you are signed in. Accounts are not linked just because the email matches.

## Synthetic fixture

Set `SYNTHETIC_FIXTURE_PASSWORD` in `.env.local` to at least 12 characters, then:

```bash
npm run db:seed:synthetic
```

This creates `fixture.owner@example.test` and `fixture.adult@example.test`, marks the household as a synthetic fixture, and leaves the adult invitation unsent. Sign in yourself. The command does not create a session. It refuses to run when `NODE_ENV=production`.

## Access approval

Set `ADMIN_EMAIL` in `.env.local` to the Google or email address that should run Admin. That account is approved automatically. Every other account is stored as pending after Google sign-in or email verification.

Open `/app/admin` to approve or deny access. Pending accounts can sign in, but they cannot open onboarding or the workspace until you approve them.

## What a new account does

1. Create an account. The response does not say whether the email was already registered.
2. Open the verification message and use the link. Sign-in stays closed until then.
3. Wait for administrator approval. The workspace stays closed until then.
4. Save your name and who the account is for.
5. Add people. An adult invitation stays a draft until you press Send invitation.
6. Skip or save coverage. Member IDs are masked in lists.
7. Confirm. You can leave and return; the next incomplete step opens again.

Household membership lets someone administer the household. It does not grant access to a person's protected records. Representative authority for a minor or dependent adult stays pending. This version has no approval action for that review.

## Not in this version

- Document upload, extraction, or AI
- Messages to providers or insurers
- Balances, payments, or reconciliation
- Public deployment
