variable "project_id" {
  description = "The Google Cloud project for this environment (one project per environment). Pass with -var or TF_VAR_project_id; it is not stored in the repo."
  type        = string
}

variable "environment" {
  description = "staging or production."
  type        = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production."
  }
}

variable "region" {
  description = "Region for every resource that holds or processes user data (ADR 0009)."
  type        = string
  default     = "asia-south1"
}

variable "enable_workloads" {
  description = "Create the Cloud Run service and job, the scheduler and the alerts. Leave false on the first apply: they need an image in Artifact Registry and secret values, which exist only after the first apply (see docs/runbook/gcp.md)."
  type        = bool
  default     = false
}

variable "image" {
  description = "Initial image for the service and the migrate job. Afterwards the deploy workflow updates it and Terraform ignores the change."
  type        = string
  default     = ""
}

variable "app_url" {
  description = "Public URL of the app (AUTH_URL and the purge audience). Empty means the service's run.app URL, which is derived from the project number."
  type        = string
  default     = ""
}

variable "github_repository" {
  description = "owner/name of the GitHub repository allowed to deploy through workload identity federation."
  type        = string
}

variable "alert_email" {
  description = "Email address that receives purge alerts."
  type        = string
}

# --- Cloud Run -----------------------------------------------------------------

variable "min_instances" {
  description = "Minimum Cloud Run instances. 0 for staging, 1 for production (Chromium cold starts)."
  type        = number
}

variable "max_instances" {
  description = "Maximum Cloud Run instances. Bounds database connections and trial spend."
  type        = number
  default     = 5
}

# --- Cloud SQL -----------------------------------------------------------------

variable "db_tier" {
  description = "Cloud SQL machine tier."
  type        = string
}

variable "db_availability_type" {
  description = "ZONAL or REGIONAL (high availability)."
  type        = string
  default     = "ZONAL"
}

variable "db_disk_size_gb" {
  description = "Initial disk size in GB; grows automatically."
  type        = number
  default     = 10
}

variable "db_deletion_protection" {
  description = "Keep true. Set false only for a deliberate teardown, in a separate apply."
  type        = bool
  default     = true
}

# --- Plain application variables (no secrets) -------------------------------------

variable "signups" {
  description = "ROLEWRIGHT_SIGNUPS: closed, allowlist or open. Open needs a grievance contact."
  type        = string
  default     = "allowlist"
  validation {
    condition     = contains(["closed", "allowlist", "open"], var.signups)
    error_message = "signups must be closed, allowlist or open."
  }
}

variable "extra_providers" {
  description = "ROLEWRIGHT_EXTRA_PROVIDERS: comma list from openai, groq. Empty at launch."
  type        = string
  default     = ""
}

variable "trusted_proxy_hops" {
  description = "ROLEWRIGHT_TRUSTED_PROXY_HOPS: how many proxies in front of the app to trust for the client IP. 0 until a load balancer is added."
  type        = number
  default     = 0
}

variable "trial_gemini_model" {
  description = "ROLEWRIGHT_TRIAL_GEMINI_MODEL: model id for the free trial on Gemini."
  type        = string
  default     = ""
}

variable "trial_openrouter_model" {
  description = "ROLEWRIGHT_TRIAL_OPENROUTER_MODEL: free model id for the free trial on OpenRouter."
  type        = string
  default     = ""
}

variable "grievance_name" {
  description = "ROLEWRIGHT_GRIEVANCE_NAME (ADR 0004)."
  type        = string
  default     = ""
}

variable "grievance_email" {
  description = "ROLEWRIGHT_GRIEVANCE_EMAIL (ADR 0004)."
  type        = string
  default     = ""
}

variable "email_from" {
  description = "EMAIL_FROM: sender of sign-in emails, on a domain verified in Resend."
  type        = string
  default     = ""
}
