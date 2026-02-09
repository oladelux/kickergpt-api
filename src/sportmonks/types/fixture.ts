export type SportmonksFixture = {
  id: number;
  sport_id: number;
  league_id: number;
  season_id: number;
  stage_id: number;
  group_id: number | null;
  aggregate_id: number | null;
  round_id: number | null;
  state_id: number;
  venue_id: number | null;
  name: string;
  starting_at: string;
  league: SportmonksLeague;
  result_info: string | null;
  leg: string | null;
  details: string | null;
  length: number | null;
  placeholder: boolean;
  has_odds: boolean;
  has_premium_odds: boolean;
  starting_at_timestamp: number | null;
  participants: SportmonksParticipant[];
  odds: SportmonksOdd[];
  venue: SportmonksVenue | null;
  season: SportmonksSeason;
  weatherreport: SportmonksWeatherReport[];
  referees: SportmonksReferees[];
  sidelined: SportmonksSidelined[];
  prematchnews: SportmonksPreMatchNews;
  scores: SportmonksScore[];
  state: SportmonksState;
  lineups: SportmonksLineup[];
};

export type SportmonksState = {
  id: number;
  state: string;
  name: string;
  short_name: string;
  developer_name: string;
};

export type SportmonksPagination = {
  count: number;
  per_page: number;
  current_page: number;
  next_page: number | null;
  has_more: boolean;
};

export type SportmonksFixturesResponse = {
  timezone: string;
  data: SportmonksFixture[];
  pagination: SportmonksPagination;
};

export type SportmonksFixturesRequestOptions = {
  order?: 'asc' | 'desc';
  per_page?: number;
  page?: number;
  timezone?: string;
};

export type SportmonksParticipant = {
  id: number;
  sport_id: number;
  country_id: number | null;
  venue_id: number | null;
  gender: string | null;
  name: string;
  short_code: string | null;
  image_path: string | null;
  founded: number | null;
  type: string | null;
  placeholder: boolean;
  last_played_at: string | null;
  meta: {
    location: 'home' | 'away' | string;
    winner: boolean | null;
    position: number | null;
  };
  venue: SportmonksVenue;
};

export type SportmonksOdd = {
  id: number;
  fixture_id: number;
  market_id: number;
  bookmaker_id: number;
  label: string | null;
  value: string | null;
  name: string | null;
  sort_order: number | null;
  market_description: string | null;
  probability: string | null;
  dp3: string | null;
  fractional: string | null;
  american: string | null;
  winning: boolean;
  stopped: boolean;
  total: string | null;
  handicap: string | null;
  participants: unknown;
  created_at: string | null;
  original_label: string | null;
  latest_bookmaker_update: string | null;
};

export type SportmonksVenue = {
  id: number;
  country_id: number | null;
  city_id: number | null;
  name: string;
  address: string | null;
  zipcode: string | null;
  latitude: string | null;
  longitude: string | null;
  capacity: number | null;
  image_path: string | null;
  city_name: string | null;
  surface: string | null;
  national_team: boolean;
};

export type SportmonksSeason = {
  id: number;
  sport_id: number;
  league_id: number;
  tie_breaker_rule_id: number | null;
  name: string;
  finished: boolean;
  pending: boolean;
  is_current: boolean;
  starting_at: string;
  ending_at: string;
  standings_recalculated_at: string | null;
  games_in_current_week: boolean;
};

export type SportmonksWeatherReport = {
  id: number;
  fixture_id: number;
  venue_id: number | null;
  temperature: {
    day: number | null;
    morning: number | null;
    evening: number | null;
    night: number | null;
  };
  feels_like: {
    day: number | null;
    morning: number | null;
    evening: number | null;
    night: number | null;
  };
  wind: {
    speed: number | null;
    direction: number | null;
  };
  humidity: string | null;
  pressure: number | null;
  clouds: string | null;
  description: string | null;
  icon: string | null;
  type: string | null;
  metric: string | null;
  current: unknown;
};

export type SportmonksReferees = {
  id: number;
  fixture_id: number;
  referee_id: number;
  type_id: number;
  referee: SportmonksOfficial;
};

export type SportmonksSidelined = {
  id: number;
  fixture_id: number;
  sideline_id: number;
  participant_id: number;
  player_id: number;
  type_id: number;
  sideline: SportmonksSideline;
  player: SportmonksPlayer;
  type: {
    id: number;
    name: string | null;
    code: string | null;
    developer_name: string | null;
    model_type: string | null;
    stat_group: string | null;
  };
};

