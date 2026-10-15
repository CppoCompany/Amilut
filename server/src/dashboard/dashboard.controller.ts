import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  DashboardService,
  PENDING_CLASSIFICATION_LIST_LIMIT,
} from './dashboard.service';
import { DashboardCcfRowDto, DashboardResponseDto } from './dto/dashboard.dto';

/** Authentication is enforced by the global JwtAuthGuard (APP_GUARD). */
@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /** The landing screen's five cards, scoped to the signed-in user where applicable. */
  @Get()
  @ApiOkResponse({ type: DashboardResponseDto })
  getDashboard(@CurrentUser() user: JwtPayload): Promise<DashboardResponseDto> {
    return this.dashboard.getDashboard(user.sub);
  }

  /**
   * Every CCF still pending classification (the dashboard card's full list,
   * up to {@link PENDING_CLASSIFICATION_LIST_LIMIT}), newest first — the
   * classification screen's file list.
   */
  @Get('ccfs-pending-classification')
  @ApiOkResponse({ type: DashboardCcfRowDto, isArray: true })
  getCcfsPendingClassification(): Promise<DashboardCcfRowDto[]> {
    return this.dashboard.findCcfsPendingClassification(
      PENDING_CLASSIFICATION_LIST_LIMIT,
    );
  }
}
