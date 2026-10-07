import { ApiProperty } from '@nestjs/swagger';
import { PagedResponseBase } from '../../common/paging/paged.dto';
import { MblSummaryDto } from './mbl-summary.dto';

/** One page of GET /mbl/paged. */
export class PagedMblSummaryDto extends PagedResponseBase {
  @ApiProperty({ type: () => MblSummaryDto, isArray: true })
  items!: MblSummaryDto[];
}
