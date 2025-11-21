import { Controller, Get, UseInterceptors } from '@nestjs/common';
import { ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SportmonksFixturesResponseDto } from './dto/sportmonks-fixtures-response.dto';
import { SportmonksService } from './sportmonks.service';
import { SportmonksFixturesResponse } from './types/fixture';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';

@ApiTags('Sportmonks')
@Controller({
  path: 'matches',
  version: '1',
})
@UseInterceptors(CacheInterceptor)
export class SportmonksController {
  constructor(private readonly sportmonksService: SportmonksService) {}

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
  @CacheTTL(86_400)
  async getFixturesOfDay(): Promise<SportmonksFixturesResponse> {
    return this.sportmonksService.getTodayFixtures();
  }
}
