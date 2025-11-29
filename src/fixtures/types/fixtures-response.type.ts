import { FootballLeague } from '../../sportmonks/types/fixture';

export type ApiFootballFixturePeriods = {
  first: number | null;
  second: number | null;
};

export type ApiFootballFixtureVenue = {
  id: number | null;
  name: string | null;
  address: string | null;
  city: string | null;
};

export type ApiFootballFixtureStatus = {
  long: string;
  short: string;
  elapsed: number | null;
  extra: string | null;
};

export type ApiFootballFixtureDetails = {
  id: number;
  referee: string | null;
  timezone: string;
  date: string;
  timestamp: number | null;
  periods: ApiFootballFixturePeriods;
  venue: ApiFootballFixtureVenue | null;
  status: ApiFootballFixtureStatus | null;
};

export type ApiFootballLeague = {
  id: number;
  name: string;
  country: string;
  logo: string | null;
  flag: string | null;
  season: number;
  round: string | null;
};

export type ApiFootballTeam = {
  id: number;
  name: string;
  logo: string | null;
  winner: boolean | null;
};

export type ApiFootballTeams = {
  home: ApiFootballTeam;
  away: ApiFootballTeam;
};

export type ApiFootballGoals = {
  home: number | null;
  away: number | null;
};

export type ApiFootballScorePeriod = {
  home: number | null;
  away: number | null;
};

export type ApiFootballScore = {
  halftime: ApiFootballScorePeriod;
  fulltime: ApiFootballScorePeriod;
  extratime: ApiFootballScorePeriod;
  penalty: ApiFootballScorePeriod;
};

export type ApiFootballFixture = {
  fixture: ApiFootballFixtureDetails;
  league: ApiFootballLeague;
  teams: ApiFootballTeams;
  goals: ApiFootballGoals;
  score: ApiFootballScore;
};

export type ApiFootballPaging = {
  current: number;
  total: number;
};

export type ApiFootballApiResponse<TResponse> = {
  get: string;
  parameters: Record<string, string>;
  errors: string[];
  results: number;
  paging: ApiFootballPaging;
  response: TResponse;
};

export type ApiFootballFixturesResponse = ApiFootballApiResponse<
  ApiFootballFixture[]
>;

export type ApiFootballTeamDetails = {
  team: {
    id: number;
    name: string;
    code: string | null;
    country: string | null;
    founded: number | null;
    national: boolean | null;
    logo: string | null;
  };
  venue: {
    id: number | null;
    name: string | null;
    address: string | null;
    city: string | null;
    capacity: number | null;
    surface: string | null;
    image: string | null;
  };
};

export type ApiFootballTeamsResponse = ApiFootballApiResponse<
  ApiFootballTeamDetails[]
>;

export type ApiFootballFixtureStatisticsValue = {
  type: string;
  value: number | string | null;
};

export type ApiFootballFixtureStatisticsEntry = {
  team: ApiFootballTeam;
  statistics: ApiFootballFixtureStatisticsValue[];
};

export type ApiFootballFixtureStatisticsResponse = ApiFootballApiResponse<
  ApiFootballFixtureStatisticsEntry[]
>;

export type ApiFootballLineupPlayer = {
  player: {
    id: number | null;
    name: string | null;
    number: number | null;
    pos: string | null;
    grid: string | null;
  };
};

export type ApiFootballLineupTeamColors = {
  primary: string | null;
  number: string | null;
  border: string | null;
};

export type ApiFootballLineupTeam = {
  id: number;
  name: string;
  logo: string | null;
  colors?: {
    player?: ApiFootballLineupTeamColors | null;
    goalkeeper?: ApiFootballLineupTeamColors | null;
  } | null;
};

export type ApiFootballLineupCoach = {
  id: number | null;
  name: string | null;
  photo: string | null;
};

export type ApiFootballLineup = {
  team: ApiFootballLineupTeam;
  coach: ApiFootballLineupCoach;
  formation: string | null;
  startXI: ApiFootballLineupPlayer[];
  substitutes: ApiFootballLineupPlayer[];
};

export type ApiFootballLineupsResponse = ApiFootballApiResponse<
  ApiFootballLineup[]
>;

export type ApiFootballPlayerStatistics = {
  player: {
    id: number | null;
    name: string | null;
    photo: string | null;
  };
  statistics: Array<{
    team: ApiFootballTeam;
    [key: string]: unknown;
  }>;
};

export type ApiFootballFixturePlayersResponse = ApiFootballApiResponse<
  ApiFootballPlayerStatistics[]
>;

export type ApiFootballOddsValue = {
  value: string;
  odd: string;
};

