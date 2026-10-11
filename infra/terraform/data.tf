# ---------------------------------------------------------------- PostgreSQL
resource "random_password" "db" {
  length  = 32
  special = false
}

resource "aws_db_subnet_group" "db" {
  name       = local.name
  subnet_ids = module.vpc.database_subnets
}

resource "aws_db_instance" "postgres" {
  identifier              = "${local.name}-pg"
  engine                  = "postgres"
  engine_version          = "16"
  instance_class          = "db.t4g.micro"
  allocated_storage       = 20
  db_name                 = "wattcycle"
  username                = "wattcycle"
  password                = random_password.db.result
  db_subnet_group_name    = aws_db_subnet_group.db.name
  vpc_security_group_ids  = [aws_security_group.db.id]
  storage_encrypted       = true
  backup_retention_period = 1
  skip_final_snapshot     = true
  publicly_accessible     = false
}

# ---------------------------------------------------------------- S3: waste photos + model artifacts
resource "aws_s3_bucket" "data" {
  bucket_prefix = "${local.name}-data-"
  force_destroy = true
}
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

# ---------------------------------------------------------------- EventBridge: domain events
resource "aws_cloudwatch_event_bus" "domain" {
  name = "${local.name}-domain"
}
# Archive every event (replayable audit trail of the closed loop).
resource "aws_cloudwatch_event_archive" "domain" {
  name             = "${local.name}-domain-archive"
  event_source_arn = aws_cloudwatch_event_bus.domain.arn
  retention_days   = 30
}
# Example consumer: model-feedback events into CloudWatch Logs for monitoring.
resource "aws_cloudwatch_log_group" "events" {
  name              = "/aws/events/${local.name}-feedback"
  retention_in_days = 30
}
resource "aws_cloudwatch_event_rule" "feedback" {
  name           = "${local.name}-feedback"
  event_bus_name = aws_cloudwatch_event_bus.domain.name
  event_pattern  = jsonencode({ source = ["wattcycle.api"], "detail-type" = ["AITrainingDataCreated", "ModelRetrained", "AlertRaised"] })
}
resource "aws_cloudwatch_event_target" "feedback_logs" {
  rule           = aws_cloudwatch_event_rule.feedback.name
  event_bus_name = aws_cloudwatch_event_bus.domain.name
  arn            = aws_cloudwatch_log_group.events.arn
}
resource "aws_cloudwatch_log_resource_policy" "events" {
  policy_name = "${local.name}-events-to-logs"
  policy_document = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = ["events.amazonaws.com", "delivery.logs.amazonaws.com"] }
      Action    = ["logs:CreateLogStream", "logs:PutLogEvents"]
      Resource  = "${aws_cloudwatch_log_group.events.arn}:*"
    }]
  })
}

# ---------------------------------------------------------------- Secrets
resource "random_password" "jwt" {
  length  = 48
  special = false
}
resource "random_password" "service_key" {
  length  = 48
  special = false
}
resource "aws_secretsmanager_secret" "app" {
  name_prefix = "${local.name}-app-"
}
resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({
    JWT_SECRET   = random_password.jwt.result
    SERVICE_KEY  = random_password.service_key.result
    DATABASE_URL = "postgres://wattcycle:${random_password.db.result}@${aws_db_instance.postgres.address}:5432/wattcycle"
  })
}
