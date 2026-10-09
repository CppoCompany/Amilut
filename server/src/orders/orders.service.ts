import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Paged } from '../common/paging/paged.dto';
import {
  orderByClause,
  pageWindow,
  pushDateRange,
  pushTextSearch,
  toPaged,
  WithTotal,
} from '../common/paging/paging.util';
import { DatabaseService } from '../database/database.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersQuery } from './dto/list-orders.query';
import { OrderDto } from './dto/order.dto';
import { ORDER_SORT_COLUMNS, PagedOrdersQuery } from './dto/paged-orders.query';
import { UpdateOrderDto } from './dto/update-order.dto';
import {
  Destination,
  Incoterm,
  INCOTERMS_BY_PAYMENT_TERMS,
  OrderStatus,
  PaymentTerms,
  ShipmentType,
} from './orders.enums';

/** Row shape produced by ORDER_SELECT (DATE columns are pre-formatted in SQL). */
interface OrderRow {
  id: number;
  customer_id: number;
  customer_name: string | null;
  handler_user_id: number | null;
  handler_name: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  status: OrderStatus;
  shipment_type: ShipmentType;
  payment_terms: PaymentTerms;
  incoterm: Incoterm;
  destination: Destination;
  supplier_id: number | null;
  supplier_name: string | null;
  factory_ready_date: string | null;
  factory_pickup_date: string | null;
  departure_date: string | null;
  eta_date: string | null;
  shipping_line: string | null;
  voyage_number: string | null;
  airline: string | null;
  flight_number: string | null;
  is_active: boolean;
  mbl_id: number | null;
}

/** DTO property → orders column, for every client-writable field. */
const WRITABLE_COLUMNS: Record<keyof CreateOrderDto, string> = {
  customerId: 'customer_id',
  status: 'status',
  shipmentType: 'shipment_type',
  paymentTerms: 'payment_terms',
  incoterm: 'incoterm',
  destination: 'destination',
  supplierId: 'supplier_id',
  factoryReadyDate: 'factory_ready_date',
  factoryPickupDate: 'factory_pickup_date',
  departureDate: 'departure_date',
  etaDate: 'eta_date',
  shippingLine: 'shipping_line',
  voyageNumber: 'voyage_number',
  airline: 'airline',
  flightNumber: 'flight_number',
};

const WRITABLE_KEYS = Object.keys(WRITABLE_COLUMNS) as (keyof CreateOrderDto)[];

/** Column list shared by every order SELECT (DATE columns pre-formatted in SQL). */
const ORDER_COLUMNS = `o.id,
         o.customer_id,
         c.name AS customer_name,
         o.handler_user_id,
         u.name AS handler_name,
         o.created_at,
         o.updated_at,
         o.status,
         o.shipment_type,
         o.payment_terms,
         o.incoterm,
         o.destination,
         o.supplier_id,
         sup.name AS supplier_name,
         to_char(o.factory_ready_date, 'YYYY-MM-DD')  AS factory_ready_date,
         to_char(o.factory_pickup_date, 'YYYY-MM-DD') AS factory_pickup_date,
         to_char(o.departure_date, 'YYYY-MM-DD')      AS departure_date,
         to_char(o.eta_date, 'YYYY-MM-DD')            AS eta_date,
         o.shipping_line,
         o.voyage_number,
         o.airline,
         o.flight_number,
         o."isActive" AS is_active,
         h.mbl_id`;

const ORDER_FROM = `
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    LEFT JOIN users     u ON u.id = o.handler_user_id
    LEFT JOIN suppliers sup ON sup.id = o.supplier_id
    LEFT JOIN hbl       h ON h.id = o.hbl_id`;

const ORDER_SELECT = `
  SELECT ${ORDER_COLUMNS}${ORDER_FROM}`;

/** Same rows plus the window `total`, for paged lists. */
const ORDER_SELECT_PAGED = `
  SELECT count(*) OVER() AS total,
         ${ORDER_COLUMNS}${ORDER_FROM}`;

/** ILIKE targets of the free-text search on GET /orders/paged. */
const ORDER_SEARCH_EXPRESSIONS = ['o.id::text', 'c.name', 'sup.name'] as const;

const PG_FOREIGN_KEY_VIOLATION = '23503';

@Injectable()
export class OrdersService {
  constructor(private readonly db: DatabaseService) {}

