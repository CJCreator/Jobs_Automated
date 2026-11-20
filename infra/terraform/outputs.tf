output "service_url" {
  description = "The service's run.app URL (also the purge audience)."
  value       = local.run_url
}

output "cloud_sql_private_ip" {
  description = "Private IP of the database; use it in the two connection-string secrets."
  value       = google_sql_database_instance.main.private_ip_address
}

output "cloud_sql_instance" {
  value = google_sql_database_instance.main.name
}

output "artifact_registry_repository" {
  description = "Image repository prefix: <this>/rolewright:<tag>"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.app.repository_id}"
}

output "workload_identity_provider" {
  description = "Value for the GCP_WORKLOAD_IDENTITY_PROVIDER variable of the GitHub environment."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "deployer_service_account" {
  description = "Value for the GCP_DEPLOYER_SERVICE_ACCOUNT variable of the GitHub environment."
  value       = google_service_account.deployer.email
}

output "purge_service_account" {
  value = google_service_account.purge.email
}
