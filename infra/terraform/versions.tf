terraform {
  required_version = ">= 1.9.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 6.30.0, < 7.0.0"
    }
  }

  # Partial backend: the bucket is passed at init time so no project id is
  # stored in the repo.
  #   terraform init -backend-config="bucket=<state-bucket>" -backend-config="prefix=rolewright/<env>"
  # CI validates with `terraform init -backend=false`.
  backend "gcs" {}
}

provider "google" {
  project = var.project_id
  region  = var.region
}
