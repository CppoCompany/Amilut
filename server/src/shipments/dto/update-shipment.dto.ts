import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateShipmentDto } from './create-shipment.dto';

/**
 * Partial patch of a shipment file. `orderId` is not part of this DTO — a
 * file's order never changes once opened; the global ValidationPipe
 * (whitelist: true) strips it if a client sends it.
 */
export class UpdateShipmentDto extends PartialType(
  OmitType(CreateShipmentDto, ['orderId'] as const),
) {}
