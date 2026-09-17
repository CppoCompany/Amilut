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
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CustomerDto } from './dto/customer.dto';
import { SearchCustomersQuery } from './dto/search-customers.query';
import { UpdateCustomerDto } from './dto/update-customer.dto';

/** All routes are protected by the global JwtAuthGuard. */
@ApiTags('customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  /** Name autocomplete: active customers matching `q` (min 3 chars). */
  @Get()
  @ApiOkResponse({ type: CustomerDto, isArray: true })
  search(@Query() query: SearchCustomersQuery): Promise<CustomerDto[]> {
    return this.customers.search(query.q, query.limit);
  }

  @Get(':id')
  @ApiOkResponse({ type: CustomerDto })
  @ApiNotFoundResponse({ description: 'No customer with that id' })
  findById(@Param('id', ParseIntPipe) id: number): Promise<CustomerDto> {
    return this.customers.findById(id);
  }

  @Post()
  @ApiCreatedResponse({ type: CustomerDto })
  create(@Body() dto: CreateCustomerDto): Promise<CustomerDto> {
    return this.customers.create(dto);
  }

  @Patch(':id')
  @ApiOkResponse({ type: CustomerDto })
  @ApiNotFoundResponse({ description: 'No customer with that id' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCustomerDto,
  ): Promise<CustomerDto> {
    return this.customers.update(id, dto);
  }
}
