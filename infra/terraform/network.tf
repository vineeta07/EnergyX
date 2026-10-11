module "vpc" {
  source             = "terraform-aws-modules/vpc/aws"
  version            = "~> 5.8"
  name               = local.name
  cidr               = "10.40.0.0/16"
  azs                = local.azs
  public_subnets     = ["10.40.0.0/24", "10.40.1.0/24"]
  private_subnets    = ["10.40.10.0/24", "10.40.11.0/24"]
  database_subnets   = ["10.40.20.0/24", "10.40.21.0/24"]
  enable_nat_gateway = true # private tasks need egress (ECR pulls, OSRM, Hugging Face, Bedrock)
  single_nat_gateway = true
}

resource "aws_security_group" "alb" {
  name   = "${local.name}-alb"
  vpc_id = module.vpc.vpc_id
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"] # CloudFront → ALB over HTTP; viewers use HTTPS on CloudFront
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "tasks" {
  name   = "${local.name}-tasks"
  vpc_id = module.vpc.vpc_id
  ingress {
    description     = "ALB to web/api"
    from_port       = 3000
    to_port         = 4000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  ingress {
    description = "api to ai (and ai to api /internal) inside the task group"
    from_port   = 0
    to_port     = 65535
    protocol    = "tcp"
    self        = true
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "db" {
  name   = "${local.name}-db"
  vpc_id = module.vpc.vpc_id
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.tasks.id]
  }
}

# Private DNS so the api reaches the ai service at ai.wattcycle.local (and vice versa).
resource "aws_service_discovery_private_dns_namespace" "ns" {
  name = "${local.name}.local"
  vpc  = module.vpc.vpc_id
}
resource "aws_service_discovery_service" "svc" {
  for_each = toset(["api", "ai"])
  name     = each.key
  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.ns.id
    dns_records {
      type = "A"
      ttl  = 10
    }
  }
  health_check_custom_config { failure_threshold = 1 }
}
