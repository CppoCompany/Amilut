import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../database/database.service';
import { AuthUser, LoginResponse, toPublicUser } from './auth.types';

/** Row shape read from the `users` table for sign-in. */
interface UserRow {
  id: number;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly db: DatabaseService,
  ) {}

  /**
   * Signs a user in by email. The account must exist in `users` and be active;
   * the password is accepted but NOT verified yet — password checks are a
   * follow-up. The issued JWT carries the user's database id as `sub`, so
   * protected endpoints can attribute writes (e.g. orders.handler_user_id).
   */
  async login(rawEmail: string, password?: string): Promise<LoginResponse> {
    void password; // accepted, not verified yet
    const email = rawEmail.trim().toLowerCase();
    this.assertAllowed(email);

    const row = await this.db.queryOne<UserRow>(
      `SELECT id, name, email, role, "isActive"
         FROM users
        WHERE lower(email) = $1`,
      [email],
    );
    if (!row || !row.isActive) {
      this.logger.warn(`Rejected login for ${email}: unknown or inactive user`);
      throw new UnauthorizedException('Unknown user');
    }

    await this.db.query('UPDATE users SET last_login = now() WHERE id = $1', [
      row.id,
    ]);

    const user: AuthUser = {
      sub: row.id,
      email: row.email.toLowerCase(),
      name: row.name,
      role: row.role,
    };

    const accessToken = await this.jwt.signAsync(user);
    return { accessToken, user: toPublicUser(user) };
  }

  /** Applies ALLOWED_EMAILS / ALLOWED_DOMAIN restrictions when configured. */
  private assertAllowed(email: string): void {
    const allowedEmails = this.parseList(
      this.config.get<string>('ALLOWED_EMAILS'),
    );
    const allowedDomain = this.config
      .get<string>('ALLOWED_DOMAIN')
      ?.trim()
      .toLowerCase();

    if (allowedEmails.length > 0 && !allowedEmails.includes(email)) {
      this.logger.warn(`Rejected login for ${email}: not in ALLOWED_EMAILS`);
      throw new ForbiddenException('This account is not allowed');
    }

    if (allowedDomain && (email.split('@')[1] ?? '') !== allowedDomain) {
      this.logger.warn(`Rejected login for ${email}: domain not allowed`);
      throw new ForbiddenException('This account is not allowed');
    }
  }

  private parseList(raw: string | undefined): string[] {
    return (raw ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0);
  }
}
