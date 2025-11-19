import { Controller, Get, Query, UseInterceptors } from '@nestjs/common';
import { ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiFootballFixturesResponseDto } from './dto/api-football-fixtures-response.dto';
import { FixturesService } from './fixtures.service';
import {
  ApiFootballFixturesResponse,
  KickerGPTFixturesResponse,
} from './types/fixtures-response.type';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';

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

  @Get('redis-cache')
  @CacheTTL(86_400)
  @ApiQuery({
    name: 'fixtureId',
    example: 123456,
    description: 'Cached fixture identifier.',
  })
  async getSelectedMatches(
    @Query('fixtureId') fixtureId: number,
  ): Promise<KickerGPTFixturesResponse | undefined> {
    return this.fixturesService.getSelectedMatches(fixtureId);
  }
}
