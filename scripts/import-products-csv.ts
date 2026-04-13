import 'dotenv/config';

import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BatchWriteCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { parse } from 'csv-parse';

type GenericRow = Record<string, string | undefined>;

async function main(): Promise<void> {
  const tableName = process.env.DYNAMODB_TABLE_NAME ?? 'Products';
  const region = process.env.AWS_REGION ?? 'us-east-1';
  const endpoint = process.env.AWS_ENDPOINT;

  const args = parseArgs(process.argv.slice(2));
  if (!args.file) {
    throw new Error('Usage: npm run import:csv -- --file=./data/products.csv');
  }

  const client = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region, endpoint }),
    {
      marshallOptions: { removeUndefinedValues: true },
    },
  );

  const parser = createReadStream(args.file).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      trim: true,
    }),
  );

  let batch: Array<{ PutRequest: { Item: Record<string, unknown> } }> = [];
  let total = 0;

  for await (const row of parser) {
    const mapped = mapRow(row as GenericRow);

    batch.push({ PutRequest: { Item: mapped } });

    if (batch.length === 25) {
      await writeBatchWithRetry(client, tableName, batch);
      total += batch.length;
      batch = [];
      console.log(`Imported ${total} rows`);
    }
  }

  if (batch.length > 0) {
    await writeBatchWithRetry(client, tableName, batch);
    total += batch.length;
  }

  console.log(`Done. Imported ${total} rows from ${args.file}`);
}

function mapRow(row: GenericRow): Record<string, unknown> {
  const productId = randomUUID();
  const title = pickField(row, ['title', 'name', 'product_name']) ?? `Product ${productId.slice(0, 8)}`;
  const brand = pickField(row, ['brand', 'maker', 'manufacturer']) ?? 'Unknown Brand';
  const category = pickField(row, ['category', 'department']) ?? 'general';
  const subcategory = pickField(row, ['subcategory', 'sub_category', 'segment']);
  const price = parsePrice(pickField(row, ['price', 'list_price', 'current_price'])) ?? 0;
  const rating = parseNumber(pickField(row, ['rating', 'stars']));
  const ratingCount = parseNumber(pickField(row, ['rating_count', 'reviews', 'review_count']));
  const imageUrl = pickField(row, ['image', 'image_url', 'thumbnail']);
  const description = pickField(row, ['description', 'about']);
  const seller = pickField(row, ['seller', 'store']);
  const now = new Date().toISOString();

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
    rating,
    ratingCount,
    inStock: true,
    imageUrl,
    description,
    seller,
    tags: [],
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

function pickField(row: GenericRow, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = row[key];
    if (value && value.trim() !== '') {
      return value;
    }
  }

  return undefined;
}

function parsePrice(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return Number(parsed.toFixed(2));
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value.replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseArgs(args: string[]): { file?: string } {
  const result: { file?: string } = {};

  for (const arg of args) {
    if (arg.startsWith('--file=')) {
      result.file = arg.split('=')[1];
    }
  }

  return result;
}

async function writeBatchWithRetry(
  client: DynamoDBDocumentClient,
  tableName: string,
  batch: Array<{ PutRequest: { Item: Record<string, unknown> } }>,
): Promise<void> {
  let requestItems = {
    [tableName]: batch,
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
      throw new Error(`Exceeded retries with ${unprocessed.length} unprocessed rows`);
    }

    const waitMs = Math.min(1000, 25 * 2 ** attempts);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    requestItems = { [tableName]: unprocessed };
  }
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
