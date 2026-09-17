import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ListShipmentsQuery } from './dto/list-shipments.query';
import { ShipmentSummaryDto } from './dto/shipment-summary.dto';
import { ShipmentsService } from './shipments.service';

/** Authentication is enforced by the global JwtAuthGuard (APP_GUARD). */
@ApiTags('shipments')
@ApiBearerAuth()
@Controller('shipments')
export class ShipmentsController {
  constructor(private readonly shipments: ShipmentsService) {}

  @Get()
  @ApiOkResponse({ type: ShipmentSummaryDto, isArray: true })
  findAll(@Query() query: ListShipmentsQuery): Promise<ShipmentSummaryDto[]> {
    return this.shipments.findAll(query);
  }
}
