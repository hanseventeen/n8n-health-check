# Execution log: AFTER run (n8n-demo)

- **Re-run:** 2026-11-23 00:20:56 UTC / 2026-11-23 08:20:56 Asia/Manila, after the Phase 1.4 code updates (credential references removed from the exported workflow, new tests). The fixes listed below were applied once, before the first AFTER run on 2026-11-22 20:43 UTC; nothing on the instance changed for this re-run except re-importing the health check workflow.
- Started: 2026-11-23 00:20:56 UTC / 2026-11-23 08:20:56 Asia/Manila
- Finished: 2026-11-23 00:20:57 UTC / 2026-11-23 08:20:57 Asia/Manila
- Command: `docker exec -e N8N_RUNNERS_BROKER_PORT=5690 n8n-demo n8n execute --id=mrrHealthCheck01 --rawOutput`
  - Broker-port note: `n8n execute` starts a second n8n process inside the container; its internal task broker defaults to port 5679, which the running server already uses. The env var moves the broker for this one process only. No container config was changed.
- Exit code: 0
- Execution status: success (finished: true)
- Summary: 5 of 10 checks passed. 2 need attention this week, 3 this month.

## Changes applied (from samples/after, imported 2026-11-22 20:38 UTC, about 5 minutes before the first AFTER run)

- **Tenant maintenance intake (S1):** error workflow set to Error alert handler; Webhook authentication changed to Header Auth (credential "Intake webhook secret (demo)"); new "Check kill switch" Execute Workflow node before the outbound call.
- **Rent reminder SMS (S2):** the typed-in Authorization header replaced by the "SMS gateway (demo)" credential; Send SMS now has Retry On Fail and a 10 s timeout. (S2 does not call the kill switch.)
- **Kill switch (new):** workflow tagged `kill-switch`, called by an Execute Workflow node; returns "on" (lets traffic through).
- S1, S2 and Kill switch were re-published after import, then n8n-demo was restarted. Nothing else changed.

## Nodes

| Node | Status | Start (UTC) | Duration ms | Items out |
|---|---|---|---|---|
| Run health check | success | 00:20:56.045 | 2 | 1 |
| Get workflows | success | 00:20:56.048 | 146 | 11 |
| Get executions | success | 00:20:56.194 | 141 | 323 |
| Security audit | success | 00:20:56.335 | 389 | 1 |
| Run checks | success | 00:20:56.724 | 650 | 1 |
| Markdown file | success | 00:20:57.374 | 32 | 1 |
| Save Markdown | success | 00:20:57.406 | 24 | 1 |
| HTML file | success | 00:20:57.431 | 10 | 1 |
| Save HTML | success | 00:20:57.442 | 15 | 1 |

## Executions per workflow, last 2 hours before the run

From the Get executions node output (323 executions returned; 266 older than 2 hours not counted).

| Workflow | Success | Error | Other |
|---|---|---|---|
| Automation Health Check | 0 | 0 | 1 |
| Backup workflows to storage | 0 | 4 | 0 |
| Daily vacancy report | 0 | 24 | 0 |
| Error alert handler | 28 | 0 | 0 |
