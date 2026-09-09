# Deploying the store tools to Cloud Run

How both apps in this repo get hosted: **GitHub Actions → Cloud Run on merge to
`main`**, the same keyless (Workload Identity Federation) pipeline `campecho/protoLab`
already runs, and the same GCP project. Two services, because the repo holds two
applications and they must stay separable:

| Service (Cloud Run) | Source | What it is | Sizing |
|---|---|---|---|
| `store-tools-poc` | repo root `Dockerfile` | Next standalone server: templates, `.pub` import, layout + photo editors, `/launcher` | 2Gi / 2 vCPU, **`--max-instances=1`** |
| `publisher-prototype` | `publisher-prototype/Dockerfile` | Static Vite SPA on unprivileged nginx | 256Mi / 1 vCPU, max 2 |

`--max-instances=1` on the POC is a correctness constraint, not tuning: import jobs and
proof sessions are in-memory server state (`STUBS.md`, *Import server state*), so a
second instance would answer with a different session's world.

The entry point you hand out is **`https://<store-tools-poc URL>/launcher`** — the
wrapper page that offers both apps and asks for the shared password.

---

## 1. What's in the repo (and what each piece is for)

| File | Purpose |
|---|---|
| `.github/workflows/deploy-poc-cloud-run.yml` | POC deploy on merge to `main` (skips prototype-only and docs-only pushes) |
| `.github/workflows/deploy-prototype-cloud-run.yml` | Prototype deploy, triggered only by `publisher-prototype/**` |
| `publisher-prototype/Dockerfile` + `nginx.conf.template` + `.dockerignore` | The prototype's static image: `$PORT` contract, SPA fallback, immutable hashed assets |
| `publisher-prototype/docker-entrypoint.d/10-basic-auth.sh` | Turns `$APP_PASSWORD` into nginx Basic auth at container start; no password → open |
| `src/middleware.ts` | The POC's gate: no valid cookie → `/launcher` (HTML) or `401` (API) |
| `src/app/launcher/page.tsx`, `src/components/launcher/LauncherScreen.tsx` | The wrapper page: password form, then a card per app |
| `src/app/api/access/route.ts`, `src/lib/access/*` | Password check and the signed, short-lived session cookie |

The POC image already existed (it is what the `docker` CI lane smoke-tests); nothing
about the build changed for deployment.

### How the password works

One shared password, one Secret Manager secret, injected into both services:

- **POC** — `STP_ACCESS_PASSWORD`. `src/middleware.ts` gates *every* path except
  `/launcher`, `/api/access` and `/fonts/*`. A correct password at `/launcher` mints an
  HttpOnly cookie (HMAC-SHA256 over its own expiry, keyed by the password, 12h TTL), so
  the password itself isn't replayed on later requests. Rotating the password invalidates
  every outstanding cookie for free — it *is* the signing key.
- **Prototype** — `APP_PASSWORD`, enforced as HTTP Basic auth by nginx (username
  `prototype`). A static site has no server to check a cookie, and Basic auth covers the
  assets too, not just the shell.
- **Neither variable set → no gate.** That's what `npm run dev`, the Playwright suites
  and the CI image lanes run against, and it's why forgetting the variable fails open.
  Check a deployment with `curl -o /dev/null -w '%{http_code}' <url>/`: `307` (POC) or
  `401` (prototype) means the gate is live; `200` means it isn't.

**What this does and doesn't buy.** Both services are `--allow-unauthenticated`, so the
gate is the only thing in front of the POC's upload/convert routes — which is why it lives
in middleware rather than in the launcher page's markup, and why the CI lane asserts
`/api/import` answers `401`. It is still a shared static password over a public URL: fine
for a demo, not a substitute for IAM/IAP if this ever holds anything real.

---

## 2. One-time GCP setup (reusing protoLab's project)

protoLab's project already has the deploy service account, the `github` Workload Identity
pool, and the Cloud Build/Artifact Registry plumbing. Three things are missing for this
repo. Run as a project owner:

```sh
PROJECT_ID=design-studio-498915           # protoLab's project (user, 2026-09-09)
REGION=us-central1                       # match protoLab's GCP_REGION
REPO=campecho/storetoolspoc              # lowercase — the WIF condition is exact-match
SA="gh-deployer@${PROJECT_ID}.iam.gserviceaccount.com"
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
```

**1. Enable Secret Manager** (the rest of the APIs are already on from protoLab):

```sh
gcloud services enable secretmanager.googleapis.com --project "$PROJECT_ID"
```

**2. A WIF provider for this repo.** protoLab's provider pins
`assertion.repository=='campecho/protolab'`, so a second repo needs its own provider in
the same pool — leaving protoLab's working path untouched:

```sh
gcloud iam workload-identity-pools providers create-oidc storetoolspoc \
  --location=global --workload-identity-pool=github \
  --display-name="GitHub OIDC — storeToolsPOC" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='${REPO}'" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --project "$PROJECT_ID"

# Let this repo's workflows impersonate the existing deployer. The principalSet
# names the POOL and the repository attribute, so this is additive to protoLab's.
gcloud iam service-accounts add-iam-policy-binding "$SA" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github/attribute.repository/${REPO}" \
  --project "$PROJECT_ID"

# The GCP_WIF_PROVIDER value for §3, printed with the project number resolved:
echo "projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github/providers/storetoolspoc"
```

