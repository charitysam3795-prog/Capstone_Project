#!/usr/bin/env bash
set -euo pipefail

cd /app

# Railway injects env vars — there is no committed .env. Create an empty one so
# artisan commands that touch the file do not crash.
if [[ ! -f .env ]]; then
  if [[ -f .env.example ]]; then
    cp .env.example .env
  else
    touch .env
  fi
fi

# Parse mysql://user:pass@host:port/db into DB_* (Railway often provides DATABASE_URL / MYSQL_URL)
parse_mysql_url() {
  local url="$1"
  [[ -z "$url" ]] && return 0
  # strip mysql:// or mysql2://
  local rest="${url#mysql://}"
  rest="${rest#mysql2://}"
  local creds="${rest%%@*}"
  local hostpart="${rest#*@}"
  local user="${creds%%:*}"
  local pass="${creds#*:}"
  local hostport="${hostpart%%/*}"
  local db="${hostpart#*/}"
  db="${db%%\?*}"
  local host="${hostport%%:*}"
  local port="${hostport##*:}"
  [[ "$host" == "$port" ]] && port="3306"
  export DB_USERNAME="${DB_USERNAME:-$user}"
  export DB_PASSWORD="${DB_PASSWORD:-$pass}"
  export DB_HOST="${DB_HOST:-$host}"
  export DB_PORT="${DB_PORT:-$port}"
  export DB_DATABASE="${DB_DATABASE:-$db}"
}

# Railway MySQL plugin often injects MYSQL*; Laravel expects DB_*
export DB_CONNECTION="${DB_CONNECTION:-mysql}"
export DB_HOST="${DB_HOST:-${MYSQLHOST:-${MYSQL_HOST:-}}}"
export DB_PORT="${DB_PORT:-${MYSQLPORT:-${MYSQL_PORT:-3306}}}"
export DB_DATABASE="${DB_DATABASE:-${MYSQLDATABASE:-${MYSQL_DATABASE:-${MYSQL_DB:-}}}}"
export DB_USERNAME="${DB_USERNAME:-${MYSQLUSER:-${MYSQL_USER:-}}}"
export DB_PASSWORD="${DB_PASSWORD:-${MYSQLPASSWORD:-${MYSQL_PASSWORD:-}}}"

if [[ -z "${DB_HOST:-}" ]]; then
  parse_mysql_url "${DATABASE_URL:-}"
fi
if [[ -z "${DB_HOST:-}" ]]; then
  parse_mysql_url "${MYSQL_URL:-}"
fi
if [[ -z "${DB_HOST:-}" ]]; then
  parse_mysql_url "${MYSQL_PRIVATE_URL:-}"
fi

# Ensure writable runtime dirs (+ public avatar storage)
mkdir -p storage/framework/{cache,sessions,views} storage/logs bootstrap/cache storage/app/public/avatars
chmod -R ug+rwx storage bootstrap/cache || true
# Symlink public/storage → storage/app/public (safe if already linked)
php artisan storage:link || true

# Clear stale caches when env changes on Railway
php artisan config:clear || true
php artisan route:clear || true
php artisan view:clear || true

# Email links (password reset, verify email) must use this service's live public URL.
if [[ -n "${RAILWAY_PUBLIC_DOMAIN:-}" ]]; then
  _railway_app_url="https://${RAILWAY_PUBLIC_DOMAIN}"
  if [[ -z "${FRONTEND_URL:-}" ]]; then
    export FRONTEND_URL="${_railway_app_url}"
  fi
  if [[ -z "${APP_URL:-}" ]] || [[ "${APP_URL}" == *"capstoneproject-production"* ]]; then
    export APP_URL="${_railway_app_url}"
  fi
fi

# Missing APP_KEY causes 500 on every request. Prefer a value set in Railway
# Variables; otherwise generate an ephemeral key in-memory (no file write).
if [[ -z "${APP_KEY:-}" ]]; then
  echo "WARN: APP_KEY was empty — generating ephemeral key. Set APP_KEY in Railway Variables."
  export APP_KEY="base64:$(php -r 'echo base64_encode(random_bytes(32));')"
fi

# File sessions/cache by default so partial DBs (missing `sessions` table) do not 500.
# Override in Railway Variables if you want database sessions after a full SQL import.
export SESSION_DRIVER="${SESSION_DRIVER:-file}"
export CACHE_STORE="${CACHE_STORE:-file}"
export QUEUE_CONNECTION="${QUEUE_CONNECTION:-sync}"

