import { BadRequestException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { StatusEntityType } from '../status-tracks/status-tracks.enums';
import { insertAuditLog } from '../status-tracks/status-tracks.service';
import { calculateChargeableWeight, PieceDimension } from './chargeable-weight';
import { WeightRuleDto } from './dto/air-reference.dto';

export interface ChargeableWeightWrite {
  table: 'mbl' | 'hbl';
  id: number;
  rule: WeightRuleDto;
  /** `undefined` keeps the stored approved value; `null` clears it. */
  approved: number | null | undefined;
  overrideReason?: string | null;
  /** True for a server-side recalculation (e.g. the HAWB moved to a MAWB of
   *  another airline) — no user is entering a value, so no reason is asked. */
  implicit?: boolean;
  userId: number;
}

interface StoredWeightRow {
  gross_weight_kg: string | null;
  volume_cbm: string | null;
  calculated_chargeable_weight_kg: string | null;
  approved_chargeable_weight_kg: string | null;
  chargeable_weight_overridden: boolean;
}

/**
 * Recalculates and stores a row's chargeable weight from what is saved on it
 * (gross weight, volume and — for a house — its piece dimensions), together
 * with the rule snapshot. The calculated and the approved (AWB) values are
 * kept apart; when they differ the row is flagged as overridden, a reason is
 * required for a user-entered override and the change goes to `audit_log`.
 */
export async function writeChargeableWeight(
  client: PoolClient,
  write: ChargeableWeightWrite,
): Promise<void> {
  const stored = (
    await client.query<StoredWeightRow>(
      `SELECT gross_weight_kg, volume_cbm, calculated_chargeable_weight_kg,
              approved_chargeable_weight_kg, chargeable_weight_overridden
         FROM ${write.table} WHERE id = $1`,
      [write.id],
    )
  ).rows[0];
  const dimensions =
    write.table === 'hbl' ? await readDimensions(client, write.id) : [];

  const { calculatedKg } = calculateChargeableWeight(
    {
      grossWeightKg: toNumber(stored.gross_weight_kg),
      volumeCbm: toNumber(stored.volume_cbm),
      dimensions,
    },
    write.rule,
  );
  const previousCalculated = toNumber(stored.calculated_chargeable_weight_kg);
  const previousApproved = toNumber(stored.approved_chargeable_weight_kg);
  const approved =
    write.approved === undefined ? previousApproved : write.approved;
  const overridden =
    approved !== null && calculatedKg !== null && approved !== calculatedKg;
  const pairChanged =
    approved !== previousApproved || calculatedKg !== previousCalculated;
  const newOverride =
    overridden && (!stored.chargeable_weight_overridden || pairChanged);
  const reason = write.overrideReason?.trim() || null;

  if (newOverride && !write.implicit && !reason) {
    throw new BadRequestException(
      `המשקל לחיוב שאושר (${approved}) שונה מהמשקל המחושב (${calculatedKg}) — יש לציין סיבה לחריגה`,
    );
  }

  await client.query(
    `UPDATE ${write.table}
        SET calculated_chargeable_weight_kg = $1,
            approved_chargeable_weight_kg   = $2,
            volumetric_divisor              = $3,
            weight_rounding_step_kg         = $4,
            weight_rounding_mode            = $5,
            chargeable_weight_overridden    = $6,
            chargeable_weight_override_by   = CASE WHEN $6 THEN (CASE WHEN $7 THEN $8::int ELSE chargeable_weight_override_by END) ELSE NULL END,
            chargeable_weight_override_at   = CASE WHEN $6 THEN (CASE WHEN $7 THEN now() ELSE chargeable_weight_override_at END) ELSE NULL END
      WHERE id = $9`,
    [
      calculatedKg,
      approved,
      write.rule.volumetricDivisor,
      write.rule.roundingStepKg,
      write.rule.roundingMode,
      overridden,
      newOverride,
      write.userId,
      write.id,
    ],
  );

  if (newOverride || (stored.chargeable_weight_overridden && !overridden)) {
    await insertAuditLog(client, {
      entityType:
        write.table === 'mbl' ? StatusEntityType.MBL : StatusEntityType.HBL,
      entityId: write.id,
      action: newOverride
        ? 'chargeable_weight_override'
        : 'chargeable_weight_override_cleared',
      before: {
        calculatedKg: previousCalculated,
        approvedKg: previousApproved,
      },
      after: {
        calculatedKg,
        approvedKg: approved,
        volumetricDivisor: write.rule.volumetricDivisor,
        roundingStepKg: write.rule.roundingStepKg,
        roundingMode: write.rule.roundingMode,
        implicit: write.implicit ?? false,
      },
      reason,
      userId: write.userId,
    });
  }
}

async function readDimensions(
  client: PoolClient,
  hblId: number,
): Promise<PieceDimension[]> {
  const rows = await client.query<{
    piece_count: number;
    length_cm: string;
    width_cm: string;
    height_cm: string;
  }>(
    'SELECT piece_count, length_cm, width_cm, height_cm FROM hbl_piece_dimension WHERE hbl_id = $1 ORDER BY id',
    [hblId],
  );
  return rows.rows.map((row) => ({
    pieceCount: row.piece_count,
    lengthCm: Number(row.length_cm),
    widthCm: Number(row.width_cm),
    heightCm: Number(row.height_cm),
  }));
}

function toNumber(value: string | number | null): number | null {
  return value === null ? null : Number(value);
}
