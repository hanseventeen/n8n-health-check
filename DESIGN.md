# n8n Automation Health Check: Design (Phase 1.1)

Status: approved 2026-11-22. Build started in Phase 1.2.
Date: 2026-11-22

## 1. What it is, in one line

An n8n workflow that reads the other workflows on an n8n instance through the public API and writes a one-page health report a business owner can read: green, amber or red per check, with a plain fix for each problem.

## 2. What the API can and can't see (checked against docs.n8n.io)

Can see, read-only:
- `GET /api/v1/workflows` (cursor paging, max 250 per page): every workflow's nodes with their parameters, connections, `settings` (including `errorWorkflow`, `saveDataErrorExecution`, `executionTimeout`), active state, `updatedAt`, tags.
- `GET /api/v1/executions`: filter by `workflowId`, `status` (`error`, `crashed`, `success`, ...), `startedAfter`. Returns status, mode, start and stop times. We keep `includeData=false`, so no customer data is pulled.
- `POST /api/v1/audit`: n8n's own security audit. Despite the POST, it only builds a report. It changes nothing. Its "Instance Risk Report" includes a `nextVersions` list, which is how we can tell the instance is behind.

Can't see:
- The instance's own version number. No API endpoint returns it. We use the audit's `nextVersions` list, with a config value as a fallback.
- Environment variables, server config, Docker volumes, or host-level backups.
- Credential contents. That is good, and it is by design.
- Executions that n8n already pruned, or that a workflow is set not to save (`saveDataErrorExecution: none`).

API key: from n8n 2.14 on, API key scopes are available on all plans. The health check key gets only `workflow:read`, `execution:read` and `securityAudit:generate`. Header: `X-N8N-API-KEY`.

## 3. The checks (10)

Each check gives green, amber or red. Red means fix this week. Amber means fix this month.

| # | Check | How it's detected | Green / Amber / Red | Change from the dispatch list |
|---|---|---|---|---|
| 1 | Error alerts set | Active workflows whose `settings.errorWorkflow` is empty, or points to a workflow without an Error Trigger node | All set / 1–2 missing / 3+ missing, or no error workflow exists at all | None |
| 2 | Failure rate (7 days) | `error` + `crashed` runs ÷ all runs per workflow, from `/executions?startedAfter=` | <10% / 10–25% / >25%. Needs at least 5 runs to judge | **Added:** a workflow with `saveDataErrorExecution: none` gets amber "can't see its failures" |
| 3 | Silently stopped | Active workflow with a trigger, but no `success` run within the expected window. Schedule triggers: 2× their interval. Webhook triggers: 7 days by default, override with a tag like `expect:daily` | None / 1 / 2+ | **Changed:** "X days" is set per trigger type, not one number |
| 4 | Hard-coded secrets | Scan every node parameter for key-shaped values: `sk-`, `Bearer `, JWTs, AWS-style keys, long tokens in fields named key, token, secret, password or authorization | None / n/a / any hit is red | None. The report shows the workflow, node and field name, **never the value** |
| 5 | Unprotected webhooks | Webhook nodes with `authentication` = none on active workflows | None / n/a / any hit | None |
| 6 | HTTP calls without retry or timeout | HTTP Request nodes with `retryOnFail` off **and** no `options.timeout` | None / some / more than half of HTTP nodes | None |
| 7 | n8n version behind | Audit `nextVersions`: count of newer releases, and whether any has `hasSecurityFix` | Current / behind, no security fixes / behind with a security fix | **Changed:** comes from the audit, not a version endpoint, because there isn't one |
| 8 | Abandoned workflows | Inactive and not updated in 90+ days | 0 / 1–5 / n/a (amber at most) | None. Clutter isn't an emergency |
| 9 | Backup workflow | Workflow tagged `backup` (or named "backup"), and its last success time | Succeeded in the last 2 days / older / none found or last run failed | **Limit:** can't see host-level backups. The report says so |
| 10 | Kill switch | Convention check: a workflow tagged `kill-switch`, and outbound workflows (HTTP, SMS, email nodes) that read it first | Present and used by all outbound workflows / present but some skip it / none | **Limit:** n8n has no built-in kill switch, so this checks for a pattern we document, not a guarantee |

I kept all 10 from the dispatch list. Three changed shape because of what the API can see (2, 3, 7), and two carry an honest limit in the report (9, 10).

