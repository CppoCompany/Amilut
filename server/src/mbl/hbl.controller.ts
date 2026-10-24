import {
  BadRequestException,
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
import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { ChangeDocumentStatusDto } from '../status-tracks/dto/status-history.dto';
import { CreateHblDto } from './dto/create-hbl.dto';
import {
  CreateHblArrivalDto,
  HblArrivalDto,
  HblLinkHistoryEntryDto,
  LinkHblMasterDto,
  VoidHblArrivalDto,
} from './dto/hawb-operations.dto';
import { HblDto } from './dto/hbl.dto';
import { ListHblQuery } from './dto/list-hbl.query';
import { ManageHblOrdersDto } from './dto/manage-hbl-orders.dto';
import { UpdateHblDto } from './dto/update-hbl.dto';
import { HawbService } from './hawb.service';
import { HblService } from './hbl.service';

/** Authentication is enforced by the global JwtAuthGuard (APP_GUARD). */
@ApiTags('hbl')
@ApiBearerAuth()
@Controller('hbl')
export class HblController {
  constructor(
    private readonly hbl: HblService,
    private readonly hawb: HawbService,
  ) {}

  /** `?mblId=` — the HBLs of one MBL; `?unassigned=true` — air HAWBs with no MAWB yet. */
  @Get()
  @ApiOkResponse({ type: HblDto, isArray: true })
  list(@Query() query: ListHblQuery): Promise<HblDto[]> {
    if ((query.mblId === undefined) === !query.unassigned) {
      throw new BadRequestException(
        'Exactly one of mblId or unassigned=true is required',
      );
    }
    return query.unassigned
      ? this.hbl.findUnassigned()
      : this.hbl.findByMblId(query.mblId!);
  }

  @Post()
  @ApiCreatedResponse({ type: HblDto })
  @ApiNotFoundResponse()
  create(
    @Body() dto: CreateHblDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<HblDto> {
    return this.hbl.create(dto, user.sub);
  }

  @Get(':id')
  @ApiOkResponse({ type: HblDto })
  @ApiNotFoundResponse()
  findById(@Param('id', ParseIntPipe) id: number): Promise<HblDto> {
    return this.hbl.findById(id);
  }

  @Patch(':id')
  @ApiOkResponse({ type: HblDto })
  @ApiNotFoundResponse()
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateHblDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<HblDto> {
    return this.hbl.update(id, dto, user.sub);
  }

  @Patch(':id/orders')
  @ApiOkResponse({ type: HblDto })
  @ApiNotFoundResponse()
  updateOrders(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ManageHblOrdersDto,
  ): Promise<HblDto> {
    return this.hbl.updateOrders(id, dto.orderIds);
  }

  /** Air: link / move / detach a HAWB (audited; a correction after arrival needs a reason). */
  @Patch(':id/master')
  @ApiOkResponse({ type: HblDto })
  @ApiNotFoundResponse()
  linkToMaster(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: LinkHblMasterDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<HblDto> {
    return this.hawb.linkToMaster(id, dto.mblId, dto.reason, user.sub);
  }

  @Get(':id/link-history')
  @ApiOkResponse({ type: HblLinkHistoryEntryDto, isArray: true })
  listLinkHistory(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<HblLinkHistoryEntryDto[]> {
    return this.hawb.listLinkHistory(id);
  }

  /** Air: the HAWB's document status track (backwards needs a reason). */
  @Patch(':id/document-status')
  @ApiOkResponse({ type: HblDto })
  @ApiNotFoundResponse()
  changeDocumentStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeDocumentStatusDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<HblDto> {
    return this.hawb.changeDocumentStatus(id, dto.status, dto.reason, user.sub);
  }

  @Get(':id/arrivals')
  @ApiOkResponse({ type: HblArrivalDto, isArray: true })
  listArrivals(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<HblArrivalDto[]> {
    return this.hawb.listArrivals(id);
  }

  @Post(':id/arrivals')
  @ApiCreatedResponse({ type: HblDto })
  @ApiNotFoundResponse()
  addArrival(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateHblArrivalDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<HblDto> {
    return this.hawb.addArrival(id, dto, user.sub);
  }

  /** Arrival rows are never deleted — a wrong one is voided with a reason. */
  @Post(':id/arrivals/:arrivalId/void')
  @ApiCreatedResponse({ type: HblDto })
  @ApiNotFoundResponse()
  voidArrival(
    @Param('id', ParseIntPipe) id: number,
    @Param('arrivalId', ParseIntPipe) arrivalId: number,
    @Body() dto: VoidHblArrivalDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<HblDto> {
    return this.hawb.voidArrival(id, arrivalId, dto.reason, user.sub);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.hbl.remove(id);
  }
}
