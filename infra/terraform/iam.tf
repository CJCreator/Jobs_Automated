# One service account per job to be done, each with the fewest roles.

# Runs the Cloud Run service. Reads its secrets (secrets.tf); needs nothing
# else, because the database is reached over private IP with a password.
resource "google_service_account" "app" {
  account_id   = "rolewright-app"
  display_name = "Rolewright app (Cloud Run service)"
  depends_on   = [google_project_service.enabled]
}

# Runs the migrate job. Reads only the owner connection string.
resource "google_service_account" "migrate" {
  account_id   = "rolewright-migrate"
  display_name = "Rolewright migrate (Cloud Run job)"
  depends_on   = [google_project_service.enabled]
}

# Identity Cloud Scheduler signs the purge call with. It has no roles: the
# service accepts unauthenticated invocations and the purge route verifies this
# account's OIDC token itself.
resource "google_service_account" "purge" {
  account_id   = "rolewright-purge"
  display_name = "Rolewright purge (Cloud Scheduler)"
  depends_on   = [google_project_service.enabled]
}

# Used by the GitHub deploy workflow through workload identity federation.
resource "google_service_account" "deployer" {
  account_id   = "rolewright-deployer"
  display_name = "Rolewright deployer (GitHub Actions)"
  depends_on   = [google_project_service.enabled]
}

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "rolewright-github"
  display_name              = "Rolewright GitHub"
  depends_on                = [google_project_service.enabled]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  display_name                       = "GitHub Actions"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }
  # Only workflows in this repository can mint tokens.
  attribute_condition = "assertion.repository == \"${var.github_repository}\""

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account_iam_member" "deployer_wif" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}

# Deploy: update the service and the job, and run the job.
resource "google_project_iam_member" "deployer_run" {
  project = var.project_id
  role    = "roles/run.developer"
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_artifact_registry_repository_iam_member" "deployer_push" {
  location   = google_artifact_registry_repository.app.location
  repository = google_artifact_registry_repository.app.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.deployer.email}"
}

# Cloud Run requires the deployer to act as the identities it deploys with.
resource "google_service_account_iam_member" "deployer_acts_as_app" {
  service_account_id = google_service_account.app.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_service_account_iam_member" "deployer_acts_as_migrate" {
  service_account_id = google_service_account.migrate.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer.email}"
}
