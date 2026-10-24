import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ClearanceStatus,
  DocumentStatus,
  ShipmentStatus,
  StatusChangeSource,
  StatusEntityType,
  StatusTrack,
} from '../status-tracks.enums';

/** One `status_history` row, newest first. */
export class StatusHistoryEntryDto {
  @ApiProperty({ type: 'integer', example: 1 })
  id!: number;

  @ApiProperty({ enum: StatusTrack, enumName: 'StatusTrack' })
  track!: StatusTrack;

  @ApiProperty({ type: 'string', nullable: true, example: 'booking_confirmed' })
  fromValue!: string | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'departed' })
  toValue!: string | null;

  @ApiProperty({ enum: StatusChangeSource, enumName: 'StatusChangeSource' })
  source!: StatusChangeSource;

  @ApiProperty({ type: 'string', nullable: true })
  reason!: string | null;

  @ApiProperty({ type: 'integer', nullable: true, example: 1 })
  changedBy!: number | null;

  @ApiProperty({ type: 'string', nullable: true, example: 'Dana Levi' })
  changedByName!: string | null;

  @ApiProperty({ format: 'date-time' })
  changedAt!: string;
}

export class StatusHistoryQuery {
  @ApiProperty({ enum: StatusEntityType, enumName: 'StatusEntityType' })
  @IsEnum(StatusEntityType)
  entityType!: StatusEntityType;

  @ApiProperty({ type: 'integer', example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  entityId!: number;
}

/** Reason is required only when the change moves the track backwards. */
class StatusChangeReason {
  @ApiPropertyOptional({ example: 'ATD was entered on the wrong leg' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ChangeShipmentStatusDto extends StatusChangeReason {
  @ApiProperty({ enum: ShipmentStatus, enumName: 'ShipmentStatus' })
  @IsEnum(ShipmentStatus)
  status!: ShipmentStatus;
}

export class ChangeDocumentStatusDto extends StatusChangeReason {
  @ApiProperty({ enum: DocumentStatus, enumName: 'DocumentStatus' })
  @IsEnum(DocumentStatus)
  status!: DocumentStatus;
}

export class ChangeClearanceStatusDto extends StatusChangeReason {
  @ApiProperty({ enum: ClearanceStatus, enumName: 'ClearanceStatus' })
  @IsEnum(ClearanceStatus)
  status!: ClearanceStatus;
}
