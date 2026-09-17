import { PartialType } from '@nestjs/swagger';
import { CreateOrderDto } from './create-order.dto';

/**
 * Partial patch of an order. `id`, `createdAt` and `handlerUserId` are not
 * part of this DTO; the global ValidationPipe (whitelist: true) strips them
 * if a client sends them.
 */
export class UpdateOrderDto extends PartialType(CreateOrderDto) {}
