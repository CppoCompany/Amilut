import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { ListShipmentsQuery } from './dto/list-shipments.query';
import { ManageShipmentOrdersDto } from './dto/manage-shipment-orders.dto';
import { ShipmentDto } from './dto/shipment.dto';
import { ShipmentSummaryDto } from './dto/shipment-summary.dto';
import { UpdateShipmentDto } from './dto/update-shipment.dto';
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

  @Get('by-order/:orderId')
  @ApiOkResponse({ type: ShipmentDto })
  @ApiNotFoundResponse()
  findByOrderId(@Param('orderId', ParseIntPipe) orderId: number): Promise<ShipmentDto> {
    return this.shipments.findByOrderId(orderId);
  }

  @Get(':id')
  @ApiOkResponse({ type: ShipmentDto })
  @ApiNotFoundResponse()
  findById(@Param('id', ParseIntPipe) id: number): Promise<ShipmentDto> {
    return this.shipments.findById(id);
  }

  @Post()
  @ApiCreatedResponse({ type: ShipmentDto })
  @ApiNotFoundResponse()
  create(@Body() dto: CreateShipmentDto): Promise<ShipmentDto> {
    return this.shipments.create(dto);
  }

  @Patch(':id')
  @ApiOkResponse({ type: ShipmentDto })
  @ApiNotFoundResponse()
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateShipmentDto,
  ): Promise<ShipmentDto> {
    return this.shipments.update(id, dto);
  }

  @Patch(':id/orders')
  @ApiOkResponse({ type: ShipmentDto })
  @ApiNotFoundResponse()
  updateOrders(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ManageShipmentOrdersDto,
  ): Promise<ShipmentDto> {
    return this.shipments.updateOrders(id, dto.orderIds);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.shipments.remove(id);
  }
}
