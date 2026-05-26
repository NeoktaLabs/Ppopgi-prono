# Live scores and live leaderboard

The frontend never calls the football provider directly. Cloudflare cron/sync updates D1, and the frontend polls the app API.

## Flow

1. The provider sync updates match status, live score, live minute and final scores in D1.
2. The league home endpoint reads from D1 only.
3. If at least one match is live, the endpoint returns a provisional live leaderboard.
4. If no match is live, it returns the official leaderboard with movement since the latest pre-match snapshot.

## Endpoint

```http
GET /api/leagues/:leagueId/home
```

The response includes:

- `mode`: `live` or `official`
- `leaderboard`: ranks, points and rank delta
- `matches`: today’s matches, live score and visible predictions after kickoff
- `poll_seconds`: frontend polling interval hint

## Provider protection

`scheduledSync()` checks D1 before calling the provider. It only calls the provider when a match is live, near kickoff, or when the schedule still needs a daily refresh.

Users can poll our API frequently without increasing provider API usage.
