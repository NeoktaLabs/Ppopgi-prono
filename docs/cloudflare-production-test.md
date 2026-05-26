# Cloudflare production-like test setup

This app is intended to be tested on Cloudflare Workers with D1, Cloudflare Email Service and a football provider.

## 1. Create D1

```bash
npx wrangler d1 create ppopgi-prono
```

Copy the returned database id into `wrangler.jsonc` in `d1_databases[0].database_id`.

Apply migrations remotely:

```bash
npx wrangler d1 migrations apply PPOP_PRONO_DB --remote
```

## 2. Configure secrets and vars

Set the football API key as a secret:

```bash
npx wrangler secret put FOOTBALL_API_KEY
```

For API-Football/API-Sports, set:

```json
"FOOTBALL_PROVIDER": "api-football",
"FOOTBALL_API_BASE_URL": "https://v3.football.api-sports.io",
"FOOTBALL_API_LEAGUE_ID": "1",
"FOOTBALL_API_SEASON": "2026"
```

Confirm the league id and season with your provider account before relying on production data.

Update:

```json
"APP_URL": "https://YOUR_DEPLOYED_DOMAIN",
"GLOBAL_ADMIN_EMAILS": "your-email@example.com",
"EMAIL_FROM": "Ppopgi Prono <no-reply@your-domain.com>",
"EMAIL_REPLY_TO": "your-email@example.com"
```

## 3. Configure Cloudflare Email Service

Configure a Cloudflare Email Service binding named `EMAIL` in Cloudflare and make sure the sender domain/address used by `EMAIL_FROM` is allowed.

The app sends magic links with:

```ts
env.EMAIL.send({ from, to, replyTo, subject, text })
```

## 4. Deploy

```bash
npm run deploy
```

## 5. Run first sync

After deploying, sign in as a global admin, then call:

```bash
curl -X POST https://YOUR_DEPLOYED_DOMAIN/api/admin/sync/matches \
  --cookie "session=YOUR_SESSION_COOKIE"
```

The cron will keep syncing afterward based on match timing.

## 6. Test checklist

- Request a magic link and receive it by email.
- Create your profile nickname.
- Create a league and copy the league code.
- Sign in with a second user and join the league.
- Trigger or wait for match sync.
- Confirm live matches show live score and pulse.
- Confirm predictions become visible after kickoff.
- Confirm live leaderboard movement arrows update.
- Confirm global admin manual score override recalculates all leagues.