# Migrations are NOT run on boot (existing Railway tables / SQL dump).
if [[ "${RUN_MIGRATIONS:-false}" == "true" ]]; then
  echo "WARN: RUN_MIGRATIONS=true is ignored on Railway boot (tables may already exist)."
  echo "WARN: Import your SQL dump, or run: php artisan migrate --force  from the Railway shell."
fi

# Safe additive migrations (nullable columns) — profile photos stored in DB on Railway.
php artisan migrate --path=database/migrations/2026_10_02_120000_add_avatar_blob_to_tbl_users.php --force \
  || echo "WARN: avatar blob migration skipped or failed."

# One-shot: reset Student passwords to first word of first_name + 123 (e.g. CYRUS VITERBO -> cyrus123).
# Set RESET_STUDENT_DEFAULT_PASSWORDS=true in Railway Variables for one deploy, then set back to false.
if [[ "${RESET_STUDENT_DEFAULT_PASSWORDS:-false}" == "true" ]]; then
  echo "RESET_STUDENT_DEFAULT_PASSWORDS=true — resetting student default passwords..."
  php artisan students:reset-default-passwords || echo "WARN: student default password reset failed."
  echo "Done. Set RESET_STUDENT_DEFAULT_PASSWORDS=false so this does not run on every restart."
fi

# One-shot data sync: replace BSIT Effective SY 2022-2023 junk (test/ELE/MEE) with CMO checklist.
# Idempotent — skips when the header already has the full curriculum.
# Always merges legacy CS/SD track aliases into CYBER / SYS DEV and rebuilds Digi Elective 4.
echo "Syncing BSIT 2022-2023 curriculum (if needed)..."
php artisan curriculum:import-bsit-2022 || echo "WARN: BSIT 2022 curriculum sync skipped or failed."
echo "Syncing BSIT tracks / elective slots..."
php scripts/maintenance/sync_bsit_tracks_and_electives.php || echo "WARN: BSIT track/elective sync skipped or failed."

# Close abandoned "Active" login rows past the idle window (tab closed / app killed).
php artisan sessions:close-stale || echo "WARN: stale session close skipped or failed."

# Optional Railway volume at /data keeps .sql files across redeploys (MySQL also stores gzipped copies).
if [[ -d /data ]]; then
  mkdir -p /data/backups
  export BACKUP_STORAGE_PATH="${BACKUP_STORAGE_PATH:-/data/backups}"
fi

php artisan migrate --path=database/migrations/2026_10_07_120000_add_file_payload_to_backup_history.php --force \
  || echo "WARN: backup file_payload migration skipped or failed."
php artisan backup:attach-missing-payloads || echo "WARN: backup payload attach skipped or failed."

php artisan migrate --path=database/migrations/2026_10_07_130000_restore_prerequisite_slot_on_elective_slot.php --force \
  || echo "WARN: elective prerequisite_slot migration skipped or failed."
php artisan electives:sync-it-prerequisite-chain || echo "WARN: IT elective prerequisite sync skipped or failed."

php artisan migrate --path=database/migrations/2026_10_09_120000_add_term_to_academic_record_evaluation_complete.php --force \
  || echo "WARN: evaluation-complete term migration skipped or failed."

php artisan migrate --path=database/migrations/2026_10_12_120000_add_evaluation_promote_permission.php --force \
  || echo "WARN: evaluation.promote permission migration skipped or failed."
php artisan migrate --path=database/migrations/2026_10_12_130000_subject_crediting_full_access_only.php --force \
  || echo "WARN: subject crediting full-access migration skipped or failed."
php artisan migrate --path=database/migrations/2026_10_12_140000_import_export_and_curriculum_header_permissions.php --force \
  || echo "WARN: import/export + curriculum header permission migration skipped or failed."

php artisan config:cache || true
php artisan route:cache || true

PORT="${PORT:-8000}"
echo "Starting Academic Evaluation System on 0.0.0.0:${PORT}"
echo "APP_URL=${APP_URL:-unset} DB_HOST=${DB_HOST:-unset} DB_DATABASE=${DB_DATABASE:-unset}"

# Laravel scheduler must run for backup:run-scheduled (daily 00:01) and INC expiry.
# Railway has no system cron — keep schedule:work alive beside the HTTP server.
# Do not use `exec` here: the shell must stay alive so the EXIT trap can stop the scheduler.
php artisan schedule:work --verbose &
SCHEDULER_PID=$!
cleanup() {
  kill "${SCHEDULER_PID}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Laravel scheduler started (pid ${SCHEDULER_PID})"
php artisan serve --host=0.0.0.0 --port="${PORT}"
