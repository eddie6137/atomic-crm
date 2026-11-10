# AOM → Atomic action link (isolate)

Atomic side of the AOM⇄Atomic link (addendum Rev 0.2.1). **Kill switch defaults OFF.** Nothing here is
enabled by shipping the code; flipping is an ops step in the platform secret store, never a UI control.

## Secret / config NAMES (values live only in each platform store; never committed)

| Name | Where | Purpose |
|---|---|---|
| `ATOMIC_AOM_LINK_ENABLED` | edge function env | Kill switch, read **per request**. Unset / false / unparsable = OFF |
| `ATOMIC_AOM_LINK_HMAC_SECRET` | edge function env | Verifies AOM projections, signs write-backs (same value as AOM's `AOM_ATOMIC_LINK_HMAC_SECRET`) |
| `ATOMIC_AOM_LINK_AUDIENCE` | edge function env | Audience the ingress requires; staging value must differ from production |
| `ATOMIC_AOM_LINK_AOM_URL` | edge function env | AOM base URL the write-back sender calls |
| `VITE_AOM_APP_ORIGIN` | build-time (optional) | Origin used to render the "Open in AOM" link; without it the AOM path is shown as text |

## Pieces

- `supabase/functions/aom-link-ingest` — HMAC ingress. 401 bad/missing/skewed signature, 403 `link_off` /
  `wrong_audience`, all decided before any database call. Calls RPC `eos_aom_link_apply` (service_role only).
- `supabase/migrations/20261110120000_aom_atomic_link.sql` (+ `supabase/schemas/21_…`, rollback in
  `supabase/rollbacks/`) — `eos_action_source_map`, `eos_aom_client_map` (admin-only writes, no
  service_role bypass), delivery table for idempotent replay, AOM-row guard on `eos_commitments`, the RPC.
  **Not applied to Atomic staging or production.** Proven only on a local scratch database.
- `supabase/functions/aom-link-writeback` — signed Start / Complete / Skip request to AOM. Atomic never writes
  AOM-owned status; AOM accepts or rejects and re-projects. Complete is only legal from AOM `in_progress`.
- UI: `eos/AomLinkPanel.tsx` in the action drawer. Complete is not offered on an `open` AOM-originated card;
  any rejection restores the last projected status and shows the error.

## Local test

Server-side SQL tests need a scratch Postgres database named `atomic_aom_link_test`:
`ATOMIC_AOM_LINK_TEST_DATABASE_URL=<local scratch url> npm run test:unit:functions` (skipped when unset).
