import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { GetFixturesByDateQueryDto } from './dto/get-fixtures-by-date.dto';
import { SportmonksFixturesResponseDto } from './dto/sportmonks-fixtures-response.dto';
import { SportmonksService } from './sportmonks.service';
import { SportmonksFixturesResponse } from './types/fixture';

@ApiTags('Sportmonks')
@Controller({
  path: 'matches',
  version: '1',
})
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
  async getFixturesOfDay(
    @Query() query: GetFixturesByDateQueryDto,
  ): Promise<SportmonksFixturesResponse> {
    const date = query.date ?? this.getToday();
    console.log('date', date);

    return this.sportmonksService.getFixturesByDate(date, {
      order: query.order,
      per_page: query.per_page,
      page: query.page,
    });
  }

  private getToday(): string {
    const today = new Date();
    const month = `${today.getMonth() + 1}`.padStart(2, '0');
    const day = `${today.getDate()}`.padStart(2, '0');

    return `${today.getFullYear()}-${month}-${day}`;
  }
}
