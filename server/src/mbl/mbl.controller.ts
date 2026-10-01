import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CreateMblDto } from './dto/create-mbl.dto';
import { ListMblQuery } from './dto/list-mbl.query';
import { MblDto } from './dto/mbl.dto';
import { MblSummaryDto } from './dto/mbl-summary.dto';
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

  @Post()
  @ApiCreatedResponse({ type: MblDto })
  create(@Body() dto: CreateMblDto): Promise<MblDto> {
    return this.mbl.create(dto);
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
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMblDto): Promise<MblDto> {
    return this.mbl.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.mbl.remove(id);
  }
}