  /** Opens a new order; the handler is always the signed-in user. */
  async create(dto: CreateOrderDto, handlerUserId: number): Promise<OrderDto> {
    assertIncotermMatchesPaymentTerms(dto.paymentTerms, dto.incoterm);
    await this.assertCustomerUsable(dto.customerId);
    if (dto.supplierId !== undefined) {
      await this.assertSupplierUsable(dto.supplierId);
    }

    const keys = WRITABLE_KEYS.filter((key) => dto[key] !== undefined);
    const columns = keys.map((key) => WRITABLE_COLUMNS[key]);
    const values: unknown[] = keys.map((key) => dto[key]);

    columns.push('handler_user_id');
    values.push(handlerUserId);

    const placeholders = values.map((_, i) => `$${i + 1}`);
    const sql = `INSERT INTO orders (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`;

    let inserted: { id: number } | null;
    try {
      inserted = await this.db.queryOne<{ id: number }>(sql, values);
    } catch (err) {
      throw translateForeignKeyError(err);
    }
    if (!inserted) {
      throw new BadRequestException('Order was not created');
    }
    return this.findById(inserted.id);
  }

  async findAll(query: ListOrdersQuery): Promise<OrderDto[]> {
    const where: string[] = [];
    const params: unknown[] = [];

    if (!query.includeInactive) {
      where.push('o."isActive"');
    }
    if (query.customerId !== undefined) {
      params.push(query.customerId);
      where.push(`o.customer_id = $${params.length}`);
    }
    if (query.handlerUserId !== undefined) {
      params.push(query.handlerUserId);
      where.push(`o.handler_user_id = $${params.length}`);
    }
    if (query.handlerName !== undefined) {
      params.push(`%${query.handlerName}%`);
      where.push(`u.name ILIKE $${params.length}`);
    }
    if (query.supplierId !== undefined) {
      params.push(query.supplierId);
      where.push(`o.supplier_id = $${params.length}`);
    }
    if (query.hasCase !== undefined) {
      where.push(query.hasCase ? 'o.case_id IS NOT NULL' : 'o.case_id IS NULL');
    }
    if (query.hasHbl !== undefined) {
      where.push(query.hasHbl ? 'o.hbl_id IS NOT NULL' : 'o.hbl_id IS NULL');
    }
    if (query.status !== undefined) {
      params.push(query.status);
      where.push(`o.status = $${params.length}`);
    }
    if (query.createdDate !== undefined) {
      params.push(query.createdDate);
      where.push(`o.created_at::date = $${params.length}::date`);
    }

    params.push(query.limit ?? 50);
    const limitIdx = params.length;
    params.push(query.offset ?? 0);
    const offsetIdx = params.length;

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const sql = `${ORDER_SELECT}
      ${whereClause}
      ORDER BY o.id DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`;

    const rows = await this.db.query<OrderRow>(sql, params);
    return rows.map(toOrderDto);
  }

  /**
   * "ההזמנות שלי" — one page of the active orders handled by `handlerUserId`
   * (the signed-in user), with free-text search, status/customer filters, a
   * `created_at` date range and whitelisted sorting.
   */
  async findMyOrdersPaged(
    query: PagedOrdersQuery,
    handlerUserId: number,
  ): Promise<Paged<OrderDto>> {
    const params: unknown[] = [handlerUserId];
    const where: string[] = ['o."isActive"', 'o.handler_user_id = $1'];

    pushTextSearch(where, params, ORDER_SEARCH_EXPRESSIONS, query.q);
    if (query.status !== undefined) {
      params.push(query.status);
      where.push(`o.status = $${params.length}`);
    }
    if (query.customerId !== undefined) {
      params.push(query.customerId);
      where.push(`o.customer_id = $${params.length}`);
    }
    pushDateRange(where, params, 'o.created_at', query.from, query.to);

    const window = pageWindow(query);
    params.push(window.limit);
    const limitIdx = params.length;
    params.push(window.offset);
    const offsetIdx = params.length;

    const sql = `${ORDER_SELECT_PAGED}
      WHERE ${where.join(' AND ')}
      ${orderByClause(ORDER_SORT_COLUMNS, query.sort, 'createdAt', query.dir, 'desc', 'o.id DESC')}
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`;

    const rows = await this.db.query<OrderRow & WithTotal>(sql, params);
    return toPaged(rows, window, toOrderDto);
  }

  async findById(id: number): Promise<OrderDto> {
    const row = await this.db.queryOne<OrderRow>(
      `${ORDER_SELECT} WHERE o.id = $1`,
      [id],
    );
    if (!row) {
      throw new NotFoundException(`Order ${id} not found`);
    }
    return toOrderDto(row);
  }

