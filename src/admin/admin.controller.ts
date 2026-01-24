import {
  Controller,
  Get,
  Post,
  UseGuards,
  Query,
  Param,
  ParseIntPipe,
  DefaultValuePipe,
  Inject,
  Logger,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags, ApiQuery, ApiParam } from '@nestjs/swagger';
import { AdminMetricsService } from './admin-metrics.service';
import { AdminService } from './admin.service';
import { AdminApiKeyGuard } from './admin-api-key.guard';
import { AdminMetricsDto } from './dto/admin-metrics.dto';
import { PaginatedResponseDto } from './dto/paginated-response.dto';
import { UserListItemDto } from './dto/user-list.dto';
import { UserDetailDto } from './dto/user-detail.dto';
import {
  FinancialMetricsDto,
  NigerianFinancialMetricsDto,
  NonNigerianFinancialMetricsDto,
  RevenueByCountryDto,
} from './dto/financial-metrics.dto';
import {
  SubscriptionListItemDto,
  SubscriptionStatsDto,
  SubscriptionByPlanDto,
} from './dto/subscription-stats.dto';
import {
  PromptUsageStatsDto,
  TopPromptUserDto,
  ExhaustedUserDto,
  PromptUsageByCountryDto,
} from './dto/prompt-usage-stats.dto';
import { SubscriptionPlan } from '../subscriptions/domain/subscription-plan.enum';
import { SubscriptionStatus } from '../subscriptions/domain/subscription-status.enum';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { SportmonksService } from '../sportmonks/sportmonks.service';

