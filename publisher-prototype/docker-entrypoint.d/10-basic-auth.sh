#!/bin/sh
# Turns the deployment's shared password into nginx credentials.
#
# The hosted build sits behind one static password supplied as APP_PASSWORD
# (Cloud Run injects it from Secret Manager). nginx wants that as an htpasswd
# file, so write both the credentials and the snippet the server block
# includes. No APP_PASSWORD → auth off, so a plain `docker run` (local smoke,
# CI image check) still serves the app.
set -eu

AUTH_CONF=/tmp/auth.conf
HTPASSWD=/tmp/htpasswd
REALM="publisher-prototype"

if [ -n "${APP_PASSWORD:-}" ]; then
  # nginx's own {PLAIN} scheme: this image ships neither htpasswd nor openssl,
  # and hashing would buy nothing — the file lives in the container's tmpfs
  # next to the environment variable it was read from.
  printf '%s:{PLAIN}%s\n' "${APP_USER:-prototype}" "$APP_PASSWORD" > "$HTPASSWD"
  chmod 600 "$HTPASSWD"
  printf 'auth_basic "%s";\nauth_basic_user_file %s;\n' "$REALM" "$HTPASSWD" > "$AUTH_CONF"
else
  echo "10-basic-auth.sh: APP_PASSWORD unset — serving without a password gate"
  printf 'auth_basic off;\n' > "$AUTH_CONF"
fi
