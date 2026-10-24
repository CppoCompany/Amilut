import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateHblDto } from './create-hbl.dto';

/** `mblId`/`shippingType` are fixed at creation — an air HAWB moves between
 *  MAWBs only through `PATCH /hbl/:id/master` (audited). Order association
 *  has its own dedicated endpoint (`PATCH /hbl/:id/orders`). */
export class UpdateHblDto extends PartialType(
  OmitType(CreateHblDto, ['mblId', 'shippingType', 'orderIds'] as const),
) {}
