import type { Env } from "./types";
import { requestMagicLink, verifyMagicLink, logout, verifyGatewayTurnstile, devLogin } from "./auth";
import { badRequest, json } from "./utils";
import {
  createLeague,
  globalLeaderboard,
  globalUserPredictions,
  joinLeague,
  leaderboard,
  listMatches,
  matchPredictions,
  me,
  myPredictions,
  removeLeagueMember,
  todayMatches,
  updateProfile,
  upsertPrediction,
} from "./api";
import {
  getLeagueSettings,
  regenerateLeagueCode,
  transferLeagueAdmin,
  updateLeagueSettings,
} from "./league-admin";
import {
  clearGlobalManualScore,
  deleteGlobalLeague,
  listGlobalLeagues,
  recalculateAllGlobalScores,
  recalculateGlobalMatch,
  requireGlobalAdmin,
  setGlobalManualScore,
} from "./global-admin";
import { leagueHome } from "./live";
import { scheduledSync, syncWorldCupMatches } from "./sync";
import { debugAiFixtureData, fixtureAiInsight, hydrateAiFootballData, scheduledAiInsightRefresh } from "./ai";

function routeParams(pathname: string, pattern: RegExp) {
  const match = pathname.match(pattern);
  return match ? match.slice(1).map(decodeURIComponent) : null;
}

