# Rolewright on Google Cloud (ADR 0009): one root module, applied once per
# environment project with staging.tfvars or production.tfvars.

data "google_project" "this" {
  project_id = var.project_id
}

locals {
  service_name = "rolewright"
  job_name     = "rolewright-migrate"

  # Cloud Run's deterministic URL; used unless app_url (a custom domain) is set.
  run_url = "https://${local.service_name}-${data.google_project.this.number}.${var.region}.run.app"
  app_url = var.app_url != "" ? var.app_url : local.run_url

  # The purge endpoint checks the token audience against this value, and the
  # scheduler sets it. The scheduler always calls the run.app URL.
  purge_audience = local.run_url

  services = [
    "artifactregistry.googleapis.com",
    "cloudscheduler.googleapis.com",
    "compute.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "servicenetworking.googleapis.com",
    "sqladmin.googleapis.com",
    "sts.googleapis.com",
  ]
}

resource "google_project_service" "enabled" {
  for_each           = toset(local.services)
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

# --- Network: private IP for Cloud SQL, direct VPC egress for Cloud Run ----------

resource "google_compute_network" "main" {
  name                    = "rolewright"
  auto_create_subnetworks = false
  depends_on              = [google_project_service.enabled]
}

# Cloud Run instances take their addresses from this subnet (direct VPC egress).
resource "google_compute_subnetwork" "run" {
  name                     = "rolewright-run"
  region                   = var.region
  network                  = google_compute_network.main.id
  ip_cidr_range            = "10.20.0.0/24"
  private_ip_google_access = true
}

# Address range peered to Google's service network, where Cloud SQL lives.
resource "google_compute_global_address" "private_services" {
  name          = "rolewright-private-services"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 20
  network       = google_compute_network.main.id
}

resource "google_service_networking_connection" "private_services" {
  network                 = google_compute_network.main.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_services.name]
  depends_on              = [google_project_service.enabled]
}

# --- Cloud SQL for PostgreSQL 16: private IP only ---------------------------------

resource "google_sql_database_instance" "main" {
  name                = "rolewright"
  region              = var.region
  database_version    = "POSTGRES_16"
  deletion_protection = var.db_deletion_protection

  settings {
    tier                        = var.db_tier
    edition                     = "ENTERPRISE"
    availability_type           = var.db_availability_type
    disk_type                   = "PD_SSD"
    disk_size                   = var.db_disk_size_gb
    disk_autoresize             = true
    deletion_protection_enabled = var.db_deletion_protection

    ip_configuration {
      ipv4_enabled                                  = false
      private_network                               = google_compute_network.main.id
      enable_private_path_for_google_cloud_services = false
    }

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "21:00" # 02:30 IST, away from the 03:00 IST purge
      transaction_log_retention_days = 7
      backup_retention_settings {
        retained_backups = 14
        retention_unit   = "COUNT"
      }
    }

    maintenance_window {
      day          = 7
      hour         = 22
      update_track = "stable"
    }

    insights_config {
      query_insights_enabled = false
    }
  }

  depends_on = [google_service_networking_connection.private_services]
}

# The database, the roles and their passwords are created by
# infra/sql/bootstrap-roles.sql (runbook step 3), so no password is ever in
# Terraform state. Terraform creates the instance only.

# --- Artifact Registry -------------------------------------------------------------

resource "google_artifact_registry_repository" "app" {
  location      = var.region
  repository_id = "rolewright"
  format        = "DOCKER"
  description   = "Rolewright app images"
  depends_on    = [google_project_service.enabled]

  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"
    most_recent_versions {
      keep_count = 20
    }
  }
  cleanup_policies {
    id     = "delete-old"
    action = "DELETE"
    condition {
      older_than = "2592000s" # 30 days
    }
  }
}
