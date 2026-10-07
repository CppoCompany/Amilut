import { ApiProperty } from '@nestjs/swagger';
import { PagedResponseBase } from '../../common/paging/paged.dto';
import { OrderDto } from './order.dto';

/** One page of GET /orders/paged. */
export class PagedOrdersDto extends PagedResponseBase {
  @ApiProperty({ type: () => OrderDto, isArray: true })
  items!: OrderDto[];
}
