import { Controller, Get, Query, UseInterceptors } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ApiFootballFixturesResponseDto } from './dto/api-football-fixtures-response.dto';
import { FixturesService } from './fixtures.service';
import {
  ApiFootballFixturesResponse,
  KickerGPTFixturesResponse,
} from './types/fixtures-response.type';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { SelectedMatchesQueryDto } from './dto/selected-matches-query.dto';

@ApiTags('Fixtures')
@Controller({
  path: 'fixtures',
  version: '1',
})
@UseInterceptors(CacheInterceptor)
export class FixturesController {
  constructor(private readonly fixturesService: FixturesService) {}

  @Get('today')
  @CacheTTL(86_400)
  @ApiOkResponse({
    description: 'Fixtures scheduled for the current day.',
    type: ApiFootballFixturesResponseDto,
  })
  async getTodayFixtures(): Promise<ApiFootballFixturesResponse> {
    return this.fixturesService.getTodayFixtures();
  }

  @Get('test')
  @CacheTTL(86_400)
  async test(
    @Query() query: SelectedMatchesQueryDto,
  ): Promise<KickerGPTFixturesResponse[]> {
    const { league, season, date } = query;
    return this.fixturesService.getSelectedMatches(league, season, date);
  }
}
