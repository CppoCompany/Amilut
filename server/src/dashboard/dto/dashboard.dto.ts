import { ApiProperty } from '@nestjs/swagger';
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

/** One row of the "הסיווגים שלי" dashboard card — a classified supplier-invoice line item. */
export class DashboardClassificationRowDto {
  /** The `import_account_files` row holding the line. */
  @ApiProperty({ type: 'integer', example: 42 })
  fileId!: number;

  /** The case the file was filed under (`import_account_files.account_id`). */
  @ApiProperty({ type: 'integer', example: 1000 })
  mblId!: number;

  /** Zero-based position of the line inside the file's `lineItems`. */
  @ApiProperty({ type: 'integer', example: 0 })
  lineIndex!: number;

  @ApiProperty({ type: 'string', example: 'Y8022-140BK' })
  item!: string;

  @ApiProperty({ type: 'string', example: 'Light Fixtures' })
  description!: string;

  @ApiProperty({ type: 'string', example: '9405.10.00' })
  classificationCode!: string;

  @ApiProperty({ type: 'string', nullable: true, example: 'סין' })
  countryName!: string | null;

  @ApiProperty({ format: 'date-time', example: '2026-09-01T08:30:00.000Z' })
  createdAt!: string;
}

/** One row of the "התיקים שלי" dashboard card — an MBL case handled by the signed-in user. */
export class DashboardCaseRowDto {
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

  @ApiProperty({ enum: MblStatus, enumName: 'MblStatus' })
  status!: MblStatus;

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

  @ApiProperty({ type: DashboardClassificationRowDto, isArray: true })
  myClassifications!: DashboardClassificationRowDto[];

  @ApiProperty({ type: DashboardCaseRowDto, isArray: true })
  myCases!: DashboardCaseRowDto[];

  @ApiProperty({ type: DashboardImportProcessRowDto, isArray: true })
  importProcesses!: DashboardImportProcessRowDto[];
}
