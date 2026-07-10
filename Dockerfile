# Multi-stage build: deps → builder → standalone runner.
# Targets Cloud Run: binds 0.0.0.0:$PORT (default 8080), runs unprivileged.
#
# The runner is Debian slim, not Alpine, since P1 (plan §10.1): the `.pub`
# import pipeline shells out to `pub2raw` (libmspub-tools), which is a
# glibc/Debian package with no Alpine build. This image is the ONLY place
# live conversion runs — dev/CI use fixture mode with no native dependency.
# NOTE: single-instance deploy (e.g. Cloud Run max-instances=1) while server
# state is in-memory — see STUBS.md.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
# libmspub-tools: pub2raw/pub2xhtml + librevenge — the import pipeline's parser.
# lcms2-utils: tificc — the CMYK-preserving path (plan §1.3, PE5). Both run as
# the unprivileged user (sandboxing posture per plan §10.1). (poppler is CI-only
# — it backs pdf-wrap's preflight proxy, not the runtime.)
RUN apt-get update \
    && apt-get install -y --no-install-recommends libmspub-tools lcms2-utils \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=builder /app/public ./public
# Golden traces ride along: fixture mode (and the demo payload) must work in
# the image too, e.g. when a deploy pins STP_IMPORT_FIXTURE=1.
COPY --from=builder /app/fixtures ./fixtures
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 8080
CMD ["node", "server.js"]
