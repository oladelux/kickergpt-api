import { Controller, Get, UseInterceptors } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ApiFootballFixturesResponseDto } from './dto/api-football-fixtures-response.dto';
import { FixturesService } from './fixtures.service';
import { ApiFootballFixturesResponse } from './types/fixtures-response.type';
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
}
