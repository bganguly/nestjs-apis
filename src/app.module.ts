import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { DynamoDbModule } from './dynamodb/dynamodb.module';
import { validateEnv } from './config/env.validation';
import { HealthController } from './health/health.controller';
import { ProductsModule } from './products/products.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    DynamoDbModule,
    ProductsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
