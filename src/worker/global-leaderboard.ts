import type { Env } from "./types";
import { oddzzAiLeaderboardRow, rankLeaderboardRows, type LeaderboardLikeRow } from "./ai-leaderboard";
import { buildComputedLeaderboardRows } from "./leaderboard-aggregation";

export type GlobalLeaderboardRow = LeaderboardLikeRow;

export async function buildGlobalLeaderboard(env: Env, includeLive = false): Promise<GlobalLeaderboardRow[]> {
  const aiRow = await oddzzAiLeaderboardRow(env, includeLive);
  const leaderboardRows = [
    ...(await buildComputedLeaderboardRows(env, { includeLive })),
    ...(aiRow ? [aiRow] : []),
  ];

  return rankLeaderboardRows(leaderboardRows);
}

async function latestGlobalPreBatchSnapshot(env: Env) {
  const latest = await env.DB.prepare(`
    SELECT snapshot_key, created_at
    FROM global_leaderboard_snapshots
    WHERE snapshot_type = 'pre_batch' AND snapshot_key IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 1
  `).first<{ snapshot_key: string; created_at: string }>();

  if (!latest) return null;

  const rows = await env.DB.prepare(`
    SELECT user_id, rank
    FROM global_leaderboard_snapshots
    WHERE snapshot_key = ? AND snapshot_type = 'pre_batch'
  `).bind(latest.snapshot_key).all<{ user_id: string; rank: number }>();

  return new Map((rows.results ?? []).map((row) => [row.user_id, row.rank]));
}

export async function withGlobalLastMatchDeltas(env: Env, leaderboard: GlobalLeaderboardRow[]) {
  const previousRanks = await latestGlobalPreBatchSnapshot(env);

  return leaderboard.map((row) => {
    const previousRank = previousRanks?.get(row.user_id) ?? row.rank;
    return {
      ...row,
      official_rank: previousRank,
      rank_delta: previousRank - row.rank,
      movement_type: "last_match" as const,
    };
  });
}

export async function saveGlobalPreMatchSnapshotsForMatches(env: Env, matchIds: string[]) {
  if (matchIds.length === 0) return;

  const snapshotKey = matchIds.slice().sort().join("+");
  const exists = await env.DB.prepare(`
    SELECT id FROM global_leaderboard_snapshots
    WHERE snapshot_key = ? AND snapshot_type = 'pre_batch'
    LIMIT 1
  `).bind(snapshotKey).first();
  if (exists) return;

  const board = await buildGlobalLeaderboard(env);
  for (const row of board) {
    await env.DB.prepare(`
      INSERT INTO global_leaderboard_snapshots (id, match_id, user_id, rank, points, exact_scores, correct_results, predictions_count, snapshot_type, snapshot_key, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pre_batch', ?, datetime('now'))
    `).bind(crypto.randomUUID(), matchIds[0], row.user_id, row.rank, row.points, row.exact_scores, row.correct_results, row.predictions_count, snapshotKey).run();
  }
}

export async function saveGlobalPreMatchSnapshotsForMatch(env: Env, matchId: string) {
  await saveGlobalPreMatchSnapshotsForMatches(env, [matchId]);
}
