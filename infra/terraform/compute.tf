# ---------------------------------------------------------------- images
resource "aws_ecr_repository" "repo" {
  for_each             = toset(["api", "ai", "web"])
  name                 = "${local.name}-${each.key}"
  image_tag_mutability = "MUTABLE"
  force_delete         = true
  image_scanning_configuration { scan_on_push = true }
}

# ---------------------------------------------------------------- cluster + logs
resource "aws_ecs_cluster" "main" {
  name = local.name
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}
resource "aws_cloudwatch_log_group" "svc" {
  for_each          = toset(["api", "ai", "web"])
  name              = "/ecs/${local.name}/${each.key}"
  retention_in_days = 14
}

locals {
  site_url = "https://${aws_cloudfront_distribution.cdn.domain_name}"
  log = { for s in ["api", "ai", "web"] : s => {
    logDriver = "awslogs"
    options   = { "awslogs-group" = aws_cloudwatch_log_group.svc[s].name, "awslogs-region" = var.region, "awslogs-stream-prefix" = s }
  } }
  secret = { for k in ["JWT_SECRET", "SERVICE_KEY", "DATABASE_URL"] : k => "${aws_secretsmanager_secret.app.arn}:${k}::" }
}

# ---------------------------------------------------------------- task definitions
resource "aws_ecs_task_definition" "api" {
  family                   = "${local.name}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.exec.arn
  task_role_arn            = aws_iam_role.task.arn
  container_definitions = jsonencode([{
    name         = "api"
    image        = local.images.api
    essential    = true
    portMappings = [{ containerPort = 4000 }]
    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "AI_SERVICE_URL", value = "http://ai.${local.name}.local:8000" },
      { name = "AWS_REGION", value = var.region },
      { name = "S3_BUCKET", value = aws_s3_bucket.data.bucket },
      { name = "EVENT_BUS_NAME", value = aws_cloudwatch_event_bus.domain.name },
      { name = "DATABASE_SSL", value = "true" },
      { name = "CORS_ORIGIN", value = local.site_url },
      { name = "SIMULATE_FLEET", value = "true" },
    ]
    secrets          = [for k in ["JWT_SECRET", "SERVICE_KEY", "DATABASE_URL"] : { name = k, valueFrom = local.secret[k] }]
    logConfiguration = local.log.api
  }])
}

resource "aws_ecs_task_definition" "ai" {
  family                   = "${local.name}-ai"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 1024
  memory                   = 4096 # Keras/torch vision model + LightGBM + OR-Tools
  execution_role_arn       = aws_iam_role.exec.arn
  task_role_arn            = aws_iam_role.task.arn
  container_definitions = jsonencode([{
    name         = "ai"
    image        = local.images.ai
    essential    = true
    portMappings = [{ containerPort = 8000 }]
    environment = [
      { name = "BACKEND_URL", value = "http://api.${local.name}.local:4000" },
      { name = "AWS_REGION", value = var.region },
      { name = "S3_BUCKET", value = aws_s3_bucket.data.bucket },
      { name = "ASSISTANT_PROVIDER", value = var.assistant_provider },
      { name = "ASSISTANT_MODEL", value = var.bedrock_model },
    ]
    secrets          = [{ name = "SERVICE_KEY", valueFrom = local.secret.SERVICE_KEY }]
    logConfiguration = local.log.ai
  }])
}

resource "aws_ecs_task_definition" "web" {
  family                   = "${local.name}-web"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.exec.arn
  container_definitions = jsonencode([{
    name             = "web"
    image            = local.images.web
    essential        = true
    portMappings     = [{ containerPort = 3000 }]
    environment      = [{ name = "API_URL", value = "http://api.${local.name}.local:4000" }]
    logConfiguration = local.log.web
  }])
}

# ---------------------------------------------------------------- load balancer
resource "aws_lb" "main" {
  name               = local.name
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = module.vpc.public_subnets
  idle_timeout       = 3600 # long-lived WebSockets
}
resource "aws_lb_target_group" "web" {
  name        = "${local.name}-web"
  port        = 3000
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = module.vpc.vpc_id
  health_check {
    path    = "/login"
    matcher = "200"
  }
}
resource "aws_lb_target_group" "api" {
  name        = "${local.name}-api"
  port        = 4000
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = module.vpc.vpc_id
  health_check {
    path    = "/health"
    matcher = "200"
  }
}
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }
}
resource "aws_lb_listener_rule" "api" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 10
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
  condition {
    path_pattern { values = ["/api/*", "/ws", "/health"] }
  }
}

# ---------------------------------------------------------------- services
resource "aws_ecs_service" "api" {
  name                              = "api"
  cluster                           = aws_ecs_cluster.main.id
  task_definition                   = aws_ecs_task_definition.api.arn
  desired_count                     = var.desired_count
  launch_type                       = "FARGATE"
  health_check_grace_period_seconds = 120
  network_configuration {
    subnets         = module.vpc.private_subnets
    security_groups = [aws_security_group.tasks.id]
  }
  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 4000
  }
  service_registries { registry_arn = aws_service_discovery_service.svc["api"].arn }
  depends_on = [aws_lb_listener_rule.api]
}

resource "aws_ecs_service" "ai" {
  name            = "ai"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.ai.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"
  network_configuration {
    subnets         = module.vpc.private_subnets
    security_groups = [aws_security_group.tasks.id]
  }
  service_registries { registry_arn = aws_service_discovery_service.svc["ai"].arn }
}

resource "aws_ecs_service" "web" {
  name                              = "web"
  cluster                           = aws_ecs_cluster.main.id
  task_definition                   = aws_ecs_task_definition.web.arn
  desired_count                     = var.desired_count
  launch_type                       = "FARGATE"
  health_check_grace_period_seconds = 60
  network_configuration {
    subnets         = module.vpc.private_subnets
    security_groups = [aws_security_group.tasks.id]
  }
  load_balancer {
    target_group_arn = aws_lb_target_group.web.arn
    container_name   = "web"
    container_port   = 3000
  }
  depends_on = [aws_lb_listener.http]
}

# ---------------------------------------------------------------- CloudFront (HTTPS front door)
data "aws_cloudfront_cache_policy" "disabled" { name = "Managed-CachingDisabled" }
data "aws_cloudfront_cache_policy" "optimized" { name = "Managed-CachingOptimized" }
data "aws_cloudfront_origin_request_policy" "all_viewer" { name = "Managed-AllViewer" }

resource "aws_cloudfront_distribution" "cdn" {
  enabled         = true
  comment         = "${local.name} web + api"
  is_ipv6_enabled = true
  origin {
    origin_id   = "alb"
    domain_name = aws_lb.main.dns_name
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
      origin_read_timeout    = 60
    }
  }
  # Dynamic app: no caching, forward everything (auth header, websockets).
  default_cache_behavior {
    target_origin_id         = "alb"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer.id
  }
  # Immutable Next.js build assets: cache at the edge.
  ordered_cache_behavior {
    path_pattern           = "/_next/static/*"
    target_origin_id       = "alb"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = data.aws_cloudfront_cache_policy.optimized.id
  }
  restrictions {
    geo_restriction { restriction_type = "none" }
  }
  viewer_certificate { cloudfront_default_certificate = true }
}
