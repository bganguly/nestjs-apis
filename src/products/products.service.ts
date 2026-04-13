import { randomUUID } from 'node:crypto';

import { PutCommand, GetCommand, QueryCommand, QueryCommandInput } from '@aws-sdk/lib-dynamodb';
import { BadRequestException, Injectable } from '@nestjs/common';

import { DynamoDbService } from '../dynamodb/dynamodb.service';
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsDto } from './dto/list-products.dto';
import { Product } from './models/product.model';

type ProductRow = Product & {
  pk: string;
  sk: string;
  gsi1pk: string;
  gsi1sk: string;
  gsi2pk: string;
  gsi2sk: string;
  gsi3pk: string;
  gsi3sk: string;
};

@Injectable()
export class ProductsService {
  constructor(private readonly dynamoDbService: DynamoDbService) {}

  async create(payload: CreateProductDto): Promise<Product> {
    const now = new Date().toISOString();
    const productId = randomUUID();

    const item: ProductRow = {
      productId,
      title: payload.title,
      brand: payload.brand,
      category: payload.category,
      subcategory: payload.subcategory,
      price: Number(payload.price.toFixed(2)),
      currency: 'USD',
      rating: payload.rating,
      ratingCount: payload.ratingCount,
      inStock: true,
      imageUrl: payload.imageUrl,
      description: payload.description,
      seller: payload.seller,
      tags: payload.tags,
      createdAt: now,
      updatedAt: now,
      pk: this.productPk(productId),
      sk: 'META',
      gsi1pk: `CATEGORY#${slugify(payload.category)}`,
      gsi1sk: `PRICE#${priceSortKey(payload.price)}#${productId}`,
      gsi2pk: `BRAND#${slugify(payload.brand)}`,
      gsi2sk: `CREATED#${now}#${productId}`,
      gsi3pk: 'ALL_PRODUCTS',
      gsi3sk: `CREATED#${now}#${productId}`,
    };

    await this.dynamoDbService.client.send(
      new PutCommand({
        TableName: this.dynamoDbService.tableName,
        Item: item,
        ConditionExpression: 'attribute_not_exists(pk)',
      }),
    );

    return toProduct(item);
  }

  async findById(productId: string): Promise<Product | null> {
    const response = await this.dynamoDbService.client.send(
      new GetCommand({
        TableName: this.dynamoDbService.tableName,
        Key: {
          pk: this.productPk(productId),
          sk: 'META',
        },
      }),
    );

    if (!response.Item) {
      return null;
    }

    return toProduct(response.Item as ProductRow);
  }

  async list(query: ListProductsDto): Promise<{ items: Product[]; nextCursor: string | null; count: number }> {
    const limit = query.limit ?? 20;
    const minPrice = query.minPrice ?? 0;
    const maxPrice = query.maxPrice ?? 9999999;

    if (minPrice > maxPrice) {
      throw new BadRequestException('minPrice cannot be greater than maxPrice');
    }

    let command: QueryCommandInput;
    const exclusiveStartKey = decodeCursor(query.cursor);
    validateCursorForQuery(exclusiveStartKey, query);

    if (query.category) {
      command = {
        TableName: this.dynamoDbService.tableName,
        IndexName: 'GSI1',
        KeyConditionExpression: '#gsi1pk = :category AND #gsi1sk BETWEEN :minPriceKey AND :maxPriceKey',
        ExpressionAttributeNames: {
          '#gsi1pk': 'gsi1pk',
          '#gsi1sk': 'gsi1sk',
        },
        ExpressionAttributeValues: {
          ':category': `CATEGORY#${slugify(query.category)}`,
          ':minPriceKey': `PRICE#${priceSortKey(minPrice)}#`,
          ':maxPriceKey': `PRICE#${priceSortKey(maxPrice)}#~`,
        },
        Limit: limit,
        ExclusiveStartKey: exclusiveStartKey,
        ScanIndexForward: true,
      };
    } else if (query.brand) {
      command = {
        TableName: this.dynamoDbService.tableName,
        IndexName: 'GSI2',
        KeyConditionExpression: '#gsi2pk = :brand',
        ExpressionAttributeNames: {
          '#gsi2pk': 'gsi2pk',
        },
        ExpressionAttributeValues: {
          ':brand': `BRAND#${slugify(query.brand)}`,
        },
        Limit: limit,
        ExclusiveStartKey: exclusiveStartKey,
        ScanIndexForward: false,
      };

      if (query.minPrice !== undefined || query.maxPrice !== undefined) {
        command.FilterExpression = '#price BETWEEN :minPrice AND :maxPrice';
        command.ExpressionAttributeNames = {
          ...(command.ExpressionAttributeNames ?? {}),
          '#price': 'price',
        };
        command.ExpressionAttributeValues = {
          ...(command.ExpressionAttributeValues ?? {}),
          ':minPrice': minPrice,
          ':maxPrice': maxPrice,
        };
      }
    } else {
      command = {
        TableName: this.dynamoDbService.tableName,
        IndexName: 'GSI3',
        KeyConditionExpression: '#gsi3pk = :allProducts',
        ExpressionAttributeNames: {
          '#gsi3pk': 'gsi3pk',
        },
        ExpressionAttributeValues: {
          ':allProducts': 'ALL_PRODUCTS',
        },
        Limit: limit,
        ExclusiveStartKey: exclusiveStartKey,
        ScanIndexForward: false,
      };

      if (query.minPrice !== undefined || query.maxPrice !== undefined) {
        command.FilterExpression = '#price BETWEEN :minPrice AND :maxPrice';
        command.ExpressionAttributeNames = {
          ...(command.ExpressionAttributeNames ?? {}),
          '#price': 'price',
        };
        command.ExpressionAttributeValues = {
          ...(command.ExpressionAttributeValues ?? {}),
          ':minPrice': minPrice,
          ':maxPrice': maxPrice,
        };
      }
    }

    const response = await this.dynamoDbService.client.send(new QueryCommand(command));

    return {
      items: (response.Items as ProductRow[] | undefined)?.map(toProduct) ?? [],
      nextCursor: encodeCursor(response.LastEvaluatedKey),
      count: response.Count ?? 0,
    };
  }

