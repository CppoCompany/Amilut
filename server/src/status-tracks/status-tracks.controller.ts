import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  StatusHistoryEntryDto,
  StatusHistoryQuery,
} from './dto/status-history.dto';
import { StatusTracksService } from './status-tracks.service';

/** Read-only status history. Changes go through each entity's own
 *  `…-status` endpoint (MBL / HBL / CCF controllers). */
@ApiTags('status-history')
@ApiBearerAuth()
@Controller('status-history')
export class StatusTracksController {
  constructor(private readonly tracks: StatusTracksService) {}

  @Get()
  @ApiOkResponse({ type: StatusHistoryEntryDto, isArray: true })
  list(@Query() query: StatusHistoryQuery): Promise<StatusHistoryEntryDto[]> {
    return this.tracks.listHistory(query.entityType, query.entityId);
  }
}
