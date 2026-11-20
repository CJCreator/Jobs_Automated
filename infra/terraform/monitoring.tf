# Alerts on the retention purge: a failed call to the purge route, and a failed
# scheduler attempt. A purge that silently stops is a defect (ADR 0004).

resource "google_monitoring_notification_channel" "email" {
  display_name = "Rolewright alerts (${var.environment})"
  type         = "email"
  labels       = {
    email_address = var.alert_email
  }
  depends_on = [google_project_service.enabled]
}

# Cloud Run request logs: a POST to the purge route that did not return 2xx.
# (Anyone can send an unauthenticated POST, which answers 401 and also counts;
# the runbook uses that to test the alert.)
resource "google_logging_metric" "purge_call_failed" {
  name        = "rolewright_purge_call_failed"
  description = "Calls to /api/internal/purge that failed"
  filter      = <<-EOT
    resource.type="cloud_run_revision"
    resource.labels.service_name="${local.service_name}"
    httpRequest.requestMethod="POST"
    httpRequest.requestUrl:"/api/internal/purge"
    httpRequest.status>=400
  EOT

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
  }
  depends_on = [google_project_service.enabled]
}

# Cloud Scheduler logs: an attempt of the purge job ended in error.
resource "google_logging_metric" "purge_scheduler_failed" {
  name        = "rolewright_purge_scheduler_failed"
  description = "Scheduler attempts of rolewright-purge that failed"
  filter      = <<-EOT
    resource.type="cloud_scheduler_job"
    resource.labels.job_id="rolewright-purge"
    severity>=ERROR
  EOT

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
  }
  depends_on = [google_project_service.enabled]
}

resource "google_monitoring_alert_policy" "purge_call_failed" {
  display_name          = "Rolewright purge call failed (${var.environment})"
  combiner              = "OR"
  notification_channels = [google_monitoring_notification_channel.email.id]

  conditions {
    display_name = "Purge route returned an error"
    condition_threshold {
      filter          = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.purge_call_failed.name}\" AND resource.type=\"cloud_run_revision\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "0s"
      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_SUM"
      }
      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "86400s"
  }
}

resource "google_monitoring_alert_policy" "purge_scheduler_failed" {
  display_name          = "Rolewright purge scheduler failed (${var.environment})"
  combiner              = "OR"
  notification_channels = [google_monitoring_notification_channel.email.id]

  conditions {
    display_name = "Scheduler attempt failed"
    condition_threshold {
      filter          = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.purge_scheduler_failed.name}\" AND resource.type=\"cloud_scheduler_job\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "0s"
      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_SUM"
      }
      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "86400s"
  }
}
