import 'dotenv/config';

import { DeleteTableCommand, DescribeTableCommand, DynamoDBClient, ResourceNotFoundException } from '@aws-sdk/client-dynamodb';

async function main(): Promise<void> {
  const tableName = process.env.DYNAMODB_TABLE_NAME;
  const region = process.env.AWS_REGION ?? 'us-east-1';
  const endpoint = process.env.AWS_ENDPOINT;

  if (!tableName) {
    throw new Error('DYNAMODB_TABLE_NAME is required');
  }

  const client = new DynamoDBClient({
    region,
    endpoint,
  });

  try {
    await client.send(
      new DeleteTableCommand({
        TableName: tableName,
      }),
    );

    console.log(`Delete requested for table ${tableName}`);
  } catch (error) {
    if (error instanceof ResourceNotFoundException) {
      console.log(`Table ${tableName} does not exist`);
      return;
    }

    throw error;
  }

  await waitUntilDeleted(client, tableName);
  console.log(`Table ${tableName} deleted`);
}

async function waitUntilDeleted(client: DynamoDBClient, tableName: string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await client.send(new DescribeTableCommand({ TableName: tableName }));
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        return;
      }

      throw error;
    }
  }

  throw new Error(`Timed out waiting for deletion of ${tableName}`);
}

void main();