  private productPk(productId: string): string {
    return `PRODUCT#${productId}`;
  }
}

function toProduct(row: ProductRow): Product {
  return {
    productId: row.productId,
    title: row.title,
    brand: row.brand,
    category: row.category,
    subcategory: row.subcategory,
    price: row.price,
    currency: row.currency,
    rating: row.rating,
    ratingCount: row.ratingCount,
    inStock: row.inStock,
    imageUrl: row.imageUrl,
    description: row.description,
    seller: row.seller,
    tags: row.tags,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function priceSortKey(price: number): string {
  const cents = Math.round(price * 100);
  return String(cents).padStart(12, '0');
}

function encodeCursor(lastEvaluatedKey: Record<string, unknown> | undefined): string | null {
  if (!lastEvaluatedKey) {
    return null;
  }

  return Buffer.from(JSON.stringify(lastEvaluatedKey), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string | undefined): Record<string, unknown> | undefined {
  if (!cursor) {
    return undefined;
  }

  try {
    const normalizedCursor = decodeURIComponent(cursor);
    const decoded = Buffer.from(normalizedCursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as unknown;

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid cursor payload');
    }

    return parsed as Record<string, unknown>;
  } catch {
    throw new BadRequestException(
      'Invalid cursor. Use nextCursor exactly as returned by the previous response.',
    );
  }
}

function validateCursorForQuery(cursor: Record<string, unknown> | undefined, query: ListProductsDto): void {
  if (!cursor) {
    return;
  }

  const expectedScope = query.category ? 'category' : query.brand ? 'brand' : 'all';
  const actualScope = inferCursorScope(cursor);

  if (!actualScope || actualScope !== expectedScope) {
    throw new BadRequestException(
      'Cursor does not match this query. Keep the same filters (category/brand/price) used to obtain nextCursor.',
    );
  }

  if (expectedScope === 'category') {
    const expectedCategoryPk = `CATEGORY#${slugify(query.category as string)}`;
    if (cursor.gsi1pk !== expectedCategoryPk) {
      throw new BadRequestException('Cursor category does not match the current category filter.');
    }
  }

  if (expectedScope === 'brand') {
    const expectedBrandPk = `BRAND#${slugify(query.brand as string)}`;
    if (cursor.gsi2pk !== expectedBrandPk) {
      throw new BadRequestException('Cursor brand does not match the current brand filter.');
    }
  }
}

function inferCursorScope(cursor: Record<string, unknown>): 'category' | 'brand' | 'all' | null {
  const hasGsi1 = typeof cursor.gsi1pk === 'string' && typeof cursor.gsi1sk === 'string';
  if (hasGsi1) {
    return 'category';
  }

  const hasGsi2 = typeof cursor.gsi2pk === 'string' && typeof cursor.gsi2sk === 'string';
  if (hasGsi2) {
    return 'brand';
  }

  const hasGsi3 = typeof cursor.gsi3pk === 'string' && typeof cursor.gsi3sk === 'string';
  if (hasGsi3) {
    return 'all';
  }

  return null;
}
