import {
  Body,
  Controller,
  Param,
  ParseIntPipe,
  Post,
  Request,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { FixturesAnalysisService } from './analysis.service';
import { CreateFixtureAnalysisDto } from '../fixtures/dto/create-fixture-analysis.dto';
import { FixtureAnalysisResponseDto } from '../fixtures/dto/fixture-analysis-response.dto';
import { FixtureAnalysis } from '../fixtures/types/fixture-analysis.type';

@ApiTags('Fixtures')
@Controller({
  path: 'analyze',
  version: '1',
})
export class FixturesAnalysisController {
  constructor(
    private readonly fixturesAnalysisService: FixturesAnalysisService,
  ) {}

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Post(':fixtureId')
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
    const userId = request.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.fixturesAnalysisService.analyzeFixture(
      fixtureId,
      body.message,
      userId,
      body.tone,
    );
  }
}
