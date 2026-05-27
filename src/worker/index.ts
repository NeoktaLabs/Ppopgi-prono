import type { Env } from "./types";
import { requestMagicLink, verifyMagicLink, logout } from "./auth";
import { badRequest, json } from "./utils";
import {
  createLeague,
  joinLeague,
  leaderboard,
  listMatches,
  matchPredictions,
  me,
  removeLeagueMember,
  todayMatches,
  updateProfile,
  upsertPrediction,
} from "./api";
import {
  regenerateLeagueCode,
  transferLeagueAdmin,
  updateLeagueSettings,
} from "./league-admin";
import {
  clearGlobalManualScore,
  recalculateAllGlobalScores,
  recalculateGlobalMatch,
  setGlobalManualScore,
} from "./global-admin";
import { leagueHome } from "./live";
import { scheduledSync, syncWorldCupMatches } from "./sync";

function routeParams(pathname: string, pattern: RegExp) {
  const match = pathname.match(pattern);
  return match ? match.slice(1).map(decodeURIComponent) : null;
}

async function handleApi(request: Request, env: Env) {
  const url = new URL(request.url);
  const { pathname } = url;

  if (request.method === "GET" && pathname === "/api/config") return json({ turnstileSiteKey: env.TURNSTILE_SITE_KEY || null });

  if (request.method === "POST" && pathname === "/api/auth/request-link") return requestMagicLink(request, env);
  if (request.method === "GET" && pathname === "/api/auth/verify") return verifyMagicLink(request, env);
  if (request.method === "POST" && pathname === "/api/auth/logout") return logout(request, env);
  if (request.method === "GET" && pathname === "/api/auth/me") return me(request, env);
  if (request.method === "PATCH" && pathname === "/api/me/profile") return updateProfile(request, env);

  if (request.method === "POST" && pathname === "/api/leagues") return createLeague(request, env);
  if (request.method === "POST" && pathname === "/api/leagues/join") return joinLeague(request, env);

  const leagueHomeParams = routeParams(pathname, /^\/api\/leagues\/([^/]+)\/home$/);
  if (request.method === "GET" && leagueHomeParams) return leagueHome(request, env, leagueHomeParams[0]);

  const leagueSettingsParams = routeParams(pathname, /^\/api\/leagues\/([^/]+)\/settings$/);
  if (request.method === "PATCH" && leagueSettingsParams) return updateLeagueSettings(request, env, leagueSettingsParams[0]);

  const regenerateCodeParams = routeParams(pathname, /^\/api\/leagues\/([^/]+)\/regenerate-code$/);
  if (request.method === "POST" && regenerateCodeParams) return regenerateLeagueCode(request, env, regenerateCodeParams[0]);

  const transferAdminParams = routeParams(pathname, /^\/api\/leagues\/([^/]+)\/transfer-admin$/);
  if (request.method === "POST" && transferAdminParams) return transferLeagueAdmin(request, env, transferAdminParams[0]);

  const leaderboardParams = routeParams(pathname, /^\/api\/leagues\/([^/]+)\/leaderboard$/);
  if (request.method === "GET" && leaderboardParams) return leaderboard(request, env, leaderboardParams[0]);

  const predictionParams = routeParams(pathname, /^\/api\/leagues\/([^/]+)\/predictions$/);
  if (request.method === "POST" && predictionParams) return upsertPrediction(request, env, predictionParams[0]);

  const matchPredictionParams = routeParams(pathname, /^\/api\/leagues\/([^/]+)\/matches\/([^/]+)\/predictions$/);
  if (request.method === "GET" && matchPredictionParams) return matchPredictions(request, env, matchPredictionParams[0], matchPredictionParams[1]);

  const removeMemberParams = routeParams(pathname, /^\/api\/leagues\/([^/]+)\/members\/([^/]+)$/);
  if (request.method === "DELETE" && removeMemberParams) return removeLeagueMember(request, env, removeMemberParams[0], removeMemberParams[1]);

  if (request.method === "GET" && pathname === "/api/worldcup/matches") return listMatches(env);
  if (request.method === "GET" && pathname === "/api/worldcup/today") return todayMatches(env);

  const globalManualScoreParams = routeParams(pathname, /^\/api\/admin\/matches\/([^/]+)\/manual-score$/);
  if (globalManualScoreParams) {
    if (request.method === "POST") return setGlobalManualScore(request, env, globalManualScoreParams[0]);
    if (request.method === "DELETE") return clearGlobalManualScore(request, env, globalManualScoreParams[0]);
  }

  const globalRecalculateMatchParams = routeParams(pathname, /^\/api\/admin\/matches\/([^/]+)\/recalculate$/);
  if (request.method === "POST" && globalRecalculateMatchParams) return recalculateGlobalMatch(request, env, globalRecalculateMatchParams[0]);

  if (request.method === "POST" && pathname === "/api/admin/recalculate") return recalculateAllGlobalScores(request, env);

  if (request.method === "POST" && pathname === "/api/admin/sync/matches") {
    await syncWorldCupMatches(env);
    return json({ ok: true });
  }

  return badRequest("Route not found.", 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handleApi(request, env);
    return env.ASSETS.fetch(request);
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(scheduledSync(env));
  },
};
