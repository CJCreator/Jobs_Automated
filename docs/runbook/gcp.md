# Runbook: Google Cloud (staging and production)

Decisions: ADR 0009 (hosting), ADR 0003 (keys), ADR 0004 (retention). The setup is in `infra/terraform`, the image in `apps/web/Dockerfile`, the deploy in `.github/workflows/deploy.yml`. Nothing here has been applied yet; the first run is the owner's.

Each environment is its own Google Cloud project in `asia-south1`, with its own database and secrets. Repeat everything below once per environment. In the commands, `<env>` is `staging` or `production`, and `$PROJECT` is that environment's project id (keep it in your shell, not in a file).

## First-time setup, in order

1. **Projects and state bucket.**
   - Create the project, link billing, and make yourself Owner.
   - Create a private bucket for Terraform state in the same project, in `asia-south1`, with versioning on:
     `gcloud storage buckets create gs://<state-bucket> --project $PROJECT --location asia-south1 --uniform-bucket-level-access` then `gcloud storage buckets update gs://<state-bucket> --versioning`.
2. **First apply: infrastructure only.** From `infra/terraform`:
   ```
   terraform init -backend-config="bucket=<state-bucket>" -backend-config="prefix=rolewright/<env>"
   terraform apply -var-file=<env>.tfvars \
     -var project_id=$PROJECT -var github_repository=<owner/repo> -var alert_email=<address>
   ```
   `enable_workloads` is false, so this creates the network, Cloud SQL (private IP, backups, point-in-time recovery, deletion protection), Artifact Registry, the secrets (empty), the service accounts and the GitHub workload identity. It takes about 15 minutes, mostly the database.
3. **Bootstrap the database roles.** The database has private IP only, so psql must run inside the VPC. Use a temporary VM:
   ```
   gcloud compute instances create rolewright-bootstrap --project $PROJECT --zone asia-south1-a \
     --machine-type e2-small --no-address --network rolewright --subnet rolewright-run \
     --image-family debian-12 --image-project debian-cloud \
     --metadata startup-script='apt-get update && apt-get install -y postgresql-client'
   gcloud compute ssh rolewright-bootstrap --project $PROJECT --zone asia-south1-a --tunnel-through-iap
   ```
   (IAP SSH needs a firewall rule allowing `35.235.240.0/20` on port 22 to the network; create it for this step and delete it after.) On the VM, set the `postgres` password once from your own machine (`gcloud sql users set-password postgres --instance rolewright --project $PROJECT --prompt-for-password`), generate two long random passwords, copy `infra/sql/bootstrap-roles.sql` to the VM and run:
   ```
   psql "host=<cloud_sql_private_ip> user=postgres dbname=postgres sslmode=require" \
     -v owner_password="$OWNER_PW" -v login_password="$LOGIN_PW" -f bootstrap-roles.sql
   ```
   Keep both passwords for step 4 only. Then delete the VM and the firewall rule. The script is safe to re-run.
4. **Secret values.** Put each value in with `gcloud secrets versions add <NAME> --project $PROJECT --data-file=-` (type the value, then Ctrl-D; never put it on the command line). The names are:
   - `AUTH_SECRET` (from `openssl rand -base64 32`), `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_RESEND_KEY`
   - `DATABASE_URL`: `postgres://rolewright_login:<LOGIN_PW>@<cloud_sql_private_ip>:5432/rolewright`
   - `ROLEWRIGHT_MIGRATE_DATABASE_URL`: the same with `rolewright_owner` and `<OWNER_PW>`
   - `ROLEWRIGHT_TRIAL_GEMINI_KEY`, `ROLEWRIGHT_TRIAL_OPENROUTER_KEY`: our free-tier trial keys only
   - `ROLEWRIGHT_SIGNUP_ALLOWLIST`: comma list of addresses and `@domain` entries (can be a single space-free placeholder until you decide)
   The private IP is the `cloud_sql_private_ip` Terraform output. Secret values are never in Terraform, its state, tfvars or the repo.
5. **GitHub environment.** In the repository settings create environments `staging` and `production` (production with required reviewers). In each, set the variables `GCP_PROJECT_ID`, `GCP_WORKLOAD_IDENTITY_PROVIDER` (output `workload_identity_provider`) and `GCP_DEPLOYER_SERVICE_ACCOUNT` (output `deployer_service_account`).
6. **First image.** The service needs an image to exist. Build and push once by hand, or run the Deploy workflow (it will fail at "Run the migrations" because the job does not exist yet; the push has still happened):
   ```
   gcloud auth configure-docker asia-south1-docker.pkg.dev
   docker build -f apps/web/Dockerfile -t asia-south1-docker.pkg.dev/$PROJECT/rolewright/rolewright:first .
   docker push asia-south1-docker.pkg.dev/$PROJECT/rolewright/rolewright:first
   ```
