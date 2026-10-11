#!/usr/bin/env bash
# Deploy WattCycle to AWS.
#
# Prerequisites: AWS CLI v2 and Terraform >= 1.6 on PATH, and AWS credentials configured
# (`aws configure` or `aws sso login`). Credentials are read from the standard AWS chain —
# never pass them on the command line or commit them.
#
#   bash scripts/deploy-aws.sh                # region from AWS_REGION (default ap-south-1)
#   bash scripts/deploy-aws.sh --destroy      # tear everything down
set -euo pipefail

cd "$(dirname "$0")/.."
TF="terraform -chdir=infra/terraform"
REGION="${AWS_REGION:-ap-south-1}"
TAG="$(git rev-parse --short HEAD)"
# CodeBuild clones from GitHub, so build the branch you are on, and only once it is pushed.
BRANCH="${DEPLOY_BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"
if [[ "${1:-}" != "--destroy" ]]; then
  git fetch -q origin "$BRANCH" || { echo "Branch '$BRANCH' is not on GitHub. Push it first."; exit 1; }
  [[ "$(git rev-parse HEAD)" == "$(git rev-parse "origin/$BRANCH")" ]] || { echo "Local '$BRANCH' differs from GitHub. Push or pull first, so the image matches tag $TAG."; exit 1; }
fi

command -v aws >/dev/null || { echo "AWS CLI not found"; exit 1; }
command -v terraform >/dev/null || { echo "Terraform not found"; exit 1; }
aws sts get-caller-identity --output text --query 'Arn' >/dev/null || { echo "No AWS credentials. Run 'aws configure' or 'aws sso login'."; exit 1; }
echo "Deploying as $(aws sts get-caller-identity --query Arn --output text) to $REGION (branch $BRANCH, image tag $TAG)"

$TF init -upgrade -input=false

if [[ "${1:-}" == "--destroy" ]]; then
  $TF destroy -var "region=$REGION"
  exit 0
fi

echo "== 1/3 Image registries + cloud build project"
$TF apply -var "region=$REGION" -target=aws_ecr_repository.repo -target=aws_codebuild_project.images

echo "== 2/3 Building images in CodeBuild (tag $TAG; pushes must already be on GitHub)"
BUILD_ID=$(aws codebuild start-build --region "$REGION" --project-name wattcycle-images \
  --environment-variables-override "name=IMAGE_TAG,value=$TAG,type=PLAINTEXT" "name=REPO_BRANCH,value=$BRANCH,type=PLAINTEXT" --query 'build.id' --output text)
echo "build $BUILD_ID"
while true; do
  STATUS=$(aws codebuild batch-get-builds --region "$REGION" --ids "$BUILD_ID" --query 'builds[0].buildStatus' --output text)
  [[ "$STATUS" == "IN_PROGRESS" ]] || break
  printf "."; sleep 20
done
echo " $STATUS"
[[ "$STATUS" == "SUCCEEDED" ]] || { echo "Image build failed — see CloudWatch log group /codebuild/wattcycle-images"; exit 1; }

echo "== 3/3 Infrastructure + services"
$TF apply -var "region=$REGION" -var "image_tag=$TAG"
echo
echo "WattCycle URL: $($TF output -raw url)"
echo "(first start seeds the database and trains the models: allow ~3 minutes)"
