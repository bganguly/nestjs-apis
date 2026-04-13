type Env = {
  PORT?: string;
  AWS_REGION?: string;
  AWS_ENDPOINT?: string;
  DYNAMODB_TABLE_NAME?: string;
};

export function validateEnv(config: Record<string, unknown>): Env {
  if (!config.DYNAMODB_TABLE_NAME || String(config.DYNAMODB_TABLE_NAME).trim() === '') {
    throw new Error('DYNAMODB_TABLE_NAME is required.');
  }

  return {
    PORT: config.PORT as string | undefined,
    AWS_REGION: (config.AWS_REGION as string | undefined) ?? 'us-east-1',
    AWS_ENDPOINT: config.AWS_ENDPOINT as string | undefined,
    DYNAMODB_TABLE_NAME: config.DYNAMODB_TABLE_NAME as string,
  };
}
