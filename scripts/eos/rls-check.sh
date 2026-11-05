#!/usr/bin/env bash
# EOS v1a RLS/soft-delete checks against STAGING. Usage: U=https://<ref>.supabase.co K=<publishable> EOS_CREDS_FILE=... bash scripts/eos/rls-check.sh
set -u
source <(grep = "${EOS_CREDS_FILE:-/home/box/.eos-staging-creds}" | sed 's/^/export /')
for t in eos_commitments eos_issues eos_projects eos_import_rows eos_account_summary; do
  echo "anon select $t -> $(curl -s -o /dev/null -w '%{http_code}' "$U/rest/v1/$t?select=id&limit=1" -H "apikey: $K") (expect 401)"; done
TOK=$(curl -s "$U/auth/v1/token?grant_type=password" -H "apikey: $K" -H 'content-type: application/json' -d "{\"email\":\"$EOS_TEST_EMAIL\",\"password\":\"$EOS_TEST_PASSWORD\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
A=(-H "apikey: $K" -H "Authorization: Bearer $TOK")
ID=$(curl -s "$U/rest/v1/eos_issues?select=id&limit=1" "${A[@]}" | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['id'])")
echo "member DELETE issue -> $(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$U/rest/v1/eos_issues?id=eq.$ID" "${A[@]}") (expect 403)"
echo "member UPDATE import_rows -> $(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$U/rest/v1/eos_import_rows?row_ordinal=eq.2" "${A[@]}" -H 'content-type: application/json' -d '{"needs_review":false}') (expect 403)"
echo "member INSERT activity -> $(curl -s -o /dev/null -w '%{http_code}' -X POST "$U/rest/v1/eos_activity" "${A[@]}" -H 'content-type: application/json' -d '{"table_name":"x","record_id":"'$ID'","action":"forged"}') (expect 403)"
echo "public storage URL -> $(curl -s -o /dev/null -w '%{http_code}' "$U/storage/v1/object/public/eos-attachments/x") (expect 400, private bucket)"
