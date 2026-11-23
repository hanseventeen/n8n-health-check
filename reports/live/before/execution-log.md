# Execution log: BEFORE run (n8n-demo)

- Started: 2026-11-22 20:36:49 UTC / 2026-11-23 04:36:49 Asia/Manila
- Finished: 2026-11-22 20:36:50 UTC / 2026-11-23 04:36:50 Asia/Manila
- Command: `docker exec -e N8N_RUNNERS_BROKER_PORT=5690 n8n-demo n8n execute --id=mrrHealthCheck01 --rawOutput`
  - Broker-port note: `n8n execute` starts a second n8n process inside the container; its internal task broker defaults to port 5679, which the running server already uses. The env var moves the broker for this one process only. No container config was changed.
- Exit code: 0
- Execution status: success (finished: true)
- Summary: 1 of 10 checks passed. 5 need attention this week, 4 this month.

## Nodes

| Node | Status | Start (UTC) | Duration ms | Items out |
|---|---|---|---|---|
| Run health check | success | 20:36:49.202 | 2 | 1 |
| Get workflows | success | 20:36:49.205 | 182 | 10 |
| Get executions | success | 20:36:49.387 | 101 | 217 |
| Security audit | success | 20:36:49.488 | 141 | 1 |
| Run checks | success | 20:36:49.629 | 877 | 1 |
| Markdown file | success | 20:36:50.506 | 32 | 1 |
| Save Markdown | success | 20:36:50.538 | 24 | 1 |
| HTML file | success | 20:36:50.562 | 12 | 1 |
| Save HTML | success | 20:36:50.574 | 15 | 1 |

## Executions per workflow, last 2 hours before the run

From the Get executions node output (217 executions returned; 18 older than 2 hours not counted).

| Workflow | Success | Error | Other |
|---|---|---|---|
| Automation Health Check | 1 | 0 | 1 |
| Backup workflows to storage | 0 | 4 | 0 |
| Break My Agent v1 (AI only) | 64 | 0 | 0 |
| Break My Agent v2 (guardrails) | 77 | 0 | 0 |
| Daily vacancy report | 0 | 24 | 0 |
| Error alert handler | 28 | 0 | 0 |
