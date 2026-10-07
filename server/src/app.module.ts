import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { CountriesModule } from './countries/countries.module';
import { CustomersModule } from './customers/customers.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DatabaseModule } from './database/database.module';
import { ImportFilesModule } from './import-files/import-files.module';
import { MblModule } from './mbl/mbl.module';
import { OrdersModule } from './orders/orders.module';
import { SuppliersModule } from './suppliers/suppliers.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuthModule,
    CountriesModule,
    CustomersModule,
    DashboardModule,
    ImportFilesModule,
    MblModule,
    OrdersModule,
    SuppliersModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Every /api route requires a bearer token unless decorated with @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
