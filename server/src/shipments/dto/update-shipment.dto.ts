import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateShipmentDto } from './create-shipment.dto';

/**
 * Partial patch of a shipment file's document fields. `orderIds` is not part
 * of this DTO — changing a case's order associations goes through the
 * dedicated `PATCH /shipments/:id/orders` endpoint instead (see
 * `ManageShipmentOrdersDto`); the global ValidationPipe (whitelist: true)
 * strips `orderIds` here if a client sends it.
 */
export class UpdateShipmentDto extends PartialType(
  OmitType(CreateShipmentDto, ['orderIds'] as const),
) {}
