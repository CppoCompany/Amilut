import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { DashboardService } from './dashboard.service';
import { DashboardResponseDto } from './dto/dashboard.dto';

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
}
