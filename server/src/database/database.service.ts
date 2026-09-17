import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';

/**
 * Thin wrapper around a `pg` connection pool. Feature services run parameterised
 * SQL through {@link query}; use {@link transaction} when several statements
 * must commit or roll back together.
 *
 * Connection settings (env, with defaults matching SQL-Migration/README.md):
 *   PGHOST=127.0.0.1  PGPORT=5432  PGUSER=Admin  PGPASSWORD=Admin  PGDATABASE=Amilut
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;

  constructor(config: ConfigService) {
    this.pool = new Pool({
      host: config.get<string>('PGHOST') || '127.0.0.1',
      port: Number(config.get<string>('PGPORT') || 5432),
      user: config.get<string>('PGUSER') || 'Admin',
      password: config.get<string>('PGPASSWORD') || 'Admin',
      database: config.get<string>('PGDATABASE') || 'Amilut',
      max: 10,
    });
    this.pool.on('error', (err) =>
      this.logger.error(`Idle client error: ${err.message}`),
    );
  }

  async onModuleInit(): Promise<void> {
    // Fail fast with a readable message if the database is unreachable.
    try {
      await this.pool.query('SELECT 1');
      this.logger.log('Connected to PostgreSQL');
    } catch (err) {
      this.logger.error(
        `Cannot reach PostgreSQL: ${(err as Error).message}. ` +
          'Check PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE and run `npm run db:generate`.',
      );
      throw err;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  /** Runs one parameterised statement and returns its rows. */
  async query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<T[]> {
    const result = await this.pool.query<T>(sql, params as unknown[]);
    return result.rows;
  }

  /** Runs one parameterised statement and returns the first row, or `null`. */
  async queryOne<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  /** Runs `work` inside BEGIN/COMMIT, rolling back if it throws. */
  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
