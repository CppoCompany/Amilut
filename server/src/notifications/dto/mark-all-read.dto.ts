import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

/** Body of `PATCH /notifications/read-all`. */
export class MarkAllReadDto {
  /**
   * Highest notification id the client has displayed. Only notifications up
   * to it are marked read, so one that arrived after the list was fetched
   * stays unread (and keeps counting in the badge).
   */
  @ApiProperty({ type: 'integer', example: 42 })
  @IsInt()
  @Min(1)
  upToId!: number;
}
