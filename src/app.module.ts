import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { DynamoDbModule } from './dynamodb/dynamodb.module';
import { validateEnv } from './config/env.validation';
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
})
export class AppModule {}