7. **Second apply: workloads.** Add `-var enable_workloads=true -var image=asia-south1-docker.pkg.dev/$PROJECT/rolewright/rolewright:first` and the settings to your command from step 2 (set the grievance name and email, `email_from`, and the trial model ids in the tfvars file first). This creates the Cloud Run service, the `rolewright-migrate` job, the daily purge scheduler job and the purge alerts.
8. **Migrate, then deploy.** Run the Deploy workflow (Actions, Deploy, choose the environment). It builds, pushes, runs the migrate job with the new image, then updates the service. Check `<service_url>/api/health` answers `{"ok":true}`.
9. **Register the sign-in callbacks.** In the Google OAuth client add `<AUTH_URL>/api/auth/callback/google`. In Resend verify the `EMAIL_FROM` domain.
10. **Before opening sign-ups.** Sign-ups stay on the allowlist. Do not set `signups = "open"` until the grievance contact is set (the app refuses it otherwise) and the privacy notice has had its legal review (ADR 0004).

After the first apply the Terraform ignores the image, so later deploys are the workflow only. Run Terraform again for any other change (variables, scaling, a new secret), keeping `enable_workloads=true` and passing a current `image` value (the value is ignored after creation, but must be non-empty).

## Add an address to the sign-up allowlist

The allowlist is the secret `ROLEWRIGHT_SIGNUP_ALLOWLIST`, read when an instance starts.

1. Read the current value so you can extend it: `gcloud secrets versions access latest --secret ROLEWRIGHT_SIGNUP_ALLOWLIST --project $PROJECT`.
2. Add a new version with the full list: `printf '%s' 'a@example.com,@example.org' | gcloud secrets versions add ROLEWRIGHT_SIGNUP_ALLOWLIST --project $PROJECT --data-file=-`.
3. Make running instances pick it up: `gcloud run services update rolewright --project $PROJECT --region asia-south1 --update-labels refreshed=$(date +%s)` (any change creates a new revision that reads the latest version).

An `@domain` entry admits everyone at that domain. Prefer full addresses.

## Test the purge alert

The alert counts failed calls to the purge route, and failed scheduler attempts.

1. Send an unauthenticated call: `curl -i -X POST <service_url>/api/internal/purge`. It answers 401 and deletes nothing.
2. Within a few minutes the "Rolewright purge call failed" policy fires and emails the alert address. Check Monitoring, Alerting, Incidents. The incident closes by itself after a day without failures.
3. To prove the scheduler path, run the job by hand: `gcloud scheduler jobs run rolewright-purge --project $PROJECT --location asia-south1`, and look at Logs Explorer for `resource.type="cloud_scheduler_job"`. A healthy run answers 200 with `{"purged": <n>}`.

If you do not receive the email, confirm the notification channel is verified (Monitoring, Alerting, Edit notification channels).

## Rollback

- **A bad deploy.** List revisions: `gcloud run revisions list --service rolewright --project $PROJECT --region asia-south1`. Send all traffic to the last good one: `gcloud run services update-traffic rolewright --project $PROJECT --region asia-south1 --to-revisions <good-revision>=100`. Terraform ignores the image, so this does not fight it.
- **A bad migration.** Migrations only move forward. Restore from the database's point-in-time recovery to a new instance (`gcloud sql instances clone rolewright rolewright-restore --point-in-time <UTC time> --project $PROJECT`), check it, then point the two connection-string secrets at the clone's private IP and roll the service. Do this rather than editing data in place. Keep the old instance until the restored one is proven.
- **A bad secret value.** Add the previous value as a new version, then redeploy as in the allowlist steps. Disable the bad version after.
- **Teardown** (never in production without the owner): set `db_deletion_protection=false` in its own apply first.

## Notes the owner must decide or keep

- **HSTS `includeSubDomains`.** The app's security headers decide this (see `apps/web/next.config.mjs`). Decide before mapping an apex domain: `includeSubDomains` on an apex binds every subdomain to HTTPS for the length of the policy, including ones you have not made yet. Map a subdomain such as `app.<domain>` first, and only add `includeSubDomains` (and later `preload`) on the apex deliberately.
- **Request logs must not include headers (ADR 0003).** The user's AI key travels in the `x-llm-key` header. Cloud Run's request logs do not record request headers by default, and the app's own logs never do. Do not enable any header logging. If a load balancer is added later (for a custom domain, Cloud Armor or a CDN), keep its request logging free of headers (no custom header logging, no payload logging), and set `trusted_proxy_hops` to the number of proxies in front of the app so client addresses stay correct for the rate limits.
- **Database SSL.** The instance is private-IP only and accepts encrypted and unencrypted connections from inside the VPC. If you require encryption, change `ssl_mode` on the instance and check the `pg` connection options first; do not turn it on blind.
- **Cold starts.** PDF export cold starts include Chromium. Production keeps one instance warm (`min_instances = 1`); raise memory or minimum instances if export latency matters.
