import 'dotenv/config';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, QueryCommandInput } from '@aws-sdk/lib-dynamodb';

async function main(): Promise<void> {
  const tableName = process.env.DYNAMODB_TABLE_NAME ?? 'Products';
  const region = process.env.AWS_REGION ?? 'us-east-1';
  const endpoint = process.env.AWS_ENDPOINT;

  const args = parseArgs(process.argv.slice(2));

  const client = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region, endpoint }),
    {
      marshallOptions: { removeUndefinedValues: true },
    },
  );

  const total = await countRows(client, tableName, args);

  if (args.category) {
    console.log(`Total rows available for category=${args.category}: ${total}`);
  } else {
    console.log(`Total rows available: ${total}`);
  }
}

async function countRows(
  client: DynamoDBDocumentClient,
  tableName: string,
  args: { category?: string; minPrice?: number; maxPrice?: number },
): Promise<number> {
  const minPrice = args.minPrice ?? 0;
  const maxPrice = args.maxPrice ?? 9999999;

  let input: QueryCommandInput;

  if (args.category) {
    input = {
      TableName: tableName,
      IndexName: 'GSI1',
      KeyConditionExpression: '#gsi1pk = :category AND #gsi1sk BETWEEN :minPriceKey AND :maxPriceKey',
      ExpressionAttributeNames: {
        '#gsi1pk': 'gsi1pk',
        '#gsi1sk': 'gsi1sk',
      },
      ExpressionAttributeValues: {
        ':category': `CATEGORY#${slugify(args.category)}`,
        ':minPriceKey': `PRICE#${priceSortKey(minPrice)}#`,
        ':maxPriceKey': `PRICE#${priceSortKey(maxPrice)}#~`,
      },
      Select: 'COUNT',
    };
  } else {
    input = {
      TableName: tableName,
      IndexName: 'GSI3',
      KeyConditionExpression: '#gsi3pk = :allProducts',
      ExpressionAttributeNames: {
        '#gsi3pk': 'gsi3pk',
      },
      ExpressionAttributeValues: {
        ':allProducts': 'ALL_PRODUCTS',
      },
      Select: 'COUNT',
    };
  }

  let total = 0;
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const response = await client.send(
      new QueryCommand({
        ...input,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    total += response.Count ?? 0;
    exclusiveStartKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  return total;
}

function parseArgs(args: string[]): { category?: string; minPrice?: number; maxPrice?: number } {
  const result: { category?: string; minPrice?: number; maxPrice?: number } = {};

  for (const arg of args) {
    if (arg.startsWith('--category=')) {
      result.category = arg.split('=')[1];
    }

    if (arg.startsWith('--minPrice=')) {
      result.minPrice = Number(arg.split('=')[1]);
    }

    if (arg.startsWith('--maxPrice=')) {
      result.maxPrice = Number(arg.split('=')[1]);
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