async function handleApi(request: Request, env: Env) {
  const url = new URL(request.url);
  const { pathname } = url;

  if (request.method === "GET" && pathname === "/api/config") return json({ turnstileSiteKey: env.TURNSTILE_SITE_KEY || null });
  if (request.method === "GET" && pathname === "/api/dev/login") return devLogin(request, env);

  if (request.method === "POST" && pathname === "/api/turnstile/gateway-verify") return verifyGatewayTurnstile(request, env);
  if (request.method === "POST" && pathname === "/api/auth/request-link") return requestMagicLink(request, env);
  if (request.method === "GET" && pathname === "/api/auth/verify") return verifyMagicLink(request, env);
  if (request.method === "POST" && pathname === "/api/auth/logout") return logout(request, env);
  if (request.method === "GET" && pathname === "/api/auth/me") return me(request, env);
  if (request.method === "PATCH" && pathname === "/api/me/profile") return updateProfile(request, env);

  if (request.method === "POST" && pathname === "/api/leagues") return createLeague(request, env);
  if (request.method === "POST" && pathname === "/api/leagues/join") return joinLeague(request, env);
  if (request.method === "GET" && pathname === "/api/global/leaderboard") return globalLeaderboard(request, env);

  const globalUserPredictionParams = routeParams(pathname, /^\/api\/global\/users\/([^/]+)\/predictions$/);
  if (request.method === "GET" && globalUserPredictionParams) return globalUserPredictions(request, env, globalUserPredictionParams[0]);

  const leagueHomeParams = routeParams(pathname, /^\/api\/leagues\/([^/]+)\/home$/);
  if (request.method === "GET" && leagueHomeParams) return leagueHome(request, env, leagueHomeParams[0]);

  const leagueSettingsParams = routeParams(pathname, /^\/api\/leagues\/([^/]+)\/settings$/);
  if (request.method === "GET" && leagueSettingsParams) return getLeagueSettings(request, env, leagueSettingsParams[0]);
  if (request.method === "PATCH" && leagueSettingsParams) return updateLeagueSettings(request, env, leagueSettingsParams[0]);

  const regenerateCodeParams = routeParams(pathname, /^\/api\/leagues\/([^/]+)\/regenerate-code$/);
  if (request.method === "POST" && regenerateCodeParams) return regenerateLeagueCode(request, env, regenerateCodeParams[0]);

  const transferAdminParams = routeParams(pathname, /^\/api\/leagues\/([^/]+)\/transfer-admin$/);
  if (request.method === "POST" && transferAdminParams) return transferLeagueAdmin(request, env, transferAdminParams[0]);

  const leaderboardParams = routeParams(pathname, /^\/api\/leagues\/([^/]+)\/leaderboard$/);
  if (request.method === "GET" && leaderboardParams) return leaderboard(request, env, leaderboardParams[0]);

  const myPredictionParams = routeParams(pathname, /^\/api\/leagues\/([^/]+)\/predictions\/me$/);
  if (request.method === "GET" && myPredictionParams) return myPredictions(request, env, myPredictionParams[0]);

  const predictionParams = routeParams(pathname, /^\/api\/leagues\/([^/]+)\/predictions$/);
  if (request.method === "POST" && predictionParams) return upsertPrediction(request, env, predictionParams[0]);

  const matchPredictionParams = routeParams(pathname, /^\/api\/leagues\/([^/]+)\/matches\/([^/]+)\/predictions$/);
  if (request.method === "GET" && matchPredictionParams) return matchPredictions(request, env, matchPredictionParams[0], matchPredictionParams[1]);

  const aiInsightParams = routeParams(pathname, /^\/api\/matches\/([^/]+)\/ai-insight$/);
  if (request.method === "GET" && aiInsightParams) return fixtureAiInsight(request, env, aiInsightParams[0]);

  const aiDebugParams = routeParams(pathname, /^\/api\/admin\/debug\/matches\/([^/]+)\/ai-data$/);
  if (request.method === "GET" && aiDebugParams) {
    const admin = await requireGlobalAdmin(request, env);
    if (admin.error) return admin.error;
    return debugAiFixtureData(env, aiDebugParams[0]);
  }

  if (request.method === "POST" && pathname === "/api/admin/ai/hydrate") {
    const admin = await requireGlobalAdmin(request, env);
    if (admin.error) return admin.error;
    return hydrateAiFootballData(request, env);
  }

  const removeMemberParams = routeParams(pathname, /^\/api\/leagues\/([^/]+)\/members\/([^/]+)$/);
  if (request.method === "DELETE" && removeMemberParams) return removeLeagueMember(request, env, removeMemberParams[0], removeMemberParams[1]);

  if (request.method === "GET" && pathname === "/api/worldcup/matches") return listMatches(env);
  if (request.method === "GET" && pathname === "/api/worldcup/today") return todayMatches(env);
  if (request.method === "GET" && pathname === "/api/predictions/me") return myPredictions(request, env);
  if (request.method === "POST" && pathname === "/api/predictions") return upsertPrediction(request, env);

  const globalManualScoreParams = routeParams(pathname, /^\/api\/admin\/matches\/([^/]+)\/manual-score$/);
  if (globalManualScoreParams) {
    if (request.method === "POST") return setGlobalManualScore(request, env, globalManualScoreParams[0]);
    if (request.method === "DELETE") return clearGlobalManualScore(request, env, globalManualScoreParams[0]);
  }

  const globalRecalculateMatchParams = routeParams(pathname, /^\/api\/admin\/matches\/([^/]+)\/recalculate$/);
  if (request.method === "POST" && globalRecalculateMatchParams) return recalculateGlobalMatch(request, env, globalRecalculateMatchParams[0]);

  if (request.method === "POST" && pathname === "/api/admin/recalculate") return recalculateAllGlobalScores(request, env);

  if (request.method === "GET" && pathname === "/api/admin/leagues") return listGlobalLeagues(request, env);

  const globalLeagueParams = routeParams(pathname, /^\/api\/admin\/leagues\/([^/]+)$/);
  if (request.method === "DELETE" && globalLeagueParams) return deleteGlobalLeague(request, env, globalLeagueParams[0]);

  if (pathname === "/api/admin/sync/matches") {
    if (request.method === "GET") {
      return json({
        ok: false,
        message: "This endpoint triggers a match sync and must be called with POST while logged in as a global admin.",
        method: "POST",
        curl: `curl -X POST ${url.origin}/api/admin/sync/matches --cookie "session=YOUR_SESSION_COOKIE"`,
      }, { status: 405 });
    }

    if (request.method === "POST") {
      const admin = await requireGlobalAdmin(request, env);
      if (admin.error) return admin.error;

      await syncWorldCupMatches(env);
      return json({ ok: true });
    }
  }

  return badRequest("Route not found.", 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handleApi(request, env);
    return env.ASSETS.fetch(request);
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    if (event.cron === "0 */6 * * *") {
      ctx.waitUntil(scheduledAiInsightRefresh(env));
      return;
    }
    ctx.waitUntil(scheduledSync(env));
  },
};
