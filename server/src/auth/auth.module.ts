import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error(
            'JWT_SECRET is not set; refusing to start without a signing secret',
          );
        }
        // zeit/ms format (e.g. "8h", "30m", "7d"); validated at sign time by jsonwebtoken.
        const expiresIn = (config.get<string>('JWT_EXPIRES_IN') ||
          '8h') as JwtSignOptions['expiresIn'];
        return { secret, signOptions: { expiresIn } };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  exports: [AuthService, JwtAuthGuard, JwtModule],
})
export class AuthModule {}
