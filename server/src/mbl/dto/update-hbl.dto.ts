import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateHblDto } from './create-hbl.dto';

/** `mblId` is fixed at creation. Order association has its own dedicated
 *  endpoint (`PATCH /hbl/:id/orders`), mirroring the MBL/shipments pattern. */
export class UpdateHblDto extends PartialType(
  OmitType(CreateHblDto, ['mblId', 'orderIds'] as const),
) {}
