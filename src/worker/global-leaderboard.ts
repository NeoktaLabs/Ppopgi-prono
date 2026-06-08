import type { Env } from "./types";
import { nowIso } from "./utils";
import { oddzzAiLeaderboardRow, rankLeaderboardRows, type LeaderboardLikeRow } from "./ai-leaderboard";

export type GlobalLeaderboardRow = LeaderboardLikeRow;

export async function buildGlobalLeaderboard(env: Env, includeLive = false): Promise<GlobalLeaderboardRow[]> {
  const rows = await env.DB.prepare(`
    WITH global_predictions AS (
      SELECT user_id, match_id, MAX(points) as points, MAX(is_exact) as is_exact, MAX(is_correct_result) as is_correct_result, MAX(bonus_used) as bonus_used
      FROM predictions
      GROUP BY user_id, match_id
    )
    SELECT users.id as user_id, users.nickname, COALESCE(SUM(global_predictions.points), 0) as points, COALESCE(SUM(global_predictions.is_exact), 0) as exact_scores, COALESCE(SUM(global_predictions.is_correct_result), 0) as correct_results, COUNT(global_predictions.match_id) as predictions_count, MAX(0, 2 - COALESCE(SUM(CASE WHEN global_predictions.bonus_used = 1 AND LOWER(COALESCE(matches.stage, '')) LIKE '%group%' AND (matches.status IN ('live', 'in_play', 'LIVE', '1H', '2H', 'HT', 'ET', 'BT', 'penalties', 'extra_time') OR matches.kickoff_at <= ? OR matches.final_home IS NOT NULL OR matches.manual_final_home IS NOT NULL) THEN 1 ELSE 0 END), 0)) as bonuses_remaining
    FROM users
    LEFT JOIN global_predictions ON global_predictions.user_id = users.id
    LEFT JOIN matches ON matches.id = global_predictions.match_id
    GROUP BY users.id
  `).bind(nowIso()).all();

  const aiRow = await oddzzAiLeaderboardRow(env, includeLive);
  const leaderboardRows = [
    ...(rows.results ?? []).map((row) => ({
      user_id: String((row as any).user_id),
      nickname: (row as any).nickname ?? null,
      points: Number((row as any).points ?? 0),
      exact_scores: Number((row as any).exact_scores ?? 0),
      correct_results: Number((row as any).correct_results ?? 0),
      predictions_count: Number((row as any).predictions_count ?? 0),
      bonuses_remaining: Number((row as any).bonuses_remaining ?? 0),
    })),
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
