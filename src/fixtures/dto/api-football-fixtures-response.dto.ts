import { ApiProperty } from '@nestjs/swagger';

export class ApiFootballFixturePeriodsDto {
  @ApiProperty({ type: Number, nullable: true, example: 1580997600 })
  first: number | null;

  @ApiProperty({ type: Number, nullable: true, example: null })
  second: number | null;
}

export class ApiFootballFixtureVenueDto {
  @ApiProperty({ type: Number, nullable: true, example: 1887 })
  id: number | null;

  @ApiProperty({ type: String, nullable: true, example: 'Stade Municipal' })
  name: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'Oued Zem' })
  city: string | null;
}

export class ApiFootballFixtureStatusDto {
  @ApiProperty({ example: 'Halftime' })
  long: string;

  @ApiProperty({ example: 'HT' })
  short: string;

  @ApiProperty({ type: Number, nullable: true, example: 45 })
  elapsed: number | null;

  @ApiProperty({ type: String, nullable: true, example: null })
  extra: string | null;
}

export class ApiFootballFixtureDetailsDto {
  @ApiProperty({ example: 239625 })
  id: number;

  @ApiProperty({ type: String, nullable: true, example: null })
  referee: string | null;

  @ApiProperty({ example: 'UTC' })
  timezone: string;

  @ApiProperty({ example: '2020-02-06T14:00:00+00:00' })
  date: string;

  @ApiProperty({ example: 1580997600 })
  timestamp: number;

  @ApiProperty({ type: ApiFootballFixturePeriodsDto })
  periods: ApiFootballFixturePeriodsDto;

  @ApiProperty({ type: ApiFootballFixtureVenueDto })
  venue: ApiFootballFixtureVenueDto;

  @ApiProperty({ type: ApiFootballFixtureStatusDto })
  status: ApiFootballFixtureStatusDto;
}

export class ApiFootballLeagueDto {
  @ApiProperty({ example: 200 })
  id: number;

  @ApiProperty({ example: 'Botola Pro' })
  name: string;

  @ApiProperty({ example: 'Morocco' })
  country: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'https://media.api-sports.io/football/leagues/115.png',
  })
  logo: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'https://media.api-sports.io/flags/ma.svg',
  })
  flag: string | null;

  @ApiProperty({ example: 2019 })
  season: number;

  @ApiProperty({ type: String, nullable: true, example: 'Regular Season - 14' })
  round: string | null;
}

export class ApiFootballTeamDto {
  @ApiProperty({ example: 967 })
  id: number;

  @ApiProperty({ example: 'Rapide Oued ZEM' })
  name: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'https://media.api-sports.io/football/teams/967.png',
  })
  logo: string | null;

  @ApiProperty({ type: Boolean, nullable: true, example: false })
  winner: boolean | null;
}

export class ApiFootballTeamsDto {
  @ApiProperty({ type: ApiFootballTeamDto })
  home: ApiFootballTeamDto;

  @ApiProperty({ type: ApiFootballTeamDto })
  away: ApiFootballTeamDto;
}

export class ApiFootballGoalsDto {
  @ApiProperty({ type: Number, nullable: true, example: 0 })
  home: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 1 })
  away: number | null;
}

export class ApiFootballScorePeriodDto {
  @ApiProperty({ type: Number, nullable: true, example: 0 })
  home: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 1 })
  away: number | null;
}

export class ApiFootballScoreDto {
  @ApiProperty({ type: ApiFootballScorePeriodDto })
  halftime: ApiFootballScorePeriodDto;

  @ApiProperty({ type: ApiFootballScorePeriodDto })
  fulltime: ApiFootballScorePeriodDto;

  @ApiProperty({ type: ApiFootballScorePeriodDto })
  extratime: ApiFootballScorePeriodDto;

  @ApiProperty({ type: ApiFootballScorePeriodDto })
  penalty: ApiFootballScorePeriodDto;
}

export class ApiFootballFixtureDto {
  @ApiProperty({ type: ApiFootballFixtureDetailsDto })
  fixture: ApiFootballFixtureDetailsDto;

  @ApiProperty({ type: ApiFootballLeagueDto })
  league: ApiFootballLeagueDto;

  @ApiProperty({ type: ApiFootballTeamsDto })
  teams: ApiFootballTeamsDto;

  @ApiProperty({ type: ApiFootballGoalsDto })
  goals: ApiFootballGoalsDto;

  @ApiProperty({ type: ApiFootballScoreDto })
  score: ApiFootballScoreDto;
}

export class ApiFootballPagingDto {
  @ApiProperty({ example: 1 })
  current: number;

  @ApiProperty({ example: 1 })
  total: number;
}

export class ApiFootballFixturesResponseDto {
  @ApiProperty({ example: 'fixtures' })
  get: string;

  @ApiProperty({
    type: Object,
    example: {
      date: '2020-02-06',
    },
  })
  parameters: Record<string, string>;

  @ApiProperty({ type: [String], example: [] })
  errors: string[];

  @ApiProperty({ example: 4 })
  results: number;

  @ApiProperty({ type: ApiFootballPagingDto })
  paging: ApiFootballPagingDto;

  @ApiProperty({ type: [ApiFootballFixtureDto] })
  response: ApiFootballFixtureDto[];
}
