import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { toPublicUser } from './auth.types';
import type { JwtPayload, LoginResponse, PublicUser } from './auth.types';
import { CurrentUser } from './current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() body: LoginDto): Promise<LoginResponse> {
    return this.authService.login(body.email, body.password);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: JwtPayload): { user: PublicUser } {
    return { user: toPublicUser(user) };
  }
}
