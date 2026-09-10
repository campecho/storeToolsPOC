# syntax=docker/dockerfile:1
#
# Container image for the prototype — a fully client-side Vite SPA (PLAN.md
# §6.7), so the runtime is a static file server and nothing else. Targets
# Cloud Run: listens on $PORT (default 8080) and runs unprivileged.

FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build              # tsc --noEmit && vite build → dist/

FROM nginxinc/nginx-unprivileged:alpine AS runner
# Cloud Run injects PORT (default 8080); the template listens on it via the
# image's built-in envsubst entrypoint.
ENV PORT=8080
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 8080
# nginx-unprivileged already runs as non-root (uid 101) — no addgroup/adduser
# needed to satisfy the unprivileged deploy contract.
