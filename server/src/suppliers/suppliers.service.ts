import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { SupplierDto } from './dto/supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

/** Raw `suppliers` row as returned by `pg` (quoted column keeps its case). */
export interface SupplierRow {
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
export class SuppliersService {
  constructor(private readonly db: DatabaseService) {}

  /** Active suppliers whose name contains `q` (case-insensitive), by name. */
  async search(q: string, limit: number): Promise<SupplierDto[]> {
    const pattern = `%${escapeLikePattern(q.trim())}%`;
    const rows = await this.db.query<SupplierRow>(
      `SELECT ${COLUMNS}
         FROM suppliers
        WHERE "isActive" AND name ILIKE $1 ESCAPE '\\'
        ORDER BY name
        LIMIT $2`,
      [pattern, limit],
    );
    return rows.map(toDto);
  }

  async findById(id: number): Promise<SupplierDto> {
    const row = await this.db.queryOne<SupplierRow>(
      `SELECT ${COLUMNS} FROM suppliers WHERE id = $1`,
      [id],
    );
    if (!row) throw new NotFoundException(`Supplier ${id} not found`);
    return toDto(row);
  }

  async create(dto: CreateSupplierDto): Promise<SupplierDto> {
    const row = await this.db.queryOne<SupplierRow>(
      `INSERT INTO suppliers (name, address, phone, email)
       VALUES ($1, $2, $3, $4)
       RETURNING ${COLUMNS}`,
      [dto.name, dto.address ?? null, dto.phone ?? null, dto.email ?? null],
    );
    if (!row) throw new Error('INSERT INTO suppliers returned no row');
    return toDto(row);
  }

  /** Writes only the fields present in `dto`; an empty patch just re-reads (still 404s). */
  async update(id: number, dto: UpdateSupplierDto): Promise<SupplierDto> {
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
    const row = await this.db.queryOne<SupplierRow>(
      `UPDATE suppliers
          SET ${assignments.join(', ')}
        WHERE id = $${params.length}
        RETURNING ${COLUMNS}`,
      params,
    );
    if (!row) throw new NotFoundException(`Supplier ${id} not found`);
    return toDto(row);
  }
}

function toDto(row: SupplierRow): SupplierDto {
  const dto = new SupplierDto();
  dto.id = row.id;
  dto.name = row.name;
  dto.address = row.address ?? null;
  dto.phone = row.phone ?? null;
  dto.email = row.email ?? null;
  dto.isActive = row.isActive;
  return dto;
}