export type SportmonksLineupDetail = {
  id: number;
  fixture_id: number;
  player_id: number;
  team_id: number;
  lineup_id: number;
  type_id: number;
  data: {
    value: number | string | null;
  };
  type: {
    id: number;
    name: string;
    code: string;
    developer_name: string;
    model_type: string;
    stat_group: string;
  };
};

export type SportmonksLineup = {
  id: number;
  sport_id: number;
  fixture_id: number;
  player_id: number;
  team_id: number;
  position_id: number;
  formation_field: string;
  type_id: number;
  formation_position: number;
  player_name: string;
  jersey_number: number | null;
  details: SportmonksLineupDetail[];
};

export type SportmonksSideline = {
  id: number;
  player_id: number;
  type_id: number;
  category: string | null;
  team_id: number | null;
  season_id: number | null;
  start_date: string | null;
  end_date: string | null;
  games_missed: number | null;
  completed: boolean;
};

export type SportmonksPlayer = {
  id: number;
  sport_id: number;
  country_id: number | null;
  nationality_id: number | null;
  city_id: number | null;
  position_id: number | null;
  detailed_position_id: number | null;
  type_id: number | null;
  common_name: string | null;
  firstname: string;
  lastname: string;
  name: string | null;
  display_name: string | null;
  image_path: string | null;
  height: number | null;
  weight: number | null;
  date_of_birth: string | null;
  gender: string;
  position: {
    id: number;
    name: string | null;
    code: string | null;
    developer_name: string | null;
    model_type: string | null;
    stat_group: string | null;
  };
};

export type SportmonksOfficial = {
  id: number;
  sport_id: number;
  country_id: number | null;
  city_id: number | null;
  common_name: string | null;
  firstname: string | null;
  lastname: string | null;
  name: string | null;
  display_name: string | null;
  image_path: string | null;
  height: number | null;
  weight: number | null;
  date_of_birth: string | null;
  gender: string | null;
};

export type SportmonksPreMatchNews = {
  id: number;
  fixture_id: number;
  league_id: number;
  title: string;
  type: string;
};

export type SportmonksScore = {
  id: number;
  fixture_id: number;
  type_id: number;
  participant_id: number;
  score: {
    goals: number;
    participant: 'home' | 'away' | string;
  };
  description: string | null;
};

export type SportmonksLeague = {
  id: number;
  sport_id: number;
  country_id: number | null;
  name: string;
  active: boolean;
  short_code: string | null;
  image_path: string | null;
  type: string | null;
  sub_type: string | null;
  last_played_at: string | null;
  category: number | null;
  has_jerseys: boolean;
  country: SportmonksCountry;
};

export type SportmonksCountry = {
  id: number;
  continent_id: number | null;
  name: string;
  official_name: string | null;
  fifa_name: string | null;
  iso2: string | null;
  iso3: string | null;
  latitude: string | null;
  longitude: string | null;
  image_path: string | null;
};

export type PlayerInjury = {
  id: number;
  name: string;
  reason: string;
  date: string;
  expectedReturnDate: string;
  position: string;
  completed: boolean;
};

export type FootballLeague = {
  id: number;
  name: string;
  country: string;
  logo: string | null;
  flag: string | null;
  season: string | null;
  round: string | null;
};

export type LeagueTeamsPlayersResponse = {
  league: {
    id: number;
    name: string;
    country: string;
  };
  teams: {
    id: number;
    name: string;
    players: {
      id: number;
      name: string;
      position: string | null;
      age: number | null;
      height: number | null;
    }[];
  }[];
};

export type SportmonksTeam = {
  id: number;
  sport_id: number;
  country_id: number | null;
  venue_id: number | null;
  gender: string | null;
  name: string;
  short_code: string | null;
  image_path: string | null;
  founded: number | null;
  type: string | null;
  placeholder: boolean;
  last_played_at: string | null;
};

export type SportmonksSquadPlayer = {
  id: number;
  transfer_id: number | null;
  player_id: number;
  team_id: number;
  position_id: number | null;
  detailed_position_id: number | null;
  start: string | null;
  end: string | null;
  captain: boolean;
  jersey_number: number | null;
  player: SportmonksPlayer;
};
