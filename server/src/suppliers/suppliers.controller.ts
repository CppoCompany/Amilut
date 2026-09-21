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
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { SearchSuppliersQuery } from './dto/search-suppliers.query';
import { SupplierDto } from './dto/supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SuppliersService } from './suppliers.service';

/** All routes are protected by the global JwtAuthGuard. */
@ApiTags('suppliers')
@ApiBearerAuth()
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  /** Name autocomplete: active suppliers matching `q` (min 3 chars). */
  @Get()
  @ApiOkResponse({ type: SupplierDto, isArray: true })
  search(@Query() query: SearchSuppliersQuery): Promise<SupplierDto[]> {
    return this.suppliers.search(query.q, query.limit);
  }

  @Get(':id')
  @ApiOkResponse({ type: SupplierDto })
  @ApiNotFoundResponse({ description: 'No supplier with that id' })
  findById(@Param('id', ParseIntPipe) id: number): Promise<SupplierDto> {
    return this.suppliers.findById(id);
  }

  @Post()
  @ApiCreatedResponse({ type: SupplierDto })
  create(@Body() dto: CreateSupplierDto): Promise<SupplierDto> {
    return this.suppliers.create(dto);
  }

  @Patch(':id')
  @ApiOkResponse({ type: SupplierDto })
  @ApiNotFoundResponse({ description: 'No supplier with that id' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSupplierDto,
  ): Promise<SupplierDto> {
    return this.suppliers.update(id, dto);
  }
}
