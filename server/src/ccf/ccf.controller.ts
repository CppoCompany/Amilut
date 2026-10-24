import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { ChangeClearanceStatusDto } from '../status-tracks/dto/status-history.dto';
import { CcfService } from './ccf.service';
import { CcfDto } from './dto/ccf.dto';
import { CreateCcfDto } from './dto/create-ccf.dto';
import { ListCcfQuery } from './dto/list-ccf.query';
import { NextCcfFileNumberDto } from './dto/next-ccf-file-number.dto';

/** Authentication is enforced by the global JwtAuthGuard (APP_GUARD). */
@ApiTags('ccf')
@ApiBearerAuth()
@Controller('ccf')
export class CcfController {
  constructor(private readonly ccf: CcfService) {}

  @Get()
  @ApiOkResponse({ type: CcfDto, isArray: true })
  findAll(@Query() query: ListCcfQuery): Promise<CcfDto[]> {
    return this.ccf.findAll(query);
  }

  /** Declared before `:id` so "next-file-number" is not parsed as an id. */
  @Get('next-file-number')
  @ApiOkResponse({ type: NextCcfFileNumberDto })
  peekNextFileNumber(): Promise<NextCcfFileNumberDto> {
    return this.ccf.peekNextFileNumber();
  }

  @Post()
  @ApiCreatedResponse({ type: CcfDto })
  create(
    @Body() dto: CreateCcfDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<CcfDto> {
    return this.ccf.create(dto, user.sub);
  }

  @Get(':id')
  @ApiOkResponse({ type: CcfDto })
  @ApiNotFoundResponse()
  findById(@Param('id', ParseIntPipe) id: number): Promise<CcfDto> {
    return this.ccf.findById(id);
  }

  /** Clearance status of a per-house (air) CCF. */
  @Patch(':id/clearance-status')
  @ApiOkResponse({ type: CcfDto })
  @ApiNotFoundResponse()
  changeClearanceStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeClearanceStatusDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<CcfDto> {
    return this.ccf.changeClearanceStatus(id, dto.status, dto.reason, user.sub);
  }
}
