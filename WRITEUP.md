# n8n Automation Health Check: write-up

Everything below happened on a demo n8n with a made-up company (Marigold Row Rentals).
No client data or client systems were used.

## What it is

An n8n workflow that reads the other workflows on an n8n instance and writes a one-page
health report a business owner can read. Each of 10 checks gets green, amber or red, with
a plain fix next to it. The summary line comes first, for example
"5 of 10 checks passed. 2 need attention this week, 3 this month."

It is read-only. It uses an API key that can only read workflows, read executions and
generate n8n's own security audit. It never shows the value of a secret it finds.

## What it checks, and why

| # | Check | Why it matters |
|---|---|---|
| 1 | Error alerts set | Without an error workflow, a failure is silent. |
| 2 | Failure rate, last 7 days | A workflow that fails often is only doing its job some of the time. |
| 3 | Silently stopped | A workflow can be switched on while nothing reaches it. |
| 4 | Keys typed into nodes | Anyone who can open or export the workflow can see them. |
| 5 | Webhooks with no login | Anyone with the URL can send fake data in. |
| 6 | HTTP calls with no retry or timeout | One slow API can hang or kill the run. |
| 7 | n8n version | Old versions miss bug fixes and security fixes. |
| 8 | Abandoned workflows | Clutter hides what is really running, and may hold old keys. |
| 9 | Backup workflow | If the server dies, a backup is the only way back. |
| 10 | Kill switch | One place to stop everything that sends, if something goes wrong. |

## Before and after (real runs on the demo instance)

I seeded 7 sample workflows, 6 of them broken on purpose, and let them run for about 2 hours.

| Check | Before (04:36, Nov 23) | After (04:43) | What changed |
|---|---|---|---|
| 1. Error alerts | 🟠 1 of 5 missing | 🟢 | Set the error workflow on "Tenant maintenance intake" |
| 2. Failure rate | 🔴 | 🔴 | Not fixed on purpose: the vacancy report and backup still fail |
| 3. Silently stopped | 🟠 | 🟠 | Not fixed: nothing calls the lease renewal webhook |
| 4. Keys in nodes | 🔴 | 🟢 | Moved the SMS key into an n8n credential |
| 5. Open webhooks | 🔴 | 🟢 | Added header auth to the intake webhook |
| 6. Retry / timeout | 🟠 | 🟢 | Turned on retry and a 10 s timeout on the SMS call |
| 7. Version | 🟠 6 behind | 🟠 | Not upgraded (the demo stays on 2.42.7) |
| 8. Abandoned | 🟢 | 🟢 | See "what went wrong", item 6 |
| 9. Backup | 🔴 | 🔴 | Not fixed on purpose |
| 10. Kill switch | 🔴 none | 🟠 1 of 4 uses it | Added a kill switch and wired it into the intake workflow |
| **Summary** | **1 of 10 passed** | **5 of 10 passed** | |

Reports: `reports/live/before/` and `reports/live/after/`, each with the Markdown, the HTML
and a trimmed execution log.

## What went wrong while building it

1. **The first design double-counted problems.** "Silently stopped" first meant "no
   successful run lately". On the sample data it flagged a workflow that runs every 5
   minutes and fails every time. That workflow is loud, not silent, and check 2 already
   reports it. I changed check 3 to mean "nothing has run at all".
2. **The workflow wouldn't import.** The n8n command-line import failed with
   `SQLITE_CONSTRAINT: NOT NULL constraint failed: workflow_entity.id`. The exported
   workflow had no `id`. The build script now gives it a fixed id.
3. **The credential picks didn't save.** After the API credential was created and chosen in
   the editor, the saved workflow still pointed at the placeholder. I re-imported a copy
   with the credential attached. The file in this repo carries no credential reference at
   all, so it holds no names or IDs from my instance.
4. **The command-line runner clashed with the server.** `n8n execute` inside the container
   failed with "Task Broker's port 5679 is already in use". It starts its own process next
   to the running server. Setting `N8N_RUNNERS_BROKER_PORT=5690` for that one command fixed
   it, without changing the container.
5. **The raw execution log repeated the fake key.** The full `n8n execute` output contains
   the raw workflow JSON it read, including the planted fake key. The report never showed
   it, but the log did. The repo only keeps a trimmed log: node names, status, timing and
   item counts.
6. **Check 8 can't be shown live.** n8n's import sets every workflow's dates to "now", so
   the "old move-out checklist" never looks old. I didn't fake the dates. The offline tests
   prove check 8 works (a fixture with a workflow not touched in 400 days).
7. **The first smoke run's backup line said only "active".** That's not useful when the
   backup is failing. It now says when the last run happened and how it ended.
8. **A bug that wasn't one.** Both live runs read about 220 past runs, and a busy workflow's
   older runs seemed to drop out. I suspected the API's page cursor wasn't being followed.
   I compared against n8n's own database instead of guessing: it held exactly 217 and 220
   runs at those two moments, nothing had been pruned, and the n8n node follows the cursor
   when "Return All" is on. The "missing" runs were my own 2-hour counting window sliding
   forward. No code changed, but there is now a test that keeps "Return All" on.

## Limits: what it can't see

- Environment variables, server settings, host-level backups (for example Docker volume
  snapshots), and what is inside credentials.
- Runs that n8n already deleted, or that a workflow is set not to save. Check 2 flags
  workflows that don't save their failures.
- It downloads the whole execution list on every run (without execution data). On an
  instance with many thousands of runs, that will be slow.
- The version check (7) uses n8n's security audit, which looks up newer versions online.
  With no internet, it falls back to a version typed into the config.
- The kill switch check (10) looks for a convention: a workflow tagged `kill-switch` and an
  Execute Workflow call to it. It can't prove the switch actually stops anything.
- The secret check (4) matches common key shapes and field names. It can miss a key with an
  unusual shape, and it can flag a long random value that isn't a key.
- Schedules written as cron expressions are treated as daily for check 3. Webhooks are
  expected to run at least weekly unless tagged `expect:hourly`, `expect:daily` or
  `expect:weekly`.

## How to run it

Offline tests (no network, no n8n):

```bash
npm test                 # 49 tests
npm run report:sample    # writes a sample report from fixture data
```

On an n8n instance (2.14 or newer, for scoped API keys):

1. Create an API key with only `workflow:read`, `execution:read` and `securityAudit:generate`.
2. Add an "n8n API" credential with that key. Base URL is `http://localhost:5678/api/v1`
   when n8n calls itself inside Docker.
3. Import `workflow/health-check.json`, pick the credential in the 3 n8n nodes, and save.
4. Run it. The reports land in `~/.n8n-files/reports/` inside the n8n container.

## AI usage disclosure

- **Claude (AI) built:** the check logic, report builder, tests and fixtures, the sample
  workflows, the n8n workflow, and the first version of this write-up. It also ran the commands on
  the demo instance.
- **I decided:** the project, the 10 checks and their rules, the fictional setting,
  read-only as a hard rule, and every step that touched my machine.
- **I did myself:** created the demo n8n's owner account, the API key and the credential.
- **What I checked myself:** I approved each phase after reading its report, watched the health check run in my demo n8n, and read this write-up, including what went wrong and the limits. I did not read every line of code or run the tests myself.
