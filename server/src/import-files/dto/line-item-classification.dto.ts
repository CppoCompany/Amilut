import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ClassificationApproval,
  TradeAgreement,
} from '../../classification/classification.enums';

/** Classification recorded against one supplier-invoice line ("סיווג" screen). */
export class LineItemClassificationDto {
  @ApiProperty({
    enum: TradeAgreement,
    enumName: 'TradeAgreement',
    nullable: true,
    example: TradeAgreement.EU,
  })
  @IsOptional()
  @IsEnum(TradeAgreement)
  tradeAgreement!: TradeAgreement | null;

  @ApiProperty({ example: '8539.50.00', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  classificationCode!: string;

  @ApiProperty({
    enum: ClassificationApproval,
    enumName: 'ClassificationApproval',
    isArray: true,
    example: [ClassificationApproval.STANDARD_OR_DECLARATION],
  })
  @IsArray()
  @ArrayUnique()
  @IsEnum(ClassificationApproval, { each: true })
  approvals!: ClassificationApproval[];

  @ApiProperty({
    type: 'integer',
    nullable: true,
    example: 106,
    description: '`countries.id` of the origin country.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  countryId!: number | null;
}

/** One line to (re)classify: which stored line, plus its new classification. */
export class LineItemClassificationUpdateDto extends LineItemClassificationDto {
  @ApiProperty({
    type: 'integer',
    example: 42,
    description:
      'The `import_account_files` row (supplier invoice) the line belongs to.',
  })
  @IsInt()
  @Min(1)
  fileId!: number;

  @ApiProperty({
    type: 'integer',
    example: 0,
    description: "Position of the line inside that file's `lineItems`.",
  })
  @IsInt()
  @Min(0)
  lineIndex!: number;
}

/** Payload of `PUT /import-files/:accountNumber/line-items/classification`. */
export class SaveLineItemClassificationsDto {
  @ApiProperty({ type: LineItemClassificationUpdateDto, isArray: true })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LineItemClassificationUpdateDto)
  items!: LineItemClassificationUpdateDto[];
}
