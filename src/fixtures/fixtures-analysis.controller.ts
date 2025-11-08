import {
  Body,
  Controller,
  Param,
  ParseIntPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { FixturesAnalysisService } from './fixtures-analysis.service';
import { CreateFixtureAnalysisDto } from './dto/create-fixture-analysis.dto';
import { FixtureAnalysisResponseDto } from './dto/fixture-analysis-response.dto';
import { FixtureAnalysis } from './types/fixture-analysis.type';

@ApiTags('Fixtures')
@Controller({
  path: 'fixtures',
  version: '1',
})
export class FixturesAnalysisController {
  constructor(
    private readonly fixturesAnalysisService: FixturesAnalysisService,
  ) {}

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Post(':fixtureId/analyze')
  @ApiParam({
    name: 'fixtureId',
    example: 123456,
    description: 'API-Football fixture identifier.',
  })
  @ApiOkResponse({
    description:
      'AI generated analysis using API-Football fixture plus head-to-head data.',
    type: FixtureAnalysisResponseDto,
  })
  analyzeFixture(
    @Param('fixtureId', ParseIntPipe) fixtureId: number,
    @Body() body: CreateFixtureAnalysisDto,
    @Request() request,
  ): Promise<FixtureAnalysis> {
    return this.fixturesAnalysisService.analyzeFixture(
      fixtureId,
      body.message,
      body.tone,
      request.user?.id,
    );
  }
}
