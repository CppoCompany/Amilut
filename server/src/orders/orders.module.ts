import { Module } from '@nestjs/common';
import { AirModule } from '../air/air.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

/** DatabaseService is a global provider, so no database module import is needed. */
@Module({
  imports: [AirModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
