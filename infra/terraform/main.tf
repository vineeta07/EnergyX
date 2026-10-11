# WattCycle on AWS — deployable stack.
#
#   CloudFront (HTTPS) → ALB → ECS Fargate:  web (Next.js) · api (Node.js)  ─► ai (FastAPI, private, Cloud Map)
#   RDS PostgreSQL · S3 (photos + model artifacts) · EventBridge (domain events) · Bedrock (assistant)
#   Secrets Manager · CloudWatch Logs · ECR
#
# Deploy with scripts/deploy-aws.sh (builds and pushes images, then applies).

terraform {
  required_version = ">= 1.6"
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 5.60" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = { Project = var.project, ManagedBy = "terraform" }
  }
}

variable "region" {
  type    = string
  default = "ap-south-1" # Mumbai, closest to Delhi
}
variable "project" {
  type    = string
  default = "wattcycle"
}
variable "image_tag" {
  type        = string
  default     = "latest"
  description = "Tag of the api/ai/web images in ECR"
}
variable "bedrock_model" {
  type    = string
  default = "anthropic.claude-opus-5-5"
}
variable "assistant_provider" {
  type        = string
  default     = "bedrock"
  description = "bedrock | offline (Bedrock model access must be enabled in the account)"
}
variable "desired_count" {
  type    = number
  default = 1
}

data "aws_caller_identity" "me" {}
data "aws_availability_zones" "available" { state = "available" }

locals {
  name   = var.project
  azs    = slice(data.aws_availability_zones.available.names, 0, 2)
  ecr    = "${data.aws_caller_identity.me.account_id}.dkr.ecr.${var.region}.amazonaws.com"
  images = { for s in ["api", "ai", "web"] : s => "${local.ecr}/${local.name}-${s}:${var.image_tag}" }
}
