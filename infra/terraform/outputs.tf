output "url" {
  value       = local.site_url
  description = "Public HTTPS URL of WattCycle"
}
output "ecr_repositories" {
  value = { for k, r in aws_ecr_repository.repo : k => r.repository_url }
}
output "s3_bucket" {
  value = aws_s3_bucket.data.bucket
}
output "event_bus" {
  value = aws_cloudwatch_event_bus.domain.name
}
output "db_endpoint" {
  value = aws_db_instance.postgres.address
}
output "cluster" {
  value = aws_ecs_cluster.main.name
}
