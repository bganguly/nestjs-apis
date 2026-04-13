import 'dotenv/config';

import { randomUUID } from 'node:crypto';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BatchWriteCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { faker } from '@faker-js/faker';

type ProductSeedRow = {
  pk: string;
  sk: string;
  productId: string;
  title: string;
  brand: string;
  category: string;
  subcategory?: string;
  price: number;
  currency: string;
  rating: number;
  ratingCount: number;
  inStock: boolean;
  imageUrl: string;
  description: string;
  seller: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  gsi1pk: string;
  gsi1sk: string;
  gsi2pk: string;
  gsi2sk: string;
  gsi3pk: string;
  gsi3sk: string;
};

const categoryConfig: Record<string, { priceMin: number; priceMax: number; subcategories: string[] }> = {
  electronics: {
    priceMin: 20,
    priceMax: 1800,
    subcategories: ['phones', 'laptops', 'audio', 'wearables'],
  },
  fashion: {
    priceMin: 10,
    priceMax: 400,
    subcategories: ['mens', 'womens', 'kids', 'shoes'],
  },
  home: {
    priceMin: 8,
    priceMax: 1200,
    subcategories: ['kitchen', 'furniture', 'decor', 'lighting'],
  },
  beauty: {
    priceMin: 5,
    priceMax: 220,
    subcategories: ['skin-care', 'hair-care', 'makeup', 'fragrance'],
  },
  sports: {
    priceMin: 12,
    priceMax: 700,
    subcategories: ['fitness', 'outdoor', 'cycling', 'running'],
  },
};

async function main(): Promise<void> {
  const tableName = process.env.DYNAMODB_TABLE_NAME;
  const region = process.env.AWS_REGION ?? 'us-east-1';
  const endpoint = process.env.AWS_ENDPOINT;

  if (!tableName) {
    throw new Error('DYNAMODB_TABLE_NAME is required');
  }

  const args = parseArgs(process.argv.slice(2));
  const totalCount = args.count ?? 1000;
  const batchSize = Math.min(args.batch ?? 25, 25);

  const client = DynamoDBDocumentClient.from(
    new DynamoDBClient({
      region,
      endpoint,
    }),
    {
      marshallOptions: { removeUndefinedValues: true },
    },
  );

  let written = 0;
  while (written < totalCount) {
    const chunkSize = Math.min(batchSize, totalCount - written);
    const rows = Array.from({ length: chunkSize }, () => buildProduct());

    await writeBatchWithRetry(client, tableName, rows);

    written += chunkSize;
    console.log(`Seeded ${written}/${totalCount}`);
  }

  console.log(`Done. Seeded ${totalCount} synthetic products into ${tableName}`);
}

function buildProduct(): ProductSeedRow {
  const category = faker.helpers.arrayElement(Object.keys(categoryConfig));
  const config = categoryConfig[category];
  const subcategory = faker.helpers.arrayElement(config.subcategories);
  const productId = randomUUID();
  const brand = faker.company.name();
  const title = `${faker.commerce.productAdjective()} ${subcategory} ${faker.commerce.productMaterial()}`;
  const now = faker.date.recent({ days: 120 }).toISOString();
  const price = Number(faker.commerce.price({ min: config.priceMin, max: config.priceMax, dec: 2 }));

  return {
    pk: `PRODUCT#${productId}`,
    sk: 'META',
    productId,
    title,
    brand,
    category,
    subcategory,
    price,
    currency: 'USD',
    rating: Number(faker.number.float({ min: 2.5, max: 5, fractionDigits: 1 }).toFixed(1)),
    ratingCount: faker.number.int({ min: 0, max: 50000 }),
    inStock: faker.datatype.boolean(0.88),
    imageUrl: faker.image.urlPicsumPhotos({ width: 800, height: 800 }),
    description: faker.commerce.productDescription(),
    seller: faker.company.name(),
    tags: faker.helpers.arrayElements(
      ['new-arrival', 'trending', 'top-rated', 'budget', 'premium', 'eco', 'giftable'],
      faker.number.int({ min: 1, max: 4 }),
    ),
    createdAt: now,
    updatedAt: now,
    gsi1pk: `CATEGORY#${slugify(category)}`,
    gsi1sk: `PRICE#${priceSortKey(price)}#${productId}`,
    gsi2pk: `BRAND#${slugify(brand)}`,
    gsi2sk: `CREATED#${now}#${productId}`,
    gsi3pk: 'ALL_PRODUCTS',
    gsi3sk: `CREATED#${now}#${productId}`,
  };
}

async function writeBatchWithRetry(
  client: DynamoDBDocumentClient,
  tableName: string,
  rows: ProductSeedRow[],
): Promise<void> {
  let requestItems = {
    [tableName]: rows.map((row) => ({
      PutRequest: {
        Item: row,
      },
    })),
  };

  let attempts = 0;
  while (true) {
    const response = await client.send(
      new BatchWriteCommand({
        RequestItems: requestItems,
      }),
    );

    const unprocessed = response.UnprocessedItems?.[tableName] ?? [];
    if (unprocessed.length === 0) {
      return;
    }

    attempts += 1;
    if (attempts > 10) {
      throw new Error(`Exceeded retries with ${unprocessed.length} unprocessed items`);
    }

    const waitMs = Math.min(1000, 25 * 2 ** attempts);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    requestItems = { [tableName]: unprocessed };
  }
}

function parseArgs(args: string[]): { count?: number; batch?: number } {
  const result: { count?: number; batch?: number } = {};

  for (const arg of args) {
    if (arg.startsWith('--count=')) {
      result.count = Number(arg.split('=')[1]);
    }

    if (arg.startsWith('--batch=')) {
      result.batch = Number(arg.split('=')[1]);
    }
  }

  return result;
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

void main();
