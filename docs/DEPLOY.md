# Deploying to GCP Cloud Run

The app ships as a standalone container (see the repo `Dockerfile`) and runs on
**Cloud Run**. Deploys are automated: every push to `main` runs
[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml), which builds
the image, pushes it to **Artifact Registry**, and rolls out a new revision.

Auth is **keyless** — GitHub Actions authenticates to GCP with **Workload
Identity Federation (WIF)**, so there is no service-account key to store or
rotate. This page is the one-time setup to make that pipeline work.

> **Single instance, by design.** Server-side state (import jobs / proof
> sessions) assumes one instance today (`STUBS.md`). The workflow pins
> `--max-instances=1`. Don't raise it until that state moves to a shared store.

---

## What the pipeline expects

| Thing | Value used by the workflow | Where it's set |
|---|---|---|
| Region | `us-central1` | `env.GCP_REGION` in `deploy.yml` |
| Cloud Run service | `store-tools-poc` | `env.SERVICE` in `deploy.yml` |
| Artifact Registry repo | `store-tools-poc` (Docker format) | `env.ARTIFACT_REPO` in `deploy.yml` |
| GCP project id | your project | repo **Variable** `GCP_PROJECT_ID` |
| WIF provider resource name | full `projects/.../providers/...` path | repo **Variable** `GCP_WORKLOAD_IDENTITY_PROVIDER` |
| Deploy service account | `github-deployer@<project>.iam...` | repo **Variable** `GCP_SERVICE_ACCOUNT` |

If you change region / service / repo names, edit the `env:` block in
`deploy.yml` **and** re-run the matching commands below with the new values.

---

## One-time GCP setup

Run these once with the `gcloud` CLI, authenticated as a project owner. Set the
variables at the top to match your environment.

```bash
# ---- edit these ----
export PROJECT_ID="your-gcp-project-id"
export REGION="us-central1"
export REPO="store-tools-poc"            # Artifact Registry repo (Docker)
export SERVICE="store-tools-poc"         # Cloud Run service
export SA_NAME="github-deployer"         # deploy service account
export POOL="github-pool"                # WIF pool
export PROVIDER="github-provider"        # WIF provider
export GITHUB_REPO="campecho/storeToolsPOC"   # owner/repo, exact case
# --------------------

gcloud config set project "$PROJECT_ID"
export PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
export SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

# 1) Enable the APIs the pipeline touches.
#    iamcredentials = the WIF token exchange; run + artifactregistry = deploy/push.
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  iamcredentials.googleapis.com

# 2) Create the Docker repository images are pushed to.
gcloud artifacts repositories create "$REPO" \
  --repository-format=docker \
  --location="$REGION" \
  --description="Store Tools POC container images"

# 3) Create the service account GitHub Actions deploys as.
gcloud iam service-accounts create "$SA_NAME" \
  --display-name="GitHub Actions deployer (Store Tools POC)"

# 4) Grant it exactly what a deploy needs:
#    - run.admin           deploy/update the Cloud Run service
#    - artifactregistry.writer   push image layers
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" --role="roles/run.admin"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" --role="roles/artifactregistry.writer"

# 5) Cloud Run runs the container as a *runtime* SA (the Compute Engine default
#    SA unless you set --service-account). The deployer must be allowed to act
#    as it, scoped to just that SA rather than the whole project.
export RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --member="serviceAccount:${SA_EMAIL}" --role="roles/iam.serviceAccountUser"
```

### Wire up Workload Identity Federation

```bash
# 6) A pool + an OIDC provider that trusts GitHub's token issuer. The attribute
#    condition restricts the whole provider to this GitHub org — a hard security
#    boundary so tokens from other orgs are rejected outright.
gcloud iam workload-identity-pools create "$POOL" \
  --location=global \
  --display-name="GitHub Actions pool"

gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" \
  --location=global \
  --workload-identity-pool="$POOL" \
  --display-name="GitHub provider" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --attribute-condition="assertion.repository_owner == '${GITHUB_REPO%%/*}'"

# 7) Let ONLY this repository impersonate the deploy SA. Even though the provider
#    trusts the org, this binding narrows impersonation to the one repo.
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.repository/${GITHUB_REPO}"

# 8) Print the two values you'll paste into GitHub repo Variables.
echo "GCP_PROJECT_ID                 = ${PROJECT_ID}"
echo "GCP_SERVICE_ACCOUNT            = ${SA_EMAIL}"
echo -n "GCP_WORKLOAD_IDENTITY_PROVIDER = "
gcloud iam workload-identity-pools providers describe "$PROVIDER" \
  --location=global --workload-identity-pool="$POOL" \
  --format="value(name)"
```

---

## Set the GitHub repo Variables

In the repo: **Settings → Secrets and variables → Actions → Variables → New
repository variable**. Add the three values printed by step 8:

| Variable | Example |
|---|---|
| `GCP_PROJECT_ID` | `my-project-123456` |
| `GCP_SERVICE_ACCOUNT` | `github-deployer@my-project-123456.iam.gserviceaccount.com` |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | `projects/123456789/locations/global/workloadIdentityPools/github-pool/providers/github-provider` |

These are **Variables**, not Secrets — WIF is keyless, so none of them are
sensitive credentials. (They can be Secrets if you prefer; the workflow reads
them from `vars.*`, so if you move them to Secrets, switch those references to
`secrets.*`.)

---

## Deploy

- **Automatic:** merge to `main`. The workflow builds and rolls out the new
  revision, then prints the service URL in the job summary.
- **Manual:** the **Deploy to Cloud Run** workflow has a *Run workflow* button
  (`workflow_dispatch`) to redeploy the current `main` on demand.

First deploy? Do it manually once from the Actions tab after the setup above, so
you can watch it end to end.

### Verify a rollout

```bash
gcloud run services describe store-tools-poc --region us-central1 \
  --format='value(status.url)'
# then hit the import health endpoint — it should report live (not fixture) mode,
# because the image bundles libmspub-tools:
curl "$(gcloud run services describe store-tools-poc --region us-central1 --format='value(status.url)')/api/import"
# → {"mode":"live", ...}
```

---

## Notes & knobs

- **Public access.** `--allow-unauthenticated` makes the service reachable by
  anyone with the URL. Fine for a demo; to restrict it, drop that flag and front
  the service with [IAP](https://cloud.google.com/iap) or your own auth.
- **Live imports.** The image installs `libmspub-tools`, so `.pub` conversion
  runs for real in Cloud Run. Do **not** set `STP_IMPORT_FIXTURE` on the service
  unless you deliberately want demo/fixture mode.
- **Resources.** `--cpu=1 --memory=1Gi` gives the conversion subprocess headroom
  above the 512Mi default. The importer's own caps (25 MB / 20 s) still apply.
- **Cost.** `--min-instances=0` scales to zero when idle. Set it to `1` to keep
  a warm instance (no cold starts) at the price of always-on billing.
- **Rollback.** `gcloud run services update-traffic store-tools-poc
  --region us-central1 --to-revisions=<REVISION>=100`, or roll back from the
  Cloud Run console's Revisions tab. Every image is tagged with its commit SHA.
