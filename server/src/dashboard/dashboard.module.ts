import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

/** `GET /api/dashboard` — the workspace landing screen's summary cards.
 *  DatabaseService is a global provider, so no database module import is needed. */
@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
