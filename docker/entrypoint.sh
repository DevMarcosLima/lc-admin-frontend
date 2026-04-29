#!/usr/bin/env sh
set -eu

TEMPLATE_PATH="/usr/share/nginx/html/config.template.js"
OUTPUT_PATH="/usr/share/nginx/html/config.js"

if [ -f "$TEMPLATE_PATH" ]; then
  envsubst '${VITE_API_URL} ${VITE_API_PREFIX} ${VITE_ADMIN_EMAIL}' < "$TEMPLATE_PATH" > "$OUTPUT_PATH"
fi

exec "$@"
