import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { StrategiesService, StrategyMatchResult } from './strategies.service';
import { Strategy } from './domain/strategy';
import { CreateStrategyDto } from './dto/create-strategy.dto';
import { UpdateStrategyDto } from './dto/update-strategy.dto';
import { StrategyMatchDto } from './dto/strategy-match.dto';

@ApiTags('Strategies')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({
  path: 'strategies',
  version: '1',
})
export class StrategiesController {
  constructor(private readonly strategiesService: StrategiesService) {}

  @Post()
  @ApiCreatedResponse({ type: Strategy })
  async create(
    @Request() request,
    @Body() dto: CreateStrategyDto,
  ): Promise<Strategy> {
    return this.strategiesService.create(request.user.id, {
      name: dto.name,
      description: dto.description,
      conditions: dto.conditions,
      isActive: dto.isActive,
    });
  }

  @Get()
  @ApiOkResponse({ type: [Strategy] })
  async findAll(@Request() request): Promise<Strategy[]> {
    return this.strategiesService.findByUserId(request.user.id);
  }

  @Get(':id')
  @ApiOkResponse({ type: Strategy })
  async findOne(
    @Request() request,
    @Param('id') id: string,
  ): Promise<Strategy> {
    return this.strategiesService.findById(id, request.user.id);
  }

  @Patch(':id')
  @ApiOkResponse({ type: Strategy })
  async update(
    @Request() request,
    @Param('id') id: string,
    @Body() dto: UpdateStrategyDto,
  ): Promise<Strategy> {
    return this.strategiesService.update(id, request.user.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async delete(@Request() request, @Param('id') id: string): Promise<void> {
    return this.strategiesService.delete(id, request.user.id);
  }

  @Post(':id/find-matches')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: StrategyMatchDto })
  async findMatches(
    @Request() request,
    @Param('id') id: string,
  ): Promise<StrategyMatchResult> {
    return this.strategiesService.findMatchingFixtures(id, request.user.id);
  }
}
