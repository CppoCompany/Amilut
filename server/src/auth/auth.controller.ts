import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { toPublicUser } from './auth.types';
import type { JwtPayload, LoginResponse, PublicUser } from './auth.types';
import { CurrentUser } from './current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { Public } from './public.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** The only unauthenticated API besides the liveness check. */
  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() body: LoginDto): Promise<LoginResponse> {
    return this.authService.login(body.email, body.password);
  }

  /** Protected by the global JwtAuthGuard. */
  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: JwtPayload): { user: PublicUser } {
    return { user: toPublicUser(user) };
  }
}
