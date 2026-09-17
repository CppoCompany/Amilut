import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ListShipmentsQuery } from './dto/list-shipments.query';
import { ShipmentSummaryDto } from './dto/shipment-summary.dto';
import { ShipmentDocumentType } from './shipments.enums';

interface ShipmentSummaryRow {
  id: number;
  order_id: number;
  customer_name: string | null;
  bill_of_lading_number: string | null;
  document_type: ShipmentDocumentType | null;
  forwarder_name: string | null;
  created_at: Date | string;
}

const SHIPMENT_SUMMARY_SELECT = `
  SELECT s.id,
         s.order_id,
         c.name AS customer_name,
         s.bill_of_lading_number,
         s.document_type,
         s.forwarder_name,
         s.created_at
    FROM order_account s
    LEFT JOIN orders    o ON o.id = s.order_id
    LEFT JOIN customers c ON c.id = o.customer_id`;

@Injectable()
export class ShipmentsService {
  constructor(private readonly db: DatabaseService) {}

  async findAll(query: ListShipmentsQuery): Promise<ShipmentSummaryDto[]> {
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    const rows = await this.db.query<ShipmentSummaryRow>(
      `${SHIPMENT_SUMMARY_SELECT}
       ORDER BY s.id DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    return rows.map(toShipmentSummaryDto);
  }
}

function toIsoString(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function toShipmentSummaryDto(row: ShipmentSummaryRow): ShipmentSummaryDto {
  return {
    id: row.id,
    orderId: row.order_id,
    customerName: row.customer_name,
    billOfLadingNumber: row.bill_of_lading_number,
    documentType: row.document_type,
    forwarderName: row.forwarder_name,
    createdAt: toIsoString(row.created_at),
  };
}
