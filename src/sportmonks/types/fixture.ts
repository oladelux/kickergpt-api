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
  result_info: string | null;
  leg: string | null;
  details: string | null;
  length: number | null;
  placeholder: boolean;
  has_odds: boolean;
  has_premium_odds: boolean;
  starting_at_timestamp: number | null;
};

export type SportmonksPagination = {
  count: number;
  per_page: number;
  current_page: number;
  next_page: number | null;
  has_more: boolean;
};

export type SportmonksFixturesResponse = {
  data: SportmonksFixture[];
  pagination: SportmonksPagination;
};

export type SportmonksFixturesRequestOptions = {
  order?: 'asc' | 'desc';
  per_page?: number;
  page?: number;
};
