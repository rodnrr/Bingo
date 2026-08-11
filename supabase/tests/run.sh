#!/usr/bin/env bash
#
# Apply every migration to a scratch Postgres and exercise the flows that
# would cost real money if they were wrong.
#
# This is not a substitute for testing against Supabase — auth.uid(),
# storage, and the JWT plumbing are stubbed here (see stubs.sql), so RLS
# is only proved to *parse*, not to hold against a real request. What it
# does prove is that the migrations apply in order, and that the
# functions behave: no overselling, invites are finite, deadlines bite,
# and nobody can promote themselves.
#
# It has already earned its keep once — it caught three bugs that would
# have shipped, including one where nobody could join at all.
#
#   sudo ./supabase/tests/run.sh
#
set -euo pipefail

DB=beengo_test
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS="$HERE/../migrations"

if ! command -v psql >/dev/null; then
  echo "psql not found. On Debian/Ubuntu: apt-get install -y postgresql"
  exit 1
fi

# Start the cluster if it is not already up.
if ! pg_isready -q 2>/dev/null; then
  pg_ctlcluster "$(ls /usr/lib/postgresql | head -1)" main start
  sleep 2
fi

# psql runs as the postgres user, which cannot read files under a
# root-owned checkout — stage them somewhere it can.
STAGE=$(mktemp -d)
chmod 755 "$STAGE"
cp "$HERE"/*.sql "$MIGRATIONS"/*.sql "$STAGE"/
chmod 644 "$STAGE"/*.sql
trap 'rm -rf "$STAGE"' EXIT

run() { su postgres -c "psql -v ON_ERROR_STOP=1 -q -d $DB -f $1"; }

echo "── Rebuilding $DB ──"
su postgres -c "dropdb --if-exists $DB && createdb $DB"
run "$STAGE/stubs.sql"

echo "── Applying migrations ──"
for f in "$STAGE"/[0-9][0-9][0-9]_*.sql; do
  printf '   %s\n' "$(basename "$f")"
  run "$f"
done

echo "── Smoke tests ──"
OUT=$(su postgres -c "psql -q -A -t -d $DB -f $STAGE/smoke.sql" 2>&1) || true

PASS=$(printf '%s' "$OUT" | grep -c '^t$'  || true)
FAIL=$(printf '%s' "$OUT" | grep -c '^f$'  || true)
GUARD=$(printf '%s' "$OUT" | grep -ci 'NOTICE:  pass' || true)
ERRS=$(printf '%s' "$OUT" | grep -i '^ERROR\|FAIL —' || true)

echo "   assertions passed : $PASS"
echo "   assertions failed : $FAIL"
echo "   guards fired      : $GUARD"

if [ -n "$ERRS" ] || [ "$FAIL" -ne 0 ]; then
  echo
  echo "FAILED:"
  printf '%s\n' "$ERRS"
  printf '%s\n' "$OUT" | grep -B2 '^f$' || true
  exit 1
fi

echo
echo "All green."
