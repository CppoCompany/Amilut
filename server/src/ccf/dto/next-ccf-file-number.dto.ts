import { ApiProperty } from '@nestjs/swagger';

/**
 * The file number the next CCF insert will most likely receive. A preview
 * only — the sequence is peeked, not advanced, so a concurrent create can
 * still take it; the number actually assigned is the one `POST /api/ccf`
 * returns.
 */
export class NextCcfFileNumberDto {
  @ApiProperty({ example: 'CCF1000' })
  fileNumber!: string;
}
