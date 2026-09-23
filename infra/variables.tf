variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "name_prefix" {
  description = "Prefix for all resource names"
  type        = string
  default     = "nestjs-apis"
}

variable "dynamodb_table_name" {
  description = "DynamoDB table name for Products"
  type        = string
  default     = "Products"
}
