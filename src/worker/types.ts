export type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_NAME: string;
  APP_URL: string;
  SESSION_DAYS: string;
  MAGIC_LINK_MINUTES: string;
  LEAGUE_CODE_LENGTH: string;
  FOOTBALL_PROVIDER: string;
  FOOTBALL_API_KEY?: string;
  EMAIL?: { send: (message: unknown) => Promise<void> };
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
  points_multiplier: number;
};
