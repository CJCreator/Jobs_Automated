# Cloud Run service (the app) and job (migrations). Created only once an image
# and the secret values exist: set enable_workloads = true for the second apply.

locals {
  plain_env = {
    ROLEWRIGHT_DEPLOYED               = "1"
    AUTH_URL                          = local.app_url
    EMAIL_FROM                        = var.email_from
    ROLEWRIGHT_SIGNUPS                = var.signups
    ROLEWRIGHT_EXTRA_PROVIDERS        = var.extra_providers
    ROLEWRIGHT_TRUSTED_PROXY_HOPS     = tostring(var.trusted_proxy_hops)
    ROLEWRIGHT_TRIAL_GEMINI_MODEL     = var.trial_gemini_model
    ROLEWRIGHT_TRIAL_OPENROUTER_MODEL = var.trial_openrouter_model
    ROLEWRIGHT_GRIEVANCE_NAME         = var.grievance_name
    ROLEWRIGHT_GRIEVANCE_EMAIL        = var.grievance_email
    ROLEWRIGHT_PURGE_AUDIENCE         = local.purge_audience
    ROLEWRIGHT_PURGE_SERVICE_ACCOUNT  = google_service_account.purge.email
  }
}

resource "google_cloud_run_v2_service" "app" {
  count    = var.enable_workloads ? 1 : 0
  name     = local.service_name
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  # No IAM check on the service: the app authenticates users itself and the
  # purge route verifies its own OIDC token (ADR 0009).
  invoker_iam_disabled = true
  deletion_protection  = var.environment == "production"

  template {
    service_account                  = google_service_account.app.email
    max_instance_request_concurrency = 10
    timeout                          = "180s"

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    vpc_access {
      egress = "PRIVATE_RANGES_ONLY"
      network_interfaces {
        network    = google_compute_network.main.id
        subnetwork = google_compute_subnetwork.run.id
      }
    }

    containers {
      image = var.image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          memory = "2Gi"
          cpu    = "2"
        }
        cpu_idle = true
      }

      dynamic "env" {
        for_each = local.plain_env
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = toset(local.app_secrets)
        content {
          name = env.value
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.all[env.value].secret_id
              version = "latest"
            }
          }
        }
      }

      startup_probe {
        http_get {
          path = "/api/health"
        }
        initial_delay_seconds = 5
        period_seconds        = 5
        timeout_seconds       = 3
        failure_threshold     = 24
      }

      liveness_probe {
        http_get {
          path = "/api/health"
        }
        period_seconds    = 30
        timeout_seconds   = 5
        failure_threshold = 3
      }
    }
  }

  lifecycle {
    # The deploy workflow rolls the image; Terraform owns everything else.
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [
    google_secret_manager_secret_iam_member.app,
    google_sql_database_instance.main,
  ]
}

resource "google_cloud_run_v2_job" "migrate" {
  count    = var.enable_workloads ? 1 : 0
  name     = local.job_name
  location = var.region

  deletion_protection = var.environment == "production"

  template {
    task_count  = 1
    parallelism = 1

    template {
      service_account = google_service_account.migrate.email
      max_retries     = 0
      timeout         = "600s"

      vpc_access {
        egress = "PRIVATE_RANGES_ONLY"
        network_interfaces {
          network    = google_compute_network.main.id
          subnetwork = google_compute_subnetwork.run.id
        }
      }

      containers {
        image   = var.image
        command = ["npm"]
        args    = ["run", "db:migrate"]

        resources {
          limits = {
            memory = "1Gi"
            cpu    = "1"
          }
        }

        env {
          name  = "ROLEWRIGHT_DEPLOYED"
          value = "1"
        }

        # The only secret the job gets. The service never receives it.
        env {
          name = local.migrate_secret
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.all[local.migrate_secret].secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [
    google_secret_manager_secret_iam_member.migrate,
    google_sql_database_instance.main,
  ]
}
