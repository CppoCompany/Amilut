import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNumber, Min } from 'class-validator';

/** `pieceCount` pieces of length × width × height centimetres (`hbl_piece_dimension`). */
export class PieceDimensionDto {
  @ApiProperty({ type: 'integer', example: 4 })
  @IsInt()
  @Min(1)
  pieceCount!: number;

  @ApiProperty({ example: 120 })
  @IsNumber()
  @Min(0.01)
  lengthCm!: number;

  @ApiProperty({ example: 80 })
  @IsNumber()
  @Min(0.01)
  widthCm!: number;

  @ApiProperty({ example: 60 })
  @IsNumber()
  @Min(0.01)
  heightCm!: number;
}
