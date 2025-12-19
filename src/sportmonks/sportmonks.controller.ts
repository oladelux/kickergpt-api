import {
  Controller,
  Get,
  Inject,
  Logger,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SportmonksFixturesResponseDto } from './dto/sportmonks-fixtures-response.dto';
import { SportmonksService } from './sportmonks.service';
import { SportmonksFixturesResponse } from './types/fixture';
import {
  CACHE_MANAGER,
  CacheInterceptor,
  CacheTTL,
} from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@ApiTags('Sportmonks')
@Controller({
  path: 'matches',
  version: '1',
})
@UseInterceptors(CacheInterceptor)
export class SportmonksController {
  private readonly logger = new Logger(SportmonksController.name);

  constructor(
    private readonly sportmonksService: SportmonksService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  @ApiQuery({
    name: 'date',
    required: false,
    description: 'Date in YYYY-MM-DD format. Defaults to today.',
    example: '2024-08-04',
  })
  @ApiQuery({
    name: 'order',
    required: false,
    description: 'Order by starting time.',
    example: 'desc',
    enum: ['asc', 'desc'],
  })
  @ApiQuery({
    name: 'per_page',
    required: false,
    description: 'Number of fixtures per page (max 50).',
    example: 30,
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number when paginating.',
    example: 2,
  })
  @ApiOkResponse({
    description: 'Fixtures scheduled for the requested day.',
    type: SportmonksFixturesResponseDto,
  })
  @Get('today')
  @CacheTTL(14_400)
  @ApiQuery({
    name: 'timezone',
    required: false,
    description:
      'IANA timezone identifier to localize fixture times (e.g. America/New_York). Defaults to the server timezone.',
    example: 'America/New_York',
  })
  async getFixturesOfDay(
    @Query('timezone') timezone?: string,
  ): Promise<SportmonksFixturesResponse> {
    return this.sportmonksService.getTodayFixtures(timezone);
  }

  @ApiQuery({
    name: 'timezone',
    required: false,
    description:
      'IANA timezone identifier to localize fixture times (e.g. America/New_York). Defaults to the server timezone.',
    example: 'America/New_York',
  })
  @ApiOkResponse({
    description: 'Fixtures scheduled for the next three days.',
    type: SportmonksFixturesResponseDto,
  })
  @ApiQuery({
    name: 'date',
    required: false,
    description: 'Date in YYYY-MM-DD format. Defaults to today.',
    example: '2024-08-04',
  })
  @ApiQuery({
    name: 'order',
    required: false,
    description: 'Order by starting time.',
    example: 'desc',
    enum: ['asc', 'desc'],
  })
  @ApiQuery({
    name: 'per_page',
    required: false,
    description: 'Number of fixtures per page (max 50).',
    example: 30,
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number when paginating.',
    example: 2,
  })
  @ApiOkResponse({
    description: 'Fixtures scheduled for the next three days.',
    type: SportmonksFixturesResponseDto,
  })
  @Get('three-days')
  @CacheTTL(14_400)
  async getThreeDaysFixtures(
    @Query('timezone') timezone?: string,
  ): Promise<SportmonksFixturesResponse> {
    const cacheKey = '/v1/matches/three-days';
    const cachedData =
      await this.cacheManager.get<SportmonksFixturesResponse>(cacheKey);

    if (cachedData) {
      this.logger.log(
        `Cache HIT for three-days fixtures (${cachedData.data.length} fixtures)`,
      );
      return cachedData;
    }

    this.logger.log('Cache MISS for three-days fixtures, fetching from API...');
    return this.sportmonksService.getThreeDaysFixturesOptimized(timezone);
  }

  /**
   * Manual cache warming endpoint for testing
   * Can be called to pre-populate the cache
   */
  @Post('admin/warm-cache')
  @ApiOkResponse({
    description: 'Cache warming status',
  })
  async warmCache(): Promise<{ message: string; fixturesCount: number }> {
    this.logger.log('Manual cache warming triggered...');

    const startTime = Date.now();
    const result = await this.sportmonksService.getThreeDaysFixturesOptimized();
    const duration = Date.now() - startTime;

    // Manually cache the result
    const cacheKey = '/v1/matches/three-days';
    await this.cacheManager.set(cacheKey, result, 14_400_000); // 4 hours in ms

    this.logger.log(
      `Cache warmed successfully: ${result.data.length} fixtures cached in ${duration}ms`,
    );

    return {
      message: 'Cache warmed successfully',
      fixturesCount: result.data.length,
    };
  }
}
