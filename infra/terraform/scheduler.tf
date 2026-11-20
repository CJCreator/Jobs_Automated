# Daily retention purge (ADR 0004, ADR 0009): Cloud Scheduler calls the purge
# route with an OIDC token for the dedicated service account. The route checks
# the audience and the account itself and refuses everyone else.

resource "google_cloud_scheduler_job" "purge" {
  count            = var.enable_workloads ? 1 : 0
  name             = "rolewright-purge"
  region           = var.region
  description      = "Delete accounts with no sign-in for 12 months"
  schedule         = "0 3 * * *"
  time_zone        = "Asia/Kolkata"
  attempt_deadline = "180s"

  retry_config {
    retry_count          = 3
    min_backoff_duration = "60s"
    max_backoff_duration = "600s"
    max_doublings        = 2
  }

  http_target {
    http_method = "POST"
    uri         = "${local.purge_audience}/api/internal/purge"

    oidc_token {
      service_account_email = google_service_account.purge.email
      audience              = local.purge_audience
    }
  }

  depends_on = [
    google_project_service.enabled,
    google_cloud_run_v2_service.app,
  ]
}
