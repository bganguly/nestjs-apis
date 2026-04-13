import { DynamoDBClient, DynamoDBClientConfig } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DynamoDbService {
  private readonly documentClient: DynamoDBDocumentClient;

  constructor(private readonly configService: ConfigService) {
    const clientConfig: DynamoDBClientConfig = {
      region: this.configService.get<string>('AWS_REGION', 'us-east-1'),
    };

    const endpoint = this.configService.get<string>('AWS_ENDPOINT');
    if (endpoint) {
      clientConfig.endpoint = endpoint;
    }

    const lowLevelClient = new DynamoDBClient(clientConfig);

    this.documentClient = DynamoDBDocumentClient.from(lowLevelClient, {
      marshallOptions: {
        removeUndefinedValues: true,
      },
    });
  }

  get tableName(): string {
    return this.configService.getOrThrow<string>('DYNAMODB_TABLE_NAME');
  }

  get client(): DynamoDBDocumentClient {
    return this.documentClient;
  }
}
