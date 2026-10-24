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
import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { ChangeShipmentStatusDto } from '../status-tracks/dto/status-history.dto';
import { CreateMblDto } from './dto/create-mbl.dto';
import { ListMblQuery } from './dto/list-mbl.query';
import { MblDto } from './dto/mbl.dto';
import { MblSummaryDto } from './dto/mbl-summary.dto';
import { PagedMblSummaryDto } from './dto/paged-mbl.dto';
import { PagedMblQuery } from './dto/paged-mbl.query';
import { UpdateMblDto } from './dto/update-mbl.dto';
import { MblService } from './mbl.service';

/** Authentication is enforced by the global JwtAuthGuard (APP_GUARD). */
@ApiTags('mbl')
@ApiBearerAuth()
@Controller('mbl')
export class MblController {
  constructor(private readonly mbl: MblService) {}

  /** "התיקים שלי" grid's data source. */
  @Get()
  @ApiOkResponse({ type: MblSummaryDto, isArray: true })
  findAll(@Query() query: ListMblQuery): Promise<MblSummaryDto[]> {
    return this.mbl.findAll(query);
  }

  /** Paged/sorted/filtered cases for the "view all" list pages — `mine=true`
   *  for "התיקים שלי", `status=in_release` for "תיקים בהתרה", no scoping for
   *  "תהליכי יבוא". Declared before `:id` so the static segment wins. */
  @Get('paged')
  @ApiOkResponse({ type: PagedMblSummaryDto })
  findAllPaged(
    @Query() query: PagedMblQuery,
    @CurrentUser() user: JwtPayload,
  ): Promise<PagedMblSummaryDto> {
    return this.mbl.findAllPaged(query, user.sub);
  }

  @Post()
  @ApiCreatedResponse({ type: MblDto })
  create(
    @Body() dto: CreateMblDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<MblDto> {
    return this.mbl.create(dto, user.sub);
  }

  @Get(':id')
  @ApiOkResponse({ type: MblDto })
  @ApiNotFoundResponse()
  findById(@Param('id', ParseIntPipe) id: number): Promise<MblDto> {
    return this.mbl.findById(id);
  }

  @Patch(':id')
  @ApiOkResponse({ type: MblDto })
  @ApiNotFoundResponse()
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMblDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<MblDto> {
    return this.mbl.update(id, dto, user.sub);
  }

  /** Air MAWB shipment status (manual). Moving it backwards is a correction
   *  and needs `reason`; departed/arrived are also set automatically from
   *  the flight legs' ATD/ATA. Every change lands in the status history. */
  @Patch(':id/shipment-status')
  @ApiOkResponse({ type: MblDto })
  @ApiNotFoundResponse()
  changeShipmentStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeShipmentStatusDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<MblDto> {
    return this.mbl.changeShipmentStatus(id, dto.status, dto.reason, user.sub);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    return this.mbl.remove(id, user.sub);
  }
}
