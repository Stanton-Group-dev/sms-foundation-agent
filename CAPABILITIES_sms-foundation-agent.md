---
repo: sms-foundation-agent
updated_at: 2026-08-27
scanned_at: 2026-08-27
head_sha: 26ac2dfa97243c476b02d3119e96cca640c29128
source: hand
generated: false
ttl_days: 90
action_surfaces:
  - "src/api/**"
  - "src/services/**"
  - "src/adapters/**"
  - "src/workflows/**"
---

## health-check
- type: api_endpoint
- status: shipped
- invoke: GET /health
- verified: unverified
- verified_at: null
- files: [src/api/health.py, src/main.py]
- hints: [readonly, idempotent]
- notes: Returns `{ok, version, checks}`. `checks.db` is hardcoded to the string "unknown" — there is no real DB probe wired in, only a config-loaded flag. Route body is a few lines, not a stub-200 (it does build and return a real settings-derived payload), but the DB check is a placeholder value rather than a live check.

## inbound-sms-webhook
- type: api_endpoint
- status: shipped
- invoke: POST /webhook/twilio/sms
- verified: unverified
- verified_at: null
- files: [src/api/webhooks/twilio.py, src/services/sms_inbound.py, src/services/language_detector.py, src/repositories/messages.py, src/repositories/conversations.py]
- hints: [idempotent]
- notes: Verifies `X-Twilio-Signature` (HMAC-SHA1 over exact URL + sorted form params) using `TWILIO_AUTH_TOKEN`; returns 403 on mismatch before touching the DB. Idempotent on `MessageSid`. On a new message it upserts the conversation, attempts a tenant lookup (see tenant-lookup-integration), runs a small regex-based EN/ES/PT language detector, and persists the chosen language. All DB and downstream-integration errors are caught and logged rather than raised, so the webhook still ACKs 200.

## delivery-status-webhook
- type: api_endpoint
- status: shipped
- invoke: POST /webhook/twilio/status
- verified: unverified
- verified_at: null
- files: [src/api/webhooks/twilio.py, src/services/status_service.py, src/repositories/status_events.py, src/repositories/messages.py]
- hints: [idempotent]
- notes: Same Twilio-signature verification as the inbound webhook. Looks up the message by `MessageSid`, appends a status-history event, and updates `delivery_status` on the message unless the previous status was already terminal (delivered/failed/undelivered), which keeps status transitions idempotent and one-directional.

## outbound-sms-send
- type: api_endpoint
- status: shipped
- invoke: POST /sms/send (body: {to, body, conversation_id?})
- verified: unverified
- verified_at: null
- files: [src/api/sms.py, src/services/sms_outbound.py, src/adapters/twilio_client.py, src/utils/retry.py]
- hints: [destructive, openworld]
- notes: Sends a real outbound SMS through the Twilio Messages REST API using Basic Auth (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_PHONE_NUMBER). No explicit feature-flag/kill-switch found in code — the only gate is that `TwilioClient.send_sms` raises `TwilioError("twilio_not_configured")` if any of the three Twilio env vars is blank, so an unconfigured deploy cannot send. Transient provider errors (5xx/429/network) are retried with capped exponential backoff (`TWILIO_SEND_MAX_RETRIES`/`_BASE_BACKOFF_MS`/`_BACKOFF_CAP_MS`, defaults 3/100ms/2000ms); permanent errors mark the message failed. Writes a pending message row before calling Twilio and updates it on success/failure.

## conversation-retrieval
- type: api_endpoint
- status: shipped
- invoke: GET /conversations/{phone_number}?page&limit&offset
- verified: unverified
- verified_at: null
- files: [src/api/conversations.py, src/services/conversations.py, src/repositories/messages.py, src/repositories/conversations.py]
- hints: [readonly]
- notes: Normalizes the path phone number to canonical form, looks up the conversation, and returns paginated messages (limit capped at 100). Returns 404 if no conversation matches.

## tenant-lookup-integration
- type: integration
- status: gated
- invoke: internal call from inbound-sms-webhook -> src/adapters/monitor_client.py TenantLookupClient.lookup(phone_variants)
- verified: unverified
- verified_at: null
- files: [src/adapters/monitor_client.py, src/services/sms_inbound.py]
- hints: [openworld]
- notes: Calls Collections Monitor at `GET {MONITOR_API_URL}/tenants/lookup?phone=...` to resolve an inbound sender to a tenant_id, trying phone variants with retry/backoff (up to 4 attempts). Gated by `MONITOR_API_URL`: if unset, `lookup()` short-circuits to no-match and the webhook proceeds with an "unknown conversation." All exceptions are swallowed so a downed Monitor never breaks the inbound webhook.

## tenant-language-profile-update
- type: integration
- status: gated
- invoke: internal call from inbound-sms-webhook -> src/adapters/tenant_profile_client.py TenantProfileClient.update_language(tenant_id, lang)
- verified: unverified
- verified_at: null
- files: [src/adapters/tenant_profile_client.py, src/services/sms_inbound.py]
- hints: [openworld]
- notes: PUTs `{TENANT_PROFILE_API_URL}/tenants/{tenant_id}/language` when a detected language changes with confidence >= 0.7. Gated by `TENANT_PROFILE_API_URL` (client no-ops without it) and by the confidence/tenant/change preconditions. Retries transient failures up to 4 attempts; errors are caught and logged, never propagated to the webhook response.

## unknown-conversation-reconciliation-job
- type: job
- status: gated
- invoke: src/workflows/reconciliation.py reconcile_unknown_conversations(session_maker, batch_size=100)
- verified: unverified
- verified_at: null
- files: [src/workflows/reconciliation.py, src/services/conversations.py]
- notes: Batch-reattempts tenant lookup (via tenant-lookup-integration) for conversations still lacking a tenant_id, and applies the match idempotently. The function is exercised only by tests (tests/unit/workflows/test_reconciliation_job.py) — no cron entry, CLI command, or scheduler wiring was found anywhere in the repo (railway.json only sets a health-check path, Dockerfile only runs uvicorn), so it is not currently invoked in any running deployment.
