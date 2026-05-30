export type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_NAME: string;
  APP_URL: string;
  SESSION_DAYS: string;
  MAGIC_LINK_MINUTES: string;
  LEAGUE_CODE_LENGTH: string;
  FOOTBALL_PROVIDER: string;
  GLOBAL_ADMIN_EMAILS: string;
  EMAIL_FROM: string;
  EMAIL_FROM_NAME?: string;
  EMAIL_REPLY_TO?: string;
  RESEND_API_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  DEV_AUTH_BYPASS?: string;
  FOOTBALL_API_KEY?: string;
  FOOTBALL_API_BASE_URL?: string;
  FOOTBALL_API_LEAGUE_ID?: string;
  FOOTBALL_API_SEASON?: string;
};

export type User = {
  id: string;
  email: string;
  nickname: string | null;
};

export type MatchRow = {
  id: string;
  external_id: string;
  home_team: string;
  away_team: string;
  home_team_logo: string | null;
  away_team_logo: string | null;
  kickoff_at: string;
  stage: string | null;
  group_name: string | null;
  status: string;
  final_home: number | null;
  final_away: number | null;
  score_120_home: number | null;
  score_120_away: number | null;
  score_90_home: number | null;
  score_90_away: number | null;
  manual_final_home: number | null;
  manual_final_away: number | null;
  manual_score_set_by_user_id: string | null;
  manual_score_set_at: string | null;
  score_source: "api" | "manual" | "none";
  live_home_score: number | null;
  live_away_score: number | null;
  live_minute: number | null;
  last_live_synced_at: string | null;
  points_multiplier: number;
};
