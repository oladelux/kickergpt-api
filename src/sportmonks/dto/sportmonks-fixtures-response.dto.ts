import { ApiProperty } from '@nestjs/swagger';

export class SportmonksFixtureDto {
  @ApiProperty({ example: 19146700 })
  id: number;

  @ApiProperty({ example: 1 })
  sport_id: number;

  @ApiProperty({ example: 501 })
  league_id: number;

  @ApiProperty({ example: 23690 })
  season_id: number;

  @ApiProperty({ example: 77471570 })
  stage_id: number;

  @ApiProperty({ type: Number, nullable: true, example: null })
  group_id: number | null;

  @ApiProperty({ type: Number, nullable: true, example: null })
  aggregate_id: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 340573 })
  round_id: number | null;

  @ApiProperty({ example: 5 })
  state_id: number;

  @ApiProperty({ type: Number, nullable: true, example: 8879 })
  venue_id: number | null;

  @ApiProperty({ example: 'St. Mirren vs Hibernian' })
  name: string;

  @ApiProperty({ example: '2024-08-04 14:00:00' })
  starting_at: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'St. Mirren won after full-time.',
  })
  result_info: string | null;

  @ApiProperty({ type: String, nullable: true, example: '1/1' })
  leg: string | null;

  @ApiProperty({ type: String, nullable: true, example: null })
  details: string | null;

  @ApiProperty({ type: Number, nullable: true, example: 90 })
  length: number | null;

  @ApiProperty({ example: false })
  placeholder: boolean;

  @ApiProperty({ example: true })
  has_odds: boolean;

  @ApiProperty({ example: true })
  has_premium_odds: boolean;

  @ApiProperty({ type: Number, nullable: true, example: 1722780000 })
  starting_at_timestamp: number | null;
}

export class SportmonksPaginationDto {
  @ApiProperty({ example: 25 })
  count: number;

  @ApiProperty({ example: 25 })
  per_page: number;

  @ApiProperty({ example: 1 })
  current_page: number;

  @ApiProperty({ type: Number, nullable: true, example: 2 })
  next_page: number | null;

  @ApiProperty({ example: true })
  has_more: boolean;
}

export class SportmonksFixturesResponseDto {
  @ApiProperty({ type: [SportmonksFixtureDto] })
  data: SportmonksFixtureDto[];

  @ApiProperty({ type: SportmonksPaginationDto })
  pagination: SportmonksPaginationDto;
}