## 4. How the workflow is built (preview for Phase 1.2)

1. Manual Trigger (plus an optional weekly Schedule Trigger)
2. HTTP Request: page through `/workflows`
3. HTTP Request: `/executions` for the last 7 days
4. HTTP Request: `POST /audit` with categories `instance` and `nodes`
5. Code node: runs the check logic. The same file lives in the repo as `src/checks.js`, so it can be tested offline with `node --test` against fixture JSON, with no network and no n8n.
6. Code node: builds the Markdown and the HTML report from one template
7. Write the files to disk (`reports/health-YYYY-MM-DD.md` and `.html`)

No npm dependencies in the check logic, so it runs the same in n8n's Code node and in tests.

## 5. Broken sample workflows to seed (fictional)

Fictional business: **Marigold Row Rentals**, a small property manager with 12 units. Every address is example.com, every phone number is 555, and every key is an obvious fake.

| # | Workflow | Active | What's broken on purpose | Fails checks |
|---|---|---|---|---|
| S1 | Tenant maintenance intake (webhook) | Yes | Webhook with no auth, no error workflow | 1, 5 |
| S2 | Rent reminder SMS | Yes | Fake key `sk-demo-FAKE...` typed into an HTTP header, no retry or timeout, skips the kill switch | 4, 6, 10 |
| S3 | Daily vacancy report | Yes (every 5 min for the demo) | Calls a URL that always fails | 2 |
| S4 | Lease renewal follow-up | Yes | Webhook that never gets called | 3 |
| S5 | Old move-out checklist | No | Inactive, old `updatedAt` | 8 |
| S6 | Nightly backup to storage | Yes | Backup step always fails | 9 |
| S7 | Error alert handler | Yes | **Good workflow.** Has an Error Trigger. Used for the "after" fix | (passes) |

The demo instance stays on 2.42.7, so check 7 fails on its own.

Planned "after" fixes for Phase 1.3: point S1 and S2 at S7 as their error workflow, add header auth to S1's webhook, and move S2's key into a credential. That should flip checks 1, 4 and 5.

Two things I'm not sure of yet:
- **Check 3 (silently stopped) needs time.** "No success in 7 days" can't happen on a brand-new instance. For the live demo I'd tag S4 `expect:hourly` and wait a couple of hours, instead of faking timestamps.
- **Check 8 (abandoned) needs an old `updatedAt`.** I don't know yet whether `n8n import:workflow` keeps the `updatedAt` from the JSON. If it doesn't, the offline fixtures cover check 8, and the live run lowers the threshold. The write-up will say which one we did.

## 6. Report format

- One page. Markdown plus HTML from the same template. A PDF comes from the browser's "Print to PDF", so we skip a PDF library.
- Header: instance URL, date and time (Asia/Manila), n8n version as far as it can be known.
- Summary line first, for example: **"6 of 10 checks passed. 2 need attention this week, 2 this month."**
- Then one row per check: status dot, check name, what we found (counts and workflow names only), why it matters (one sentence), plain fix (one or two sentences).
- Footer: "What this check can't see", the fixed list from section 2.

## 7. What the health check must never do

- **Read-only.** Only `GET` calls, plus `POST /audit`, which builds a report and changes nothing. No `PUT`, `PATCH`, `DELETE`, activate, deactivate, retry or stop calls. A test fails the build if the workflow JSON contains any other method or endpoint.
- **Least-privilege key**, with only the three read scopes from section 2.
- **Never prints secrets.** Check 4 reports "found a key-like value in node X, field Y". The matched value is never stored, logged or written, and a test makes sure it doesn't show up in the report.
- **No execution data.** `includeData=false` on every call, so tenant messages and phone numbers never get pulled.
- Writes only its own report files. Sends nothing outside the machine.

## 8. Decisions (Johanssen said yes to all recommendations, 2026-11-22)

1. `POST /audit` is used for check 7. A config value is the fallback.
2. Kill switch check stays, as a convention check (`kill-switch` tag plus an Execute Workflow call).
3. Report output is files only: Markdown and HTML. PDF comes from the browser's "Print to PDF".

## 9. Changes made during Phase 1.2

- **Check 3 now counts any run, not only successful runs.** The first version flagged "Daily vacancy report" as silently stopped, but that workflow runs every 5 minutes and fails loudly. Check 2 already covers that. Check 3 is now only for workflows where nothing runs at all, so one problem doesn't show up twice.
