# Automation health check: Marigold Row Rentals (demo)

November 20, 2026 at 5:00 PM (Asia/Manila) · n8n 2.42.7

**0 of 10 checks passed. 6 need attention this week, 4 this month.**

| | Check | What we found | Fix |
|---|---|---|---|
| 🟠 This month | 1. Error alerts set | 1 of 5 active workflows has no working error workflow. | Create one workflow with an Error Trigger that alerts you, then pick it under Settings \> Error workflow in each active workflow. |
| 🔴 This week | 2. Failure rate (last 7 days) | 1 workflow needs a look. | Open the failed runs, fix the most common error first, and turn on saving of failed runs so you can see them. |
| 🟠 This month | 3. Silently stopped workflows | 1 active workflow looks switched on, but nothing has run. | Check that the trigger still fires: the webhook URL is still in use, the schedule is right, and the app sending data has not changed. |
| 🔴 This week | 4. Keys typed into nodes | Found 1 key-like value typed directly into nodes. Values are not shown. | Move each key into an n8n credential, then rotate the old key, because it has already been exposed. |
| 🔴 This week | 5. Webhooks with no login | 1 live webhook has no authentication. | In the Webhook node, set Authentication to Header Auth (or Basic Auth) and give the secret only to the app that calls it. |
| 🟠 This month | 6. HTTP calls with no retry or timeout | 1 of 4 HTTP Request nodes has neither a retry nor a timeout. | In each HTTP Request node, turn on "Retry On Fail" (3 tries) under Settings, and set a timeout under Options. |
| 🔴 This week | 7. n8n version up to date | 1 newer version available, including 1 security fix. | Plan an upgrade: back up first, read the release notes for breaking changes, and test on a copy before the real instance. |
| 🟠 This month | 8. Abandoned workflows | 1 workflow looks abandoned. | Export anything worth keeping, then archive or delete the rest. |
| 🔴 This week | 9. Backup workflow running | The most recent backup run failed. | Keep one workflow that exports all workflows on a schedule to storage outside this server, with an error alert on it. |
| 🔴 This week | 10. Kill switch in place | No kill switch found. 4 active workflows send data out with no way to stop them all at once. | Create a workflow tagged "kill-switch" that returns on or off, and call it with an Execute Workflow node at the start of every workflow that sends messages or calls APIs. |

## Details

**1. Error alerts set**: When a workflow fails, nobody hears about it unless an error workflow sends an alert.

- Tenant maintenance intake: no working error workflow set

**2. Failure rate (last 7 days)**: A workflow that fails often is doing its job only some of the time.

- Daily vacancy report: 10 of 12 runs failed (83%)

**3. Silently stopped workflows**: A workflow can look switched on while nothing is actually reaching it, so it fails without any error.

- Lease renewal follow-up: has never run, and it has been over 2 hours

**4. Keys typed into nodes**: A key typed into a node is visible to anyone who can open or export the workflow.

- Rent reminder SMS / Send SMS: key-like value in field headerParameters.parameters\[0\] (Authorization)

**5. Webhooks with no login**: Anyone who finds the URL can send fake data in and trigger the workflow.

- Tenant maintenance intake / Webhook: webhook accepts calls from anyone

**6. HTTP calls with no retry or timeout**: One slow or flaky API call can hang or kill the whole run.

- Rent reminder SMS / Send SMS: no retry and no timeout

**7. n8n version up to date**: Old versions miss bug fixes, and sometimes security fixes.

- (instance): 2.48.7 (security fix)

**8. Abandoned workflows**: Old, switched-off workflows make it harder to see what is really running, and may still hold old keys.

- Old move-out checklist: inactive, not changed in over 90 days

**9. Backup workflow running**: If the server dies, a backup is the only way to get your workflows back.

- Nightly backup to storage: active, last run error at 2026-11-20 00:00 UTC

**10. Kill switch in place**: If something goes wrong (a loop, a bad message, a leaked key), you need one place to stop everything that sends.

- Tenant maintenance intake: sends data out
- Rent reminder SMS: sends data out
- Daily vacancy report: sends data out
- Nightly backup to storage: sends data out

## What this check can't see

- Environment variables, server settings and host-level backups (for example Docker volume snapshots).
- What is inside your credentials. That is on purpose.
- Runs that n8n has already deleted, or that a workflow is set not to save.
- Whether a kill switch is wired correctly inside each workflow, only that it is called.

_Read-only: this check changed nothing on the instance and never shows secret values._
