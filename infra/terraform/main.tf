# WattCycle on AWS — reference Terraform (validated for structure; not applied from this repo).
# terraform init && terraform plan -var="project=wattcycle"

terraform {
  required_version = ">= 1.6"
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 5.60" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
}

provider "aws" { region = var.region }

variable "region"  { default = "ap-south-1" } # Mumbai — closest region to the Delhi NCR network
variable "project" { default = "wattcycle" }
variable "api_image" { type = string }
variable "ai_image"  { type = string }

locals { name = var.project }

# ---------------------------------------------------------------- network
module "vpc" {
  source             = "terraform-aws-modules/vpc/aws"
  version            = "~> 5.8"
  name               = local.name
  cidr               = "10.40.0.0/16"
  azs                = ["${var.region}a", "${var.region}b"]
  public_subnets     = ["10.40.0.0/24", "10.40.1.0/24"]
  private_subnets    = ["10.40.10.0/24", "10.40.11.0/24"]
  database_subnets   = ["10.40.20.0/24", "10.40.21.0/24"]
  enable_nat_gateway = true
  single_nat_gateway = true
}

# ---------------------------------------------------------------- data
resource "random_password" "db" {
  length = 32
  special = false
}

resource "aws_db_instance" "postgres" {
  identifier              = "${local.name}-pg"
  engine                  = "postgres"
  engine_version          = "16"
  instance_class          = "db.t4g.medium"
  allocated_storage       = 50
  db_name                 = "wattcycle"
  username                = "wattcycle"
  password                = random_password.db.result
  db_subnet_group_name    = module.vpc.database_subnet_group_name
  vpc_security_group_ids  = [aws_security_group.db.id]
  storage_encrypted       = true
  backup_retention_period = 7
  skip_final_snapshot     = true
  # After create: run infra/sql/postgis.sql (CREATE EXTENSION postgis)
}

resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "${local.name}-redis"
  engine               = "redis"
  node_type            = "cache.t4g.micro"
  num_cache_nodes      = 1
  subnet_group_name    = aws_elasticache_subnet_group.redis.name
  security_group_ids   = [aws_security_group.db.id]
}
resource "aws_elasticache_subnet_group" "redis" {
  name       = "${local.name}-redis"
  subnet_ids = module.vpc.private_subnets
}

# Waste images (presigned URLs), dataset snapshots, model artifacts
resource "aws_s3_bucket" "data" { bucket_prefix = "${local.name}-data-" }
resource "aws_s3_bucket_public_access_block" "data" {
  bucket                  = aws_s3_bucket.data.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_server_side_encryption_configuration" "data" {
  bucket = aws_s3_bucket.data.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
  }
}

# ---------------------------------------------------------------- secrets
resource "aws_secretsmanager_secret" "app" { name = "${local.name}/app" }
# keys: JWT_SECRET, SERVICE_KEY, ANTHROPIC_API_KEY, DATABASE_URL

# ---------------------------------------------------------------- events & queues
resource "aws_cloudwatch_event_bus" "domain" { name = "${local.name}-domain" }

resource "aws_sqs_queue" "training_dlq" { name = "${local.name}-training-dlq" }
resource "aws_sqs_queue" "training" {
  name                       = "${local.name}-training"
  visibility_timeout_seconds = 900
  redrive_policy             = jsonencode({ deadLetterTargetArn = aws_sqs_queue.training_dlq.arn, maxReceiveCount = 3 })
}

# Every AITrainingDataCreated / ModelDriftDetected event → training queue (batched by the worker)
resource "aws_cloudwatch_event_rule" "feedback" {
  name           = "${local.name}-feedback"
  event_bus_name = aws_cloudwatch_event_bus.domain.name
  event_pattern  = jsonencode({ source = ["wattcycle.api"], "detail-type" = ["AITrainingDataCreated", "AlertRaised"] })
}
resource "aws_cloudwatch_event_target" "feedback" {
  rule           = aws_cloudwatch_event_rule.feedback.name
  event_bus_name = aws_cloudwatch_event_bus.domain.name
  arn            = aws_sqs_queue.training.arn
}

# Scheduled retraining (daily 02:00 IST = 20:30 UTC)
resource "aws_scheduler_schedule" "retrain" {
  name                         = "${local.name}-nightly-retrain"
  schedule_expression          = "cron(30 20 * * ? *)"
  flexible_time_window { mode = "OFF" }
  target {
    arn      = aws_sqs_queue.training.arn
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ trigger = "scheduled", model_key = "all" })
  }
}

