import { NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export async function assertCustomerExists(db: DatabaseService, customerId: number): Promise<void> {
  const row = await db.queryOne<{ id: number }>('SELECT id FROM customers WHERE id = $1', [
    customerId,
  ]);
  if (!row) {
    throw new NotFoundException(`Customer ${customerId} not found`);
  }
}

/** Throws NotFoundException listing any id in `orderIds` that doesn't exist.
 *  Takes a query callback (rather than `DatabaseService` directly) so it can
 *  run against either a plain connection or a transaction's `PoolClient`. */
export async function assertOrdersExist(
  query: (sql: string, params: unknown[]) => Promise<{ id: number }[]>,
  orderIds: number[],
): Promise<void> {
  if (orderIds.length === 0) return;
  const found = await query('SELECT id FROM orders WHERE id = ANY($1)', [orderIds]);
  const foundIds = new Set(found.map((row) => row.id));
  const missing = orderIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    throw new NotFoundException(`Order(s) not found: ${missing.join(', ')}`);
  }
}