@ApiTags('Admin')
@Controller({
  path: 'admin',
  version: '1',
})
@UseGuards(AdminApiKeyGuard)
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(
    private readonly adminMetricsService: AdminMetricsService,
    private readonly adminService: AdminService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly sportmonksService: SportmonksService,
  ) {}

  @Get('metrics')
  @ApiOkResponse({ type: AdminMetricsDto })
  async getMetrics(): Promise<AdminMetricsDto> {
    return this.adminMetricsService.getMetrics();
  }

  // User Management Endpoints

  @Get('users')
  @ApiOkResponse({ type: PaginatedResponseDto<UserListItemDto> })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'email', required: false, type: String })
  @ApiQuery({ name: 'countryCode', required: false, type: String })
  @ApiQuery({ name: 'plan', required: false, enum: SubscriptionPlan })
  @ApiQuery({ name: 'status', required: false, enum: SubscriptionStatus })
  @ApiQuery({ name: 'search', required: false, type: String })
  async getUsers(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
    @Query('email') email?: string,
    @Query('countryCode') countryCode?: string,
    @Query('plan') plan?: SubscriptionPlan,
    @Query('status') status?: SubscriptionStatus,
    @Query('search') search?: string,
  ): Promise<PaginatedResponseDto<UserListItemDto>> {
    return this.adminService.getUsers({
      page,
      limit,
      email,
      countryCode,
      plan,
      status,
      search,
    });
  }

  @Get('users/:id')
  @ApiOkResponse({ type: UserDetailDto })
  @ApiParam({ name: 'id', type: String })
  async getUserById(@Param('id') id: string): Promise<UserDetailDto> {
    return this.adminService.getUserById(id);
  }

  @Get('users/search')
  @ApiOkResponse({ type: [UserListItemDto] })
  @ApiQuery({ name: 'q', required: true, type: String })
  async searchUsers(@Query('q') query: string): Promise<UserListItemDto[]> {
    return this.adminService.searchUsers(query);
  }

  // Financial Metrics Endpoints

  @Get('metrics/financial')
  @ApiOkResponse({ type: FinancialMetricsDto })
  async getFinancialMetrics(): Promise<FinancialMetricsDto> {
    return this.adminService.getFinancialMetrics();
  }

  @Get('metrics/financial/by-country')
  @ApiOkResponse({ type: [RevenueByCountryDto] })
  async getFinancialMetricsByCountry(): Promise<RevenueByCountryDto[]> {
    return this.adminService.getFinancialMetricsByCountry();
  }

  @Get('metrics/financial/nigerian')
  @ApiOkResponse({ type: NigerianFinancialMetricsDto })
  async getNigerianFinancialMetrics(): Promise<NigerianFinancialMetricsDto> {
    return this.adminService.getNigerianFinancialMetrics();
  }

  @Get('metrics/financial/non-nigerian')
  @ApiOkResponse({ type: NonNigerianFinancialMetricsDto })
  async getNonNigerianFinancialMetrics(): Promise<NonNigerianFinancialMetricsDto> {
    return this.adminService.getNonNigerianFinancialMetrics();
  }

  // Subscription Analytics Endpoints

  @Get('subscriptions')
  @ApiOkResponse({ type: PaginatedResponseDto<SubscriptionListItemDto> })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'plan', required: false, enum: SubscriptionPlan })
  @ApiQuery({ name: 'status', required: false, enum: SubscriptionStatus })
  @ApiQuery({ name: 'countryCode', required: false, type: String })
  async getSubscriptions(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
    @Query('plan') plan?: SubscriptionPlan,
    @Query('status') status?: SubscriptionStatus,
    @Query('countryCode') countryCode?: string,
  ): Promise<PaginatedResponseDto<SubscriptionListItemDto>> {
    return this.adminService.getSubscriptions({
      page,
      limit,
      plan,
      status,
      countryCode,
    });
  }

  @Get('subscriptions/stats')
  @ApiOkResponse({ type: SubscriptionStatsDto })
  async getSubscriptionStats(): Promise<SubscriptionStatsDto> {
    return this.adminService.getSubscriptionStats();
  }

  @Get('subscriptions/by-plan')
  @ApiOkResponse({ type: [SubscriptionByPlanDto] })
  async getSubscriptionsByPlan(): Promise<SubscriptionByPlanDto[]> {
    return this.adminService.getSubscriptionsByPlan();
  }

  @Get('subscriptions/expiring')
  @ApiOkResponse({ type: [SubscriptionListItemDto] })
  @ApiQuery({ name: 'days', required: false, type: Number })
  async getExpiringSubscriptions(
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days?: number,
  ): Promise<SubscriptionListItemDto[]> {
    return this.adminService.getExpiringSubscriptions(days);
  }

  // Prompt Usage Analytics Endpoints

  @Get('prompt-usage/stats')
  @ApiOkResponse({ type: PromptUsageStatsDto })
  async getPromptUsageStats(): Promise<PromptUsageStatsDto> {
    return this.adminService.getPromptUsageStats();
  }

  @Get('prompt-usage/top-users')
  @ApiOkResponse({ type: [TopPromptUserDto] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['today', 'week', 'month', 'all'],
  })
  async getTopPromptUsers(
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit?: number,
    @Query('period') period?: 'today' | 'week' | 'month' | 'all',
  ): Promise<TopPromptUserDto[]> {
    return this.adminService.getTopPromptUsers(limit, period);
  }

  @Get('prompt-usage/exhausted')
  @ApiOkResponse({ type: [ExhaustedUserDto] })
  async getExhaustedUsers(): Promise<ExhaustedUserDto[]> {
    return this.adminService.getExhaustedUsers();
  }

  @Get('prompt-usage/by-country')
  @ApiOkResponse({ type: [PromptUsageByCountryDto] })
  async getPromptUsageByCountry(): Promise<PromptUsageByCountryDto[]> {
    return this.adminService.getPromptUsageByCountry();
  }

  // Cache Management Endpoints

  @Post('cache/flush')
  @ApiOkResponse({
    description: 'Flush all cache from NestJS CacheManager',
  })
  async flushCache(): Promise<{ message: string; deletedKeys: number }> {
    this.logger.log('Flushing cache...');

    await this.cacheManager.clear();
    const deletedKeys = this.cacheManager.stores.length;

    return {
      message: `Flushed ${deletedKeys} cache keys successfully`,
      deletedKeys,
    };
  }

  @Get('fixtures/scan-ids')
  @ApiOkResponse({
    description:
      'Scan Redis for all fixture IDs and optionally update the fixtureIds key',
  })
  @ApiQuery({
    name: 'update',
    required: false,
    type: Boolean,
    description: 'Whether to update the fixtures:ids key with all found IDs',
  })
  @ApiQuery({
    name: 'date',
    required: false,
    type: String,
    description:
      'Date to use for the fixtures:ids key (YYYY-MM-DD). Defaults to today',
  })
  async scanAllFixtureIds(
    @Query('update') update?: string,
    @Query('date') date?: string,
  ): Promise<{
    message: string;
    totalKeys: number;
    fixtureIds: number[];
    count: number;
  }> {
    this.logger.log('Scanning Redis for all fixture IDs...');

    const shouldUpdate = update === 'true' || update === '1';
    const fixtureIds = await this.sportmonksService.scanAllFixtureIds(
      shouldUpdate,
      date,
    );

    return {
      message: `Found ${fixtureIds.length} fixture IDs in Redis${
        shouldUpdate ? ' and updated the fixtureIds key' : ''
      }`,
      totalKeys: fixtureIds.length,
      fixtureIds,
      count: fixtureIds.length,
    };
  }
}
