import { IsEmail, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  /** User name is the account email. */
  @IsEmail()
  email!: string;

  /** Not verified yet; accepted so the client can send it once passwords exist. */
  @IsOptional()
  @IsString()
  password?: string;
}
