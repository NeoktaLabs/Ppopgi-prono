# Live scores and live leaderboard

The frontend never calls the football provider directly. Cloudflare cron/sync updates D1, and the frontend polls the app API.

## Flow

1. The provider sync updates match status, live score, live minute and final scores in D1.
2. The league home endpoint reads from D1 only.
3. If at least one match is live, the endpoint returns a provisional live leaderboard.
4. If no match is live, it returns the official leaderboard with movement since the latest finalized batch of matches.

## Multiple live matches

The live leaderboard is calculated from all currently live matches at the same time.

Example: if France-Brazil and Switzerland-Germany are both live, the app does not compute two separate rank deltas. It starts from the official leaderboard, adds provisional points from both live matches, sorts the combined table once, then computes each player's live rank movement.

## Multiple matches finishing together

When several matches finish during the same sync/recalculation pass, they are treated as one leaderboard event.

The app stores a `pre_batch` snapshot using a `snapshot_key` made from the finalized match IDs. The post-match movement then compares the current official table to that batch snapshot, so movement reflects the whole set of results that just became final rather than one arbitrary match.

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
