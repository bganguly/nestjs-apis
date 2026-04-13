type Env = {
  PORT?: string;
  AWS_REGION?: string;
  AWS_ENDPOINT?: string;
  DYNAMODB_TABLE_NAME?: string;
};

export function validateEnv(config: Record<string, unknown>): Env {
  const tableName = String(config.DYNAMODB_TABLE_NAME ?? 'Products').trim();
  if (tableName === '') {
    throw new Error('DYNAMODB_TABLE_NAME cannot be empty.');
  }

  return {
    PORT: config.PORT as string | undefined,
    AWS_REGION: (config.AWS_REGION as string | undefined) ?? 'us-east-1',
    AWS_ENDPOINT: config.AWS_ENDPOINT as string | undefined,
    DYNAMODB_TABLE_NAME: tableName,
  };
}
