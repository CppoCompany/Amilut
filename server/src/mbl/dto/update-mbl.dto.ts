import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateMblDto } from './create-mbl.dto';

/** `shippingType`/`seaMethod` are fixed at creation — changing either would
 *  invalidate the HBL structure already built under this MBL. When
 *  `containers` is provided, it REPLACES the full set (same semantics as
 *  `PATCH /shipments/:id/orders`), not a merge. */
export class UpdateMblDto extends PartialType(
  OmitType(CreateMblDto, ['shippingType', 'seaMethod'] as const),
) {}
