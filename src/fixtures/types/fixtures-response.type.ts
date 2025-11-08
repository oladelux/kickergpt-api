export type ApiFootballFixturePeriods = {
  first: number | null;
  second: number | null;
};

export type ApiFootballFixtureVenue = {
  id: number | null;
  name: string | null;
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
  timestamp: number;
  periods: ApiFootballFixturePeriods;
  venue: ApiFootballFixtureVenue;
  status: ApiFootballFixtureStatus;
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