export type ApiFootballOddsBet = {
  id: number;
  name: string;
  values: ApiFootballOddsValue[];
};

export type ApiFootballOddsBookmaker = {
  id: number;
  name: string;
  bets: ApiFootballOddsBet[];
};

export type ApiFootballOdds = {
  fixture: ApiFootballFixtureDetails;
  league: ApiFootballLeague;
  update: string;
  bookmakers: ApiFootballOddsBookmaker[];
};

export type ApiFootballOddsResponse = ApiFootballApiResponse<ApiFootballOdds[]>;

export type ApiFootballStandingRecord = {
  played: number;
  win: number;
  draw: number;
  lose: number;
  goals: {
    for: number;
    against: number;
  };
};

export type ApiFootballTeamStanding = {
  rank: number;
  team: ApiFootballTeam;
  points: number;
  goalsDiff: number;
  form: string | null;
  description: string | null;
  status: string | null;
  group: string | null;
  all: ApiFootballStandingRecord;
  home: ApiFootballStandingRecord;
  away: ApiFootballStandingRecord;
  update: string;
};

export type ApiFootballStandingsLeague = ApiFootballLeague & {
  standings: ApiFootballTeamStanding[][];
};

export type ApiFootballStandingsResponse = ApiFootballApiResponse<
  Array<{
    league: ApiFootballStandingsLeague;
  }>
>;

export type ApiFootballInjury = {
  player: {
    id: number | null;
    name: string | null;
    reason: string | null;
  };
  team: ApiFootballTeam;
  fixture: ApiFootballFixtureDetails | null;
  league: ApiFootballLeague | null;
  season: number | null;
  date: string | null;
  time: {
    elapsed: number | null;
    extra: number | null;
  } | null;
  reason: string | null;
  type: string | null;
};

export type ApiFootballInjuriesResponse = ApiFootballApiResponse<
  ApiFootballInjury[]
>;

export type ApiFootballSidelinedRecord = {
  team: ApiFootballTeam | null;
  player?: {
    id: number | null;
    name: string | null;
    position: string | null;
  };
  coach?: {
    id: number | null;
    name: string | null;
  };
  description: string | null;
  type: string | null;
  start: string | null;
  end: string | null;
};

export type ApiFootballSidelinedResponse = ApiFootballApiResponse<
  ApiFootballSidelinedRecord[]
>;

export type KickerGPTFixturesResponse = {
  id: number;
  timezone: string;
  date: string;
  timestamp: number | null;
  finalScore: {
    home: number;
    away: number;
    winner: 'home' | 'away' | 'draw';
  } | null;
  periods: ApiFootballFixturePeriods | null;
  status: ApiFootballFixtureStatus | null;
  league: ApiFootballLeague | FootballLeague;
  teams: ApiFootballTeams;
  venue: ApiFootballFixtureVenue | null;
  derby: boolean;
  matchType: string;
  homeOdd: string | undefined;
  awayOdd: string | undefined;
  weatherSummary: string;
  referee: string;
  h2h: KickerGPTMatchSummary[];
  homeInjuries: KickerGPTInjuryPlayerFlag[];
  awayInjuries: KickerGPTInjuryPlayerFlag[];
  homeTeamRecentMatches: KickerGPTMatchSummary[];
  awayTeamRecentMatches: KickerGPTMatchSummary[];
  homeNews: KickerGPTNewsItemSummary[];
  awayNews: KickerGPTNewsItemSummary[];
};

export type KickerGPTPlayerRating = {
  playerId: number;
  playerName: string;
  rating: number | null;
  position?: string;
};

export type KickerGPTMatchSummary = {
  id: number;
  date: string;
  timestamp: number | null;
  league: ApiFootballLeague | FootballLeague;
  teams: ApiFootballTeams;
  venue: ApiFootballFixtureVenue | null;
  status: ApiFootballFixtureStatus | null;
  goals: ApiFootballGoals;
  derby: boolean;
  weatherSummary: string;
  referee: string;
  ratings?: {
    home: {
      players: KickerGPTPlayerRating[];
      teamAverage: number | null;
    };
    away: {
      players: KickerGPTPlayerRating[];
      teamAverage: number | null;
    };
  };
};

export type KickerGPTNewsItemSummary = {
  id: string;
  title: string;
  source: string;
  publishedAt: string;
  sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  tag?: 'MANAGER' | 'INJURY' | 'TRANSFER' | 'BOARD' | 'FANS' | 'OTHER';
};

export type KickerGPTInjuryPlayerFlag = {
  playerId: number | null;
  name: string | null;
  position?: string;
  reason: string | null;
  date?: string | null;
  expectedReturnDate?: string;
};
