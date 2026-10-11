# Container images are built in AWS (CodeBuild) from the Git repo — no local Docker needed.

variable "repo_url" {
  type    = string
  default = "https://github.com/vineeta07/EnergyX.git"
}
variable "repo_branch" {
  type    = string
  default = "main"
}

resource "aws_cloudwatch_log_group" "build" {
  name              = "/codebuild/${local.name}-images"
  retention_in_days = 14
}

resource "aws_iam_role" "build" {
  name = "${local.name}-codebuild"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = "sts:AssumeRole", Principal = { Service = "codebuild.amazonaws.com" } }]
  })
}
resource "aws_iam_role_policy" "build" {
  role = aws_iam_role.build.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["ecr:GetAuthorizationToken"], Resource = "*" },
      { Effect = "Allow", Action = ["ecr:BatchCheckLayerAvailability", "ecr:CompleteLayerUpload", "ecr:InitiateLayerUpload", "ecr:PutImage", "ecr:UploadLayerPart", "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer"], Resource = [for r in aws_ecr_repository.repo : r.arn] },
      { Effect = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents"], Resource = "${aws_cloudwatch_log_group.build.arn}:*" },
    ]
  })
}

resource "aws_codebuild_project" "images" {
  name          = "${local.name}-images"
  service_role  = aws_iam_role.build.arn
  build_timeout = 60
  artifacts { type = "NO_ARTIFACTS" }
  environment {
    compute_type    = "BUILD_GENERAL1_MEDIUM"
    image           = "aws/codebuild/standard:7.0"
    type            = "LINUX_CONTAINER"
    privileged_mode = true # docker builds
    environment_variable {
      name  = "REGISTRY"
      value = local.ecr
    }
    environment_variable {
      name  = "PROJECT"
      value = local.name
    }
    environment_variable {
      name  = "IMAGE_TAG"
      value = "latest"
    }
    environment_variable {
      name  = "REPO_URL"
      value = var.repo_url
    }
    environment_variable {
      name  = "REPO_BRANCH"
      value = var.repo_branch
    }
  }
  logs_config {
    cloudwatch_logs { group_name = aws_cloudwatch_log_group.build.name }
  }
  source {
    type      = "NO_SOURCE"
    buildspec = <<-YAML
      version: 0.2
      phases:
        pre_build:
          commands:
            - aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $REGISTRY
            - git clone --depth 1 --branch $REPO_BRANCH $REPO_URL src
        build:
          commands:
            - cd src
            - docker build -f infra/docker/server.Dockerfile -t $REGISTRY/$PROJECT-api:$IMAGE_TAG .
            - docker build -f infra/docker/ai.Dockerfile -t $REGISTRY/$PROJECT-ai:$IMAGE_TAG .
            - docker build -f infra/docker/web.Dockerfile -t $REGISTRY/$PROJECT-web:$IMAGE_TAG .
        post_build:
          commands:
            - docker push $REGISTRY/$PROJECT-api:$IMAGE_TAG
            - docker push $REGISTRY/$PROJECT-ai:$IMAGE_TAG
            - docker push $REGISTRY/$PROJECT-web:$IMAGE_TAG
    YAML
  }
}

output "codebuild_project" {
  value = aws_codebuild_project.images.name
}
