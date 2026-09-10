import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthUser, LoginResponse, toPublicUser } from './auth.types';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Signs a user in by email. The password is accepted but NOT verified yet —
   * password checks (against the `users` table) are a follow-up.
   */
  async login(rawEmail: string, _password?: string): Promise<LoginResponse> {
    const email = rawEmail.trim().toLowerCase();
    this.assertAllowed(email);

    const user: AuthUser = {
      sub: email,
      email,
      name: this.displayNameFor(email),
    };

    const accessToken = await this.jwt.signAsync(user);
    return { accessToken, user: toPublicUser(user) };
  }

  /** Derives a readable name from the email local part, e.g. "john.doe" → "John Doe". */
  private displayNameFor(email: string): string {
    const local = email.split('@')[0] ?? email;
    const name = local
      .split(/[._-]+/)
      .filter((part) => part.length > 0)
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join(' ');
    return name || email;
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
