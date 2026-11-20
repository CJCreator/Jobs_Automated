# Secret Manager: Terraform creates the secrets, never the values. Add values
# with `gcloud secrets versions add` (runbook step 4). No value is in state,
# tfvars or the repo.

locals {
  # Secrets the app service reads.
  app_secrets = [
    "AUTH_SECRET",
    "AUTH_GOOGLE_ID",
    "AUTH_GOOGLE_SECRET",
    "AUTH_RESEND_KEY",
    "DATABASE_URL", # the rolewright_login connection string
    "ROLEWRIGHT_TRIAL_GEMINI_KEY",
    "ROLEWRIGHT_TRIAL_OPENROUTER_KEY",
    "ROLEWRIGHT_SIGNUP_ALLOWLIST",
  ]
  # Only the migrate job reads this one (the owner role connection string).
  migrate_secret = "ROLEWRIGHT_MIGRATE_DATABASE_URL"

  all_secrets = concat(local.app_secrets, [local.migrate_secret])
}

resource "google_secret_manager_secret" "all" {
  for_each  = toset(local.all_secrets)
  secret_id = each.value

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }

  depends_on = [google_project_service.enabled]
}

resource "google_secret_manager_secret_iam_member" "app" {
  for_each  = toset(local.app_secrets)
  secret_id = google_secret_manager_secret.all[each.value].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.app.email}"
}

resource "google_secret_manager_secret_iam_member" "migrate" {
  secret_id = google_secret_manager_secret.all[local.migrate_secret].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.migrate.email}"
}
