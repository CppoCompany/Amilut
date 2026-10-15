import { ApiProperty } from '@nestjs/swagger';
import { CcfStatus } from '../../ccf/ccf.enums';
import { MblShippingType, MblStatus } from '../../mbl/mbl.enums';
import { OrderStatus } from '../../orders/orders.enums';

/** One row of the "ההזמנות שלי" dashboard card — orders handled by the signed-in user. */
export class DashboardOrderRowDto {
  @ApiProperty({ type: 'integer', example: 1000 })
  id!: number;

  @ApiProperty({ type: 'string', nullable: true, example: 'ACME Ltd.' })
  customerName!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'Dana Levi' })
  handlerName!: string | null;

  @ApiProperty({ enum: OrderStatus, enumName: 'OrderStatus' })
  status!: OrderStatus;

  @ApiProperty({ format: 'date-time', example: '2026-09-01T08:30:00.000Z' })
  createdAt!: string;
}

/** One row of the "תיקים בהתרה" dashboard card — an MBL case whose status is `in_release`. */
export class DashboardCaseInReleaseRowDto {
  /** The case number ("מספר תיק") — the MBL id. */
  @ApiProperty({ type: 'integer', example: 1 })
  id!: number;

  @ApiProperty({ type: 'string', nullable: true, example: 'MBL-987654321' })
  mblNumber!: string | null;

  @ApiProperty({ type: 'string', isArray: true, example: ['ACME Ltd.'] })
  customerNames!: string[];

  @ApiProperty({ type: 'string', nullable: true, example: 'MAERSK LINE' })
  carrierName!: string | null;

  @ApiProperty({ enum: MblStatus, enumName: 'MblStatus' })
  status!: MblStatus;

  @ApiProperty({ format: 'date-time', example: '2026-09-01T08:30:00.000Z' })
  createdAt!: string;
}

/**
 * One Customs Clearance File row, shared by the "תיקי עמילות שלא עברו סיווג"
 * and "תיקי עמילות" dashboard cards. The line counts cover the current
 * supplier-invoice lines filed under the CCF — exactly the rows the
 * classification screen shows for it.
 */
export class DashboardCcfRowDto {
  @ApiProperty({ type: 'integer', example: 7 })
  id!: number;

  @ApiProperty({ example: 'CCF1007' })
  fileNumber!: string;

  /** The linked shipping case (`mbl.id`), `null` for a standalone CCF. */
  @ApiProperty({ type: 'integer', nullable: true, example: 42 })
  shipmentFileId!: number | null;

  /** Joined for display — `null` when `shipmentFileId` is `null`. */
  @ApiProperty({ type: 'string', nullable: true, example: 'MBL-987654321' })
  shipmentFileMblNumber!: string | null;

  /** Customers of the linked shipping case's HBLs; `[]` for a standalone CCF. */
  @ApiProperty({ type: 'string', isArray: true, example: ['ACME Ltd.'] })
  customerNames!: string[];

  @ApiProperty({ enum: CcfStatus, enumName: 'CcfStatus' })
  status!: CcfStatus;

  /** Supplier-invoice lines filed under the CCF. */
  @ApiProperty({ type: 'integer', example: 4 })
  lineCount!: number;

  /** How many of those lines have a saved customs code ("פרט מכס"). */
  @ApiProperty({ type: 'integer', example: 1 })
  classifiedLineCount!: number;

  @ApiProperty({ format: 'date-time', example: '2026-09-01T08:30:00.000Z' })
  createdAt!: string;
}

/** One row of the "תהליכי יבוא" dashboard card — every MBL case (all handlers, all statuses). */
export class DashboardImportProcessRowDto {
  @ApiProperty({ type: 'integer', example: 1 })
  id!: number;

  @ApiProperty({ type: 'string', nullable: true, example: 'MBL-987654321' })
  mblNumber!: string | null;

  @ApiProperty({ enum: MblShippingType, enumName: 'MblShippingType' })
  shippingType!: MblShippingType;

  @ApiProperty({ type: 'string', isArray: true, example: ['ACME Ltd.'] })
  customerNames!: string[];

  @ApiProperty({ type: 'string', nullable: true, example: 'MAERSK LINE' })
  carrierName!: string | null;

  @ApiProperty({ type: 'integer', example: 3 })
  hblCount!: number;

  @ApiProperty({ enum: MblStatus, enumName: 'MblStatus' })
  status!: MblStatus;

  @ApiProperty({ format: 'date-time', example: '2026-09-01T08:30:00.000Z' })
  createdAt!: string;
}

/** `GET /api/dashboard` — the five most recent rows of each dashboard card. */
export class DashboardResponseDto {
  @ApiProperty({ type: DashboardOrderRowDto, isArray: true })
  myOrders!: DashboardOrderRowDto[];

  @ApiProperty({ type: DashboardCaseInReleaseRowDto, isArray: true })
  casesInRelease!: DashboardCaseInReleaseRowDto[];

  /** CCFs with no invoice lines yet, or with at least one line lacking a customs code. */
  @ApiProperty({ type: DashboardCcfRowDto, isArray: true })
  ccfsPendingClassification!: DashboardCcfRowDto[];

  /** Every CCF, whatever its classification state. */
  @ApiProperty({ type: DashboardCcfRowDto, isArray: true })
  ccfs!: DashboardCcfRowDto[];

  @ApiProperty({ type: DashboardImportProcessRowDto, isArray: true })
  importProcesses!: DashboardImportProcessRowDto[];
}
