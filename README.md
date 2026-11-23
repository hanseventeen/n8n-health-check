# n8n Automation Health Check

![tests](https://github.com/hanseventeen/n8n-health-check/actions/workflows/test.yml/badge.svg)

An n8n workflow that checks the other workflows on an n8n instance and writes a one-page
health report that a business owner can read. Each check gets green, amber or red, with a
plain fix next to it.

> "5 of 10 checks passed. 2 need attention this week, 3 this month."

It is read-only. It never changes a workflow and never shows the value of a secret it finds.

## The 10 checks

1. **Error alerts set:** every active workflow has a working error workflow.
2. **Failure rate:** how often each workflow failed in the last 7 days.
3. **Silently stopped:** switched on, but nothing has run in the expected time.
4. **Keys typed into nodes:** API keys or tokens pasted into a node instead of a credential.
5. **Webhooks with no login:** webhooks anyone with the URL can call.
6. **HTTP calls with no retry or timeout.**
7. **n8n version:** how far behind, and whether a newer version has a security fix.
8. **Abandoned workflows:** switched off and untouched for 90+ days.
9. **Backup workflow:** one exists, and its last run succeeded recently.
10. **Kill switch:** one place to stop everything that sends data out.

## Real runs on a demo instance

I ran it on a separate demo n8n with 7 sample workflows for a made-up property manager.
Six of them were broken on purpose. Then I fixed three problems and ran it again.

| | Before | After |
|---|---|---|
| Checks passed | 1 of 10 | 5 of 10 |
| Reports | [`reports/live/before/`](reports/live/before/) | [`reports/live/after/`](reports/live/after/) |

What went wrong while building it, and what it can't see, is in [WRITEUP.md](WRITEUP.md).

## How it works

```
Manual trigger
  → n8n API: get workflows
  → n8n API: get executions (no execution data)
  → n8n API: security audit (for the version check)
  → Code: run the 10 checks, build the report
  → save Markdown + HTML
```

The check logic lives in [`src/`](src/) as plain JavaScript with no dependencies.
[`scripts/build-workflow.js`](scripts/build-workflow.js) copies that code into the Code node,
so the workflow runs exactly the code the tests run.

## Run the tests (no network, no n8n)

```bash
npm test               # node --test
npm run report:sample  # builds a report from fixture data into reports/sample/
```

Each check has a passing and a failing fixture in [`test/fixtures/checks/`](test/fixtures/checks/).
Safety tests make sure the workflow only reads, never asks for execution data, never puts a
secret value or phone number into a report, and escapes the HTML.

## Use it on your own n8n

Needs n8n 2.14 or newer (for scoped API keys).

1. **Settings → n8n API → Create an API key.** Give it only `workflow:read`,
   `execution:read` and `securityAudit:generate`.
2. **Credentials → Add credential → n8n API.** Paste the key. The base URL is your
   instance's `/api/v1`. In Docker, n8n reaches itself at `http://localhost:5678/api/v1`.
3. **Import** [`workflow/health-check.json`](workflow/health-check.json). Pick the credential
   in the three n8n nodes and save. The export carries no credential names or IDs.
4. **Run it.** The reports are written to `~/.n8n-files/reports/` inside the n8n container.

The sample workflows in [`samples/`](samples/) are only for the demo. They use fake keys
such as `sk-demo-FAKE…` on purpose, so the checks have something to find.

## AI usage disclosure

- **Claude (AI) built:** the check logic, report builder, tests and fixtures, the sample
  workflows, the n8n workflow, and the first version of this README and the write-up. It
  also ran the commands on the demo instance.
- **I decided:** the project, the 10 checks and their rules, the fictional setting,
  read-only as a hard rule, and every step that touched my machine.
- **I did myself:** created the demo n8n's owner account, the API key and the credential.
- **What I checked myself:** I approved each phase after reading its report, watched the health check run in my demo n8n, and read this write-up, including what went wrong and the limits. I did not read every line of code or run the tests myself.

## License

MIT
