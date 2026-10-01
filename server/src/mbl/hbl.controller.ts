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
import { CreateHblDto } from './dto/create-hbl.dto';
import { HblDto } from './dto/hbl.dto';
import { ListHblQuery } from './dto/list-hbl.query';
import { ManageHblOrdersDto } from './dto/manage-hbl-orders.dto';
import { UpdateHblDto } from './dto/update-hbl.dto';
import { HblService } from './hbl.service';

/** Authentication is enforced by the global JwtAuthGuard (APP_GUARD). */
@ApiTags('hbl')
@ApiBearerAuth()
@Controller('hbl')
export class HblController {
  constructor(private readonly hbl: HblService) {}

  @Get()
  @ApiOkResponse({ type: HblDto, isArray: true })
  findByMblId(@Query() query: ListHblQuery): Promise<HblDto[]> {
    return this.hbl.findByMblId(query.mblId);
  }

  @Post()
  @ApiCreatedResponse({ type: HblDto })
  @ApiNotFoundResponse()
  create(@Body() dto: CreateHblDto): Promise<HblDto> {
    return this.hbl.create(dto);
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
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateHblDto): Promise<HblDto> {
    return this.hbl.update(id, dto);
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

  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.hbl.remove(id);
  }
}
