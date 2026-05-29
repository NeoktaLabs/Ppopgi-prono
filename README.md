# Oddzz

Mobile and Desktop World Cup prediction web app.

## Stack

- React + Vite
- Cloudflare Workers (variables stored in wrangler.jsonc config file)
- Cloudflare D1
- Cloudflare Cron Triggers
- Cloudflare Email Service / email binding
- GitHub deployment

## V1 features

- Magic link email authentication
- Long-lived session via HttpOnly cookie
- Create and join leagues with a required league code
- One admin per league
- League admins can remove players
- League admins can rename the league, open/close registrations, transfer admin ownership, and regenerate the league code
- Predictions are locked at kickoff
- Other players’ predictions are hidden before kickoff and visible once the match starts
- Scores can be automated via cron
- Global admins can manually set scores if the API is delayed or wrong
- Manual score overrides take priority over API scores and apply to all leagues
- Global score recalculation applies to all leagues
- Manual overrides can be cleared to return to API scores
- Scores are based on the result after extra time when applicable; penalty shootouts are ignored
- Multipliers: group stage x1, round of 16 x2, quarter-finals x3, semi-finals/third-place match x4, final x5
- Leaderboard, player history, advanced stats

## Local setup

```bash
npm install
npm run dev
```

Create a D1 database and replace `REPLACE_WITH_D1_DATABASE_ID` in `wrangler.jsonc`, then run:

```bash
npm run db:migrate:local
```

## Permission model

Regular users can manage their profile, join leagues, create leagues, and submit predictions.

League admins cannot edit fixtures, scores, sync jobs, point rules, or global recalculation.

Global admins manage tournament-wide data only. Global admin access is controlled by `GLOBAL_ADMIN_EMAILS` in `wrangler.jsonc` or your Cloudflare environment variables.

## Global score administration

Match results are global for the whole app. Editing a score or recalculating points applies to every league, because all leagues use the same World Cup matches and results.

API scores remain the default source. A global admin can override a match score to speed up scoring or correct an API issue

Manual override always wins for point calculation. 

Both actions recalculate predictions for the match immediately across all leagues.


## Notes

The football provider is currently stubbed in `src/worker/sync.ts`. Replace `fetchProviderMatches()` with API-Football or football-data.org mapping once the provider/API key is selected.
