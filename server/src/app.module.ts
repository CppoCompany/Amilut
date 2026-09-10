import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { OrdersModule } from './orders/orders.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), AuthModule, OrdersModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
