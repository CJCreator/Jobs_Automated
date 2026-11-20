# Non-secret settings for staging. project_id, github_repository and
# alert_email are passed with -var (see docs/runbook/gcp.md).
environment            = "staging"
region                 = "asia-south1"
min_instances          = 0
max_instances          = 3
db_tier                = "db-custom-1-3840"
db_availability_type   = "ZONAL"
signups                = "allowlist"
extra_providers        = ""
trusted_proxy_hops     = 0
trial_gemini_model     = ""
trial_openrouter_model = ""
grievance_name         = ""
grievance_email        = ""
email_from             = ""
