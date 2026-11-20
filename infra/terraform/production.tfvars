# Non-secret settings for production. project_id, github_repository and
# alert_email are passed with -var (see docs/runbook/gcp.md).
environment            = "production"
region                 = "asia-south1"
min_instances          = 1
max_instances          = 5
db_tier                = "db-custom-2-7680"
db_availability_type   = "REGIONAL"
signups                = "allowlist"
extra_providers        = ""
trusted_proxy_hops     = 0
trial_gemini_model     = ""
trial_openrouter_model = ""
grievance_name         = ""
grievance_email        = ""
email_from             = ""
