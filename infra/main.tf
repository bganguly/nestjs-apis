data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# ── ECR ────────────────────────────────────────────────────────────────────────

resource "aws_ecr_repository" "app" {
  name                 = "${var.name_prefix}-app"
  image_tag_mutability = "MUTABLE"
  force_delete         = true
  tags                 = { Name = "${var.name_prefix}-app" }
}

resource "aws_ecr_lifecycle_policy" "app" {
  repository = aws_ecr_repository.app.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 3 images"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 3 }
      action       = { type = "expire" }
    }]
  })
}

# ── DynamoDB ───────────────────────────────────────────────────────────────────

resource "aws_dynamodb_table" "products" {
  name         = var.dynamodb_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute { name = "pk";     type = "S" }
  attribute { name = "sk";     type = "S" }
  attribute { name = "gsi1pk"; type = "S" }
  attribute { name = "gsi1sk"; type = "S" }
  attribute { name = "gsi2pk"; type = "S" }
  attribute { name = "gsi2sk"; type = "S" }
  attribute { name = "gsi3pk"; type = "S" }
  attribute { name = "gsi3sk"; type = "S" }

  global_secondary_index {
    name            = "GSI1"
    hash_key        = "gsi1pk"
    range_key       = "gsi1sk"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "GSI2"
    hash_key        = "gsi2pk"
    range_key       = "gsi2sk"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "GSI3"
    hash_key        = "gsi3pk"
    range_key       = "gsi3sk"
    projection_type = "ALL"
  }

  tags = { Name = var.dynamodb_table_name }
}

# ── IAM: App Runner ECR access (build role) ───────────────────────────────────

resource "aws_iam_role" "apprunner_ecr" {
  name = "${var.name_prefix}-apprunner-ecr"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "build.apprunner.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "apprunner_ecr" {
  role       = aws_iam_role.apprunner_ecr.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess"
}

# ── IAM: App Runner instance role (DynamoDB access) ───────────────────────────

resource "aws_iam_role" "apprunner_instance" {
  name = "${var.name_prefix}-apprunner-instance"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "tasks.apprunner.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "apprunner_dynamodb" {
  role = aws_iam_role.apprunner_instance.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:BatchGetItem",
        "dynamodb:BatchWriteItem",
      ]
      Resource = [
        aws_dynamodb_table.products.arn,
        "${aws_dynamodb_table.products.arn}/index/*",
      ]
    }]
  })
}

# ── App Runner: wake on first request ─────────────────────────────────────────

resource "aws_apprunner_auto_scaling_configuration_version" "app" {
  auto_scaling_configuration_name = "${var.name_prefix}-app"
  min_size                         = 1
  max_size                         = 2
  max_concurrency                  = 100
  tags                             = { Name = "${var.name_prefix}-app" }
}

resource "aws_apprunner_service" "app" {
  service_name                   = "${var.name_prefix}-app"
  auto_scaling_configuration_arn = aws_apprunner_auto_scaling_configuration_version.app.arn

  source_configuration {
    authentication_configuration {
      access_role_arn = aws_iam_role.apprunner_ecr.arn
    }
    image_repository {
      image_identifier      = "${aws_ecr_repository.app.repository_url}:latest"
      image_repository_type = "ECR"
      image_configuration {
        port = "3000"
        runtime_environment_variables = {
          NODE_ENV            = "production"
          AWS_REGION          = var.aws_region
          DYNAMODB_TABLE_NAME = var.dynamodb_table_name
        }
      }
    }
    auto_deployments_enabled = false
  }

  instance_configuration {
    cpu               = "1024"
    memory            = "2048"
    instance_role_arn = aws_iam_role.apprunner_instance.arn
  }

  health_check_configuration {
    protocol            = "HTTP"
    path                = "/api/health"
    interval            = 20
    timeout             = 5
    healthy_threshold   = 1
    unhealthy_threshold = 5
  }

  tags = { Name = "${var.name_prefix}-app" }

  depends_on = [
    aws_iam_role_policy_attachment.apprunner_ecr,
    aws_iam_role_policy.apprunner_dynamodb,
  ]
}