**3. The shared password, and who may read it:**

```sh
printf '%s' '<choose a password>' | gcloud secrets create store-tools-access-password \
  --data-file=- --replication-policy=automatic --project "$PROJECT_ID"

# The RUNTIME service account reads the secret at container start. Miss this and the
# revision crash-loops with a secret-access error — the one classic failure here.
gcloud secrets add-iam-policy-binding store-tools-access-password \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role=roles/secretmanager.secretAccessor --project "$PROJECT_ID"

# The deployer only needs to see that the secret exists in order to wire it up.
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA}" --role=roles/secretmanager.viewer
```

**Rotating it** later: add a new version
(`printf '%s' '<new>' | gcloud secrets versions add store-tools-access-password --data-file=-`),
then redeploy or `gcloud run services update <service> --region "$REGION"` on both
services so they pick up `:latest`. Every POC cookie dies with the old password.

---

## 3. GitHub repository configuration

**Settings → Secrets and variables → Actions → Variables** (all non-secret — the password
itself lives in Secret Manager, and only its *name* appears here):

| Variable | Value |
|---|---|
| `GCP_PROJECT_ID` | `design-studio-498915` (protoLab's project) |
| `GCP_REGION` | `us-central1` (match §2) |
| `GCP_DEPLOY_SA` | `gh-deployer@design-studio-498915.iam.gserviceaccount.com` |
| `GCP_WIF_PROVIDER` | `projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/github/providers/storetoolspoc` — the project *number*, which §2 prints |
| `POC_CLOUD_RUN_SERVICE` | `store-tools-poc` |
| `PROTOTYPE_CLOUD_RUN_SERVICE` | `publisher-prototype` |
| `ACCESS_PASSWORD_SECRET` | `store-tools-access-password` (omit to deploy with no gate) |
| `PROTOTYPE_URL` | the prototype service's URL — set it after the prototype's first deploy prints it |

`PROTOTYPE_URL` is the one ordering wrinkle: the launcher can't link to a service that
doesn't exist yet. Deploy the prototype first, set the variable, then the POC's next
deploy renders the second card. Until then the launcher shows that card as *not linked
yet* rather than a dead link.

Also worth doing: make the `CI` checks required on `main` (Settings → Branches), so
merges — and therefore deploys — only ever happen on code that passed the gates.

---

## 4. Verification

**Before any GCP work**, both images are provable locally — and are proven on every
push by CI (`ci.yml`'s `docker` lane, `publisher-prototype-ci.yml`'s `docker` lane):

```sh
# POC: boots, converts, and — with a password set — refuses everything but the gate
docker build -t store-tools-poc .
docker run --rm -p 8080:8080 -e STP_ACCESS_PASSWORD=hunter2 \
  -e STP_PROTOTYPE_URL=https://prototype.example store-tools-poc
curl -o /dev/null -w '%{http_code}\n' localhost:8080/           # 307 → /launcher
curl -o /dev/null -w '%{http_code}\n' localhost:8080/api/import # 401
curl -sc /tmp/jar -o /dev/null -d 'password=hunter2&next=/photo' localhost:8080/api/access
curl -o /dev/null -w '%{http_code}\n' -b /tmp/jar localhost:8080/photo  # 200

# Prototype: static host, SPA fallback, Basic auth
cd publisher-prototype
docker build -t publisher-prototype .
docker run --rm -p 8081:8080 -e APP_PASSWORD=hunter2 publisher-prototype
curl -o /dev/null -w '%{http_code}\n' localhost:8081/some/deep/link              # 401
curl -o /dev/null -w '%{http_code}\n' -u prototype:hunter2 localhost:8081/x/y    # 200 (index.html)
```

**After the first deploys**, on the live URLs:

1. `/launcher` asks for the password; a wrong one says so and sets no cookie.
2. Past the gate, both cards work — the prototype card leaves for the other service and
   asks for the same password once (Basic auth, username `prototype`).
3. The POC's own surfaces work: `/templates`, `/layout`, `/photo`, and
   `curl <poc>/api/import` reports `"mode":"live"` (the image bundles `libmspub-tools`,
   so a real `.pub` converts rather than falling back to the demo flyer).
4. A cold start after idle is expected: ~1s for the prototype's nginx, a few seconds for
   the POC's Node server.

## 5. Decisions taken here

| Decision | Choice | Note |
|---|---|---|
| Wrapper page location | A `/launcher` route inside the POC app | `/` stays the picker (`docs/UI_LAYOUT_REDESIGN_PLAN.md`, decision of record #9); the launcher sits beside it |
| Access control | Public services + one shared password | User decision, 2026-09-08. IAM/IAP is the stronger option if the demo ever holds real content |
| Password storage | One Secret Manager secret, both services | Rotation without touching the repo; no password in Actions variables or the image |
| GCP project | protoLab's, second WIF provider | One pipeline pattern, one project to administer |
| Prototype's server | nginx-unprivileged | Same as protoLab: envsubst `$PORT` template plus first-class `try_files` |
| Deploy trigger | Push to `main`, path-filtered per app | A prototype-only merge doesn't restart the POC, and vice versa |
