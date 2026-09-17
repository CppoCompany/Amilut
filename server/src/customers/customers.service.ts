import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CustomerDto } from './dto/customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

/** Raw `customers` row as returned by `pg` (quoted column keeps its case). */
export interface CustomerRow {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
}

const COLUMNS = 'id, name, address, phone, email, "isActive"';

/** Escapes LIKE/ILIKE metacharacters so user input matches literally. */
export function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, '\\$&');
}

@Injectable()
export class CustomersService {
  constructor(private readonly db: DatabaseService) {}

  /** Active customers whose name contains `q` (case-insensitive), by name. */
  async search(q: string, limit: number): Promise<CustomerDto[]> {
    const pattern = `%${escapeLikePattern(q.trim())}%`;
    const rows = await this.db.query<CustomerRow>(
      `SELECT ${COLUMNS}
         FROM customers
        WHERE "isActive" AND name ILIKE $1 ESCAPE '\\'
        ORDER BY name
        LIMIT $2`,
      [pattern, limit],
    );
    return rows.map(toDto);
  }

  async findById(id: number): Promise<CustomerDto> {
    const row = await this.db.queryOne<CustomerRow>(
      `SELECT ${COLUMNS} FROM customers WHERE id = $1`,
      [id],
    );
    if (!row) throw new NotFoundException(`Customer ${id} not found`);
    return toDto(row);
  }

  async create(dto: CreateCustomerDto): Promise<CustomerDto> {
    const row = await this.db.queryOne<CustomerRow>(
      `INSERT INTO customers (name, address, phone, email)
       VALUES ($1, $2, $3, $4)
       RETURNING ${COLUMNS}`,
      [dto.name, dto.address ?? null, dto.phone ?? null, dto.email ?? null],
    );
    if (!row) throw new Error('INSERT INTO customers returned no row');
    return toDto(row);
  }

  /** Writes only the fields present in `dto`; an empty patch just re-reads (still 404s). */
  async update(id: number, dto: UpdateCustomerDto): Promise<CustomerDto> {
    const assignments: string[] = [];
    const params: unknown[] = [];
    const set = (column: string, value: unknown): void => {
      params.push(value);
      assignments.push(`${column} = $${params.length}`);
    };

    if (dto.name !== undefined) set('name', dto.name);
    if (dto.address !== undefined) set('address', dto.address);
    if (dto.phone !== undefined) set('phone', dto.phone);
    if (dto.email !== undefined) set('email', dto.email);
    if (dto.isActive !== undefined) set('"isActive"', dto.isActive);

    if (assignments.length === 0) return this.findById(id);

    params.push(id);
    const row = await this.db.queryOne<CustomerRow>(
      `UPDATE customers
          SET ${assignments.join(', ')}
        WHERE id = $${params.length}
        RETURNING ${COLUMNS}`,
      params,
    );
    if (!row) throw new NotFoundException(`Customer ${id} not found`);
    return toDto(row);
  }
}

function toDto(row: CustomerRow): CustomerDto {
  const dto = new CustomerDto();
  dto.id = row.id;
  dto.name = row.name;
  dto.address = row.address ?? null;
  dto.phone = row.phone ?? null;
  dto.email = row.email ?? null;
  dto.isActive = row.isActive;
  return dto;
}