# ---------------------------------------------------------------- compute (ECS Fargate)
resource "aws_ecs_cluster" "main" {
  name = local.name
  setting {
    name = "containerInsights"
    value = "enabled"
  }
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${local.name}/api"
  retention_in_days = 30
}
resource "aws_cloudwatch_log_group" "ai" {
  name              = "/ecs/${local.name}/ai"
  retention_in_days = 30
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.name}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.task_exec.arn
  task_role_arn            = aws_iam_role.task.arn
  container_definitions = jsonencode([{
    name         = "api"
    image        = var.api_image
    portMappings = [{ containerPort = 4000 }]
    environment  = [
      { name = "AI_SERVICE_URL", value = "http://ai.${local.name}.local:8000" },
      { name = "S3_BUCKET", value = aws_s3_bucket.data.bucket },
      { name = "SIMULATE_FLEET", value = "false" },
    ]
    secrets = [for k in ["JWT_SECRET", "SERVICE_KEY", "DATABASE_URL"] : { name = k, valueFrom = "${aws_secretsmanager_secret.app.arn}:${k}::" }]
    logConfiguration = { logDriver = "awslogs", options = { "awslogs-group" = aws_cloudwatch_log_group.api.name, "awslogs-region" = var.region, "awslogs-stream-prefix" = "api" } }
  }])
}

resource "aws_ecs_task_definition" "ai" {
  family                   = "${local.name}-ai"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 1024
  memory                   = 4096
  execution_role_arn       = aws_iam_role.task_exec.arn
  task_role_arn            = aws_iam_role.task.arn
  container_definitions = jsonencode([{
    name         = "ai"
    image        = var.ai_image
    portMappings = [{ containerPort = 8000 }]
    environment  = [{ name = "BACKEND_URL", value = "http://api.${local.name}.local:4000" }, { name = "S3_BUCKET", value = aws_s3_bucket.data.bucket }]
    secrets      = [for k in ["SERVICE_KEY", "ANTHROPIC_API_KEY"] : { name = k, valueFrom = "${aws_secretsmanager_secret.app.arn}:${k}::" }]
    logConfiguration = { logDriver = "awslogs", options = { "awslogs-group" = aws_cloudwatch_log_group.ai.name, "awslogs-region" = var.region, "awslogs-stream-prefix" = "ai" } }
  }])
}
# ECS services, ALB (/api + /ws → api:4000), Cloud Map namespace and CloudFront (Next.js) omitted
# for brevity — see infra/aws/README.md for the full topology.

# ---------------------------------------------------------------- IAM (least privilege sketch)
data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}
resource "aws_iam_role" "task_exec" {
  name               = "${local.name}-task-exec"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}
resource "aws_iam_role_policy_attachment" "task_exec" {
  role       = aws_iam_role.task_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}
resource "aws_iam_role" "task" {
  name               = "${local.name}-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}
resource "aws_iam_role_policy" "task" {
  role = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject"], Resource = "${aws_s3_bucket.data.arn}/*" },
      { Effect = "Allow", Action = ["events:PutEvents"], Resource = aws_cloudwatch_event_bus.domain.arn },
      { Effect = "Allow", Action = ["sqs:SendMessage", "sqs:ReceiveMessage", "sqs:DeleteMessage"], Resource = aws_sqs_queue.training.arn },
      { Effect = "Allow", Action = ["geo:CalculateRouteMatrix", "geo:GetMap*"], Resource = "*" },
      { Effect = "Allow", Action = ["sagemaker:CreateTrainingJob", "sagemaker:DescribeTrainingJob", "sagemaker:CreateModelPackage"], Resource = "*" },
    ]
  })
}
resource "aws_iam_role" "scheduler" {
  name = "${local.name}-scheduler"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Action = "sts:AssumeRole", Principal = { Service = "scheduler.amazonaws.com" } }] })
}
resource "aws_iam_role_policy" "scheduler" {
  role   = aws_iam_role.scheduler.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Action = "sqs:SendMessage", Resource = aws_sqs_queue.training.arn }] })
}

# ---------------------------------------------------------------- security groups
resource "aws_security_group" "db" {
  name   = "${local.name}-data"
  vpc_id = module.vpc.vpc_id
  ingress {
    from_port   = 0
    to_port     = 65535
    protocol    = "tcp"
    cidr_blocks = module.vpc.private_subnets_cidr_blocks
  }
}

# ---------------------------------------------------------------- monitoring
resource "aws_cloudwatch_metric_alarm" "model_drift" {
  alarm_name          = "${local.name}-energy-model-drift"
  namespace           = "WattCycle"
  metric_name         = "EnergyModelRollingMAPE"
  statistic           = "Average"
  period              = 3600
  evaluation_periods  = 1
  threshold           = 12
  comparison_operator = "GreaterThanThreshold"
}

output "bucket"      { value = aws_s3_bucket.data.bucket }
output "db_endpoint" { value = aws_db_instance.postgres.address }
output "event_bus"   { value = aws_cloudwatch_event_bus.domain.name }
