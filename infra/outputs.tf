output "ecr_repository_url" {
  description = "ECR repository URL"
  value       = aws_ecr_repository.app.repository_url
}

output "apprunner_service_arn" {
  description = "App Runner service ARN"
  value       = aws_apprunner_service.app.arn
}

output "service_url" {
  description = "App Runner HTTPS URL"
  value       = "https://${aws_apprunner_service.app.service_url}"
}

output "dynamodb_table_name" {
  description = "DynamoDB Products table name"
  value       = aws_dynamodb_table.products.name
}