  /** Patches only the provided fields; id / created_at / handler are immutable. */
  async update(id: number, dto: UpdateOrderDto): Promise<OrderDto> {
    const existing = await this.findById(id);

    const keys = WRITABLE_KEYS.filter((key) => dto[key] !== undefined);
    if (keys.length === 0) {
      return existing;
    }

    assertIncotermMatchesPaymentTerms(
      dto.paymentTerms ?? existing.paymentTerms,
      dto.incoterm ?? existing.incoterm,
    );
    if (
      dto.customerId !== undefined &&
      dto.customerId !== existing.customerId
    ) {
      await this.assertCustomerUsable(dto.customerId);
    }
    if (
      dto.supplierId !== undefined &&
      dto.supplierId !== existing.supplierId
    ) {
      await this.assertSupplierUsable(dto.supplierId);
    }

    const params: unknown[] = [];
    const sets = keys.map((key) => {
      params.push(dto[key]);
      return `${WRITABLE_COLUMNS[key]} = $${params.length}`;
    });
    sets.push('updated_at = now()');
    params.push(id);

    let updated: { id: number } | null;
    try {
      updated = await this.db.queryOne<{ id: number }>(
        `UPDATE orders SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING id`,
        params,
      );
    } catch (err) {
      throw translateForeignKeyError(err);
    }
    if (!updated) {
      throw new NotFoundException(`Order ${id} not found`);
    }
    return this.findById(id);
  }

  /** Soft delete. */
  async remove(id: number): Promise<void> {
    const row = await this.db.queryOne<{ id: number }>(
      `UPDATE orders SET "isActive" = false, updated_at = now() WHERE id = $1 AND "isActive" RETURNING id`,
      [id],
    );
    if (!row) {
      throw new NotFoundException(`Order ${id} not found`);
    }
  }

  private async assertCustomerUsable(customerId: number): Promise<void> {
    const customer = await this.db.queryOne<{ id: number; isActive: boolean }>(
      'SELECT id, "isActive" FROM customers WHERE id = $1',
      [customerId],
    );
    if (!customer) {
      throw new NotFoundException(`Customer ${customerId} not found`);
    }
    if (!customer.isActive) {
      throw new BadRequestException(`Customer ${customerId} is inactive`);
    }
  }

  private async assertSupplierUsable(supplierId: number): Promise<void> {
    const supplier = await this.db.queryOne<{ id: number; isActive: boolean }>(
      'SELECT id, "isActive" FROM suppliers WHERE id = $1',
      [supplierId],
    );
    if (!supplier) {
      throw new NotFoundException(`Supplier ${supplierId} not found`);
    }
    if (!supplier.isActive) {
      throw new BadRequestException(`Supplier ${supplierId} is inactive`);
    }
  }
}

function assertIncotermMatchesPaymentTerms(
  paymentTerms: PaymentTerms,
  incoterm: Incoterm,
): void {
  const allowed = INCOTERMS_BY_PAYMENT_TERMS[paymentTerms] ?? [];
  if (!allowed.includes(incoterm)) {
    throw new BadRequestException(
      `Incoterm ${incoterm} is not valid for payment terms ${paymentTerms}; ` +
        `allowed: ${allowed.join(', ')}`,
    );
  }
}

function translateForeignKeyError(err: unknown): unknown {
  const code = (err as { code?: unknown } | null)?.code;
  if (code === PG_FOREIGN_KEY_VIOLATION) {
    return new BadRequestException('Referenced customer does not exist');
  }
  return err;
}

function toIsoString(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function toOrderDto(row: OrderRow): OrderDto {
  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name ?? null,
    handlerUserId: row.handler_user_id ?? null,
    handlerName: row.handler_name ?? null,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    status: row.status,
    shipmentType: row.shipment_type,
    paymentTerms: row.payment_terms,
    incoterm: row.incoterm,
    destination: row.destination,
    supplierId: row.supplier_id ?? null,
    supplierName: row.supplier_name ?? null,
    factoryReadyDate: row.factory_ready_date ?? null,
    factoryPickupDate: row.factory_pickup_date ?? null,
    departureDate: row.departure_date ?? null,
    etaDate: row.eta_date ?? null,
    shippingLine: row.shipping_line ?? null,
    voyageNumber: row.voyage_number ?? null,
    airline: row.airline ?? null,
    flightNumber: row.flight_number ?? null,
    isActive: row.is_active,
    mblId: row.mbl_id ?? null,
  };
}
