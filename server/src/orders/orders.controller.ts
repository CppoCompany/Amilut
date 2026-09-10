import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateOrderDto } from './dto/create-order.dto';

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  /**
   * Placeholder: echoes the validated payload back until persistence exists.
   * Its main job today is to get CreateOrderDto (and its enums) into the
   * OpenAPI document.
   */
  @Post()
  @ApiCreatedResponse({ type: CreateOrderDto })
  create(@Body() dto: CreateOrderDto): CreateOrderDto {
    return dto;
  }
}
