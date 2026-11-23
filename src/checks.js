'use strict';

/*
 * n8n Automation Health Check: check logic.
 *
 * Pure functions only. No network, no file access, no npm packages.
 * The same code runs in the offline tests and inside an n8n Code node.
 *
 * Input:
 *   workflows  - array from GET /api/v1/workflows
 *   executions - array from GET /api/v1/executions (includeData=false)
 *   audit      - object from POST /api/v1/audit, or null
 *   now        - ISO date string for "today" (passed in so tests are repeatable)
 *   config     - optional overrides, see DEFAULT_CONFIG
 *
 * Output: an array of 10 check results. A result never contains a secret
 * value. It only names workflows, nodes and field paths.
 */

const DEFAULT_CONFIG = {
  failureWindowDays: 7,
  minRunsForRate: 5,
  failAmber: 0.10,
  failRed: 0.25,
  webhookExpectDays: 7,
  abandonedDays: 90,
  backupMaxAgeDays: 2,
  // Fallback for check 7 when the audit report is not available.
  currentVersion: null,
  latestStableVersion: null,
  // Workflows to leave out of every check, by exact name (for example the
  // health check itself, or another project sharing the demo instance).
  excludeWorkflowNames: [],
};

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

const TYPE = {
  errorTrigger: 'n8n-nodes-base.errorTrigger',
  manualTrigger: 'n8n-nodes-base.manualTrigger',
  scheduleTrigger: 'n8n-nodes-base.scheduleTrigger',
  cron: 'n8n-nodes-base.cron',
  webhook: 'n8n-nodes-base.webhook',
  httpRequest: 'n8n-nodes-base.httpRequest',
  executeWorkflow: 'n8n-nodes-base.executeWorkflow',
};

// Nodes that send something to the outside world (used by check 10).
const OUTBOUND_TYPES = new Set([
  'n8n-nodes-base.httpRequest',
  'n8n-nodes-base.twilio',
  'n8n-nodes-base.gmail',
  'n8n-nodes-base.emailSend',
  'n8n-nodes-base.slack',
  'n8n-nodes-base.telegram',
  'n8n-nodes-base.microsoftOutlook',
  'n8n-nodes-base.sendGrid',
  'n8n-nodes-base.mailgun',
  'n8n-nodes-base.whatsApp',
]);

/* ---------- small helpers ---------- */

function isActive(wf) {
  if (typeof wf.active === 'boolean') return wf.active;
  return wf.activeVersionId != null;
}

function liveNodes(wf) {
  return (wf.nodes || []).filter((n) => !n.disabled);
}

function tagNames(wf) {
  return (wf.tags || []).map((t) => String(typeof t === 'string' ? t : t.name).toLowerCase());
}

function hasNodeType(wf, type) {
  return liveNodes(wf).some((n) => n.type === type);
}

function isErrorHandler(wf) {
  return hasNodeType(wf, TYPE.errorTrigger);
}

function ms(dateString) {
  const t = Date.parse(dateString);
  return Number.isNaN(t) ? null : t;
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many || one + 's'}`;
}

// Picks the verb that agrees with n: verb(1, 'has', 'have') -> 'has'.
function verb(n, one, many) {
  return n === 1 ? one : many;
}

function result(number, id, title, status, found, why, fix, items) {
  return { number, id, title, status, found, why, fix, items: items || [] };
}

function execsByWorkflow(executions) {
  const map = new Map();
  for (const e of executions || []) {
    const key = String(e.workflowId);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(e);
  }
  return map;
}

/* ---------- check 1: error alerts set ---------- */

function checkErrorAlerts(ctx) {
  const handlers = new Set(ctx.workflows.filter(isErrorHandler).map((w) => String(w.id)));
  const watched = ctx.workflows.filter((w) => isActive(w) && !isErrorHandler(w));
  const missing = watched.filter((w) => {
    const target = w.settings && w.settings.errorWorkflow;
    return !target || !handlers.has(String(target));
  });
  const items = missing.map((w) => ({ workflow: w.name, detail: 'no working error workflow set' }));
  const why = 'When a workflow fails, nobody hears about it unless an error workflow sends an alert.';
  const fix = 'Create one workflow with an Error Trigger that alerts you, then pick it under Settings > Error workflow in each active workflow.';

  if (watched.length === 0) {
    return result(1, 'error-alerts', 'Error alerts set', 'green', 'No active workflows to check.', why, fix);
  }
  if (handlers.size === 0) {
    return result(1, 'error-alerts', 'Error alerts set', 'red',
      `No error workflow exists. ${plural(watched.length, 'active workflow')} would fail silently.`, why, fix, items);
  }
  const status = missing.length === 0 ? 'green' : missing.length <= 2 ? 'amber' : 'red';
  const found = missing.length === 0
    ? `All ${plural(watched.length, 'active workflow')} have an error workflow.`
    : `${missing.length} of ${plural(watched.length, 'active workflow')} ${verb(missing.length, 'has', 'have')} no working error workflow.`;
  return result(1, 'error-alerts', 'Error alerts set', status, found, why, fix, items);
}

/* ---------- check 2: failure rate ---------- */

function checkFailureRate(ctx) {
  const { config } = ctx;
  const since = ctx.nowMs - config.failureWindowDays * DAY;
  const byWf = execsByWorkflow(ctx.executions);
  const items = [];
  let worst = 'green';
  let judged = 0;

  const bump = (s) => {
    const rank = { green: 0, amber: 1, red: 2 };
    if (rank[s] > rank[worst]) worst = s;
  };

  for (const wf of ctx.workflows.filter(isActive)) {
    const settings = wf.settings || {};
    if (settings.saveDataErrorExecution === 'none') {
      items.push({ workflow: wf.name, detail: 'set to not save failed runs, so its failures are invisible' });
      bump('amber');
    }
    const runs = (byWf.get(String(wf.id)) || []).filter((e) => {
      const t = ms(e.startedAt);
      return t != null && t >= since && ['success', 'error', 'crashed'].includes(e.status);
    });
    if (runs.length < config.minRunsForRate) continue;
    judged += 1;
    const failed = runs.filter((e) => e.status === 'error' || e.status === 'crashed').length;
    const rate = failed / runs.length;
    if (rate > config.failRed) {
      bump('red');
      items.push({ workflow: wf.name, detail: `${failed} of ${runs.length} runs failed (${Math.round(rate * 100)}%)` });
    } else if (rate >= config.failAmber) {
      bump('amber');
      items.push({ workflow: wf.name, detail: `${failed} of ${runs.length} runs failed (${Math.round(rate * 100)}%)` });
    }
  }

  const found = items.length === 0
    ? `No workflow failed more than ${Math.round(config.failAmber * 100)}% of its runs in the last ${config.failureWindowDays} days (${plural(judged, 'workflow')} had enough runs to judge).`
    : `${plural(items.length, 'workflow')} ${verb(items.length, 'needs', 'need')} a look.`;
  return result(2, 'failure-rate', `Failure rate (last ${config.failureWindowDays} days)`, worst, found,
    'A workflow that fails often is doing its job only some of the time.',
    'Open the failed runs, fix the most common error first, and turn on saving of failed runs so you can see them.',
    items);
}

/* ---------- check 3: silently stopped ---------- */

function scheduleIntervalMs(node) {
  const rule = (node.parameters && node.parameters.rule) || {};
  const intervals = Array.isArray(rule.interval) && rule.interval.length ? rule.interval : [{ field: 'days' }];
  let smallest = Infinity;
  for (const iv of intervals) {
    const field = iv.field || 'days';
    let size;
    if (field === 'seconds') size = (iv.secondsInterval || 30) * 1000;
    else if (field === 'minutes') size = (iv.minutesInterval || 5) * 60 * 1000;
    else if (field === 'hours') size = (iv.hoursInterval || 1) * HOUR;
    else if (field === 'days') size = (iv.daysInterval || 1) * DAY;
    else if (field === 'weeks') size = (iv.weeksInterval || 1) * 7 * DAY;
    else if (field === 'months') size = (iv.monthsInterval || 1) * 31 * DAY;
    else size = DAY; // cron expressions: assume daily, see WRITEUP limits
    smallest = Math.min(smallest, size);
  }
  return smallest;
}

function expectTagMs(wf) {
  for (const tag of tagNames(wf)) {
    if (tag === 'expect:hourly') return HOUR;
    if (tag === 'expect:daily') return DAY;
    if (tag === 'expect:weekly') return 7 * DAY;
  }
  return null;
}

function expectedWindowMs(wf, config) {
  const tagged = expectTagMs(wf);
  if (tagged) return 2 * tagged;
  const schedules = liveNodes(wf).filter((n) => n.type === TYPE.scheduleTrigger || n.type === TYPE.cron);
  if (schedules.length) return 2 * Math.min(...schedules.map(scheduleIntervalMs));
  return config.webhookExpectDays * DAY;
}

function hasWatchedTrigger(wf) {
  return liveNodes(wf).some((n) =>
    n.type !== TYPE.errorTrigger &&
    n.type !== TYPE.manualTrigger &&
    (n.type === TYPE.webhook || /trigger$/i.test(n.type) || n.type === TYPE.cron));
}

function describeWindow(windowMs) {
  if (windowMs < 2 * HOUR) return `${Math.round(windowMs / 60000)} minutes`;
  if (windowMs < 2 * DAY) return `${Math.round(windowMs / HOUR)} hours`;
  return `${Math.round(windowMs / DAY)} days`;
}

function checkSilentlyStopped(ctx) {
  const byWf = execsByWorkflow(ctx.executions);
  const items = [];
  const watched = ctx.workflows.filter((w) => isActive(w) && hasWatchedTrigger(w));

  for (const wf of watched) {
    const windowMs = expectedWindowMs(wf, ctx.config);
    // Any run counts here. A workflow that runs but fails is loud, and check 2 covers it.
    // This check is for workflows where nothing runs at all.
    const starts = (byWf.get(String(wf.id)) || [])
      .map((e) => ms(e.startedAt))
      .filter((t) => t != null);
    const lastRun = starts.length ? Math.max(...starts) : null;
    // With no run at all, measure from when the workflow was last saved.
    const since = lastRun != null ? lastRun : ms(wf.updatedAt) || ms(wf.createdAt) || ctx.nowMs;
    if (ctx.nowMs - since > windowMs) {
      items.push({
        workflow: wf.name,
        detail: lastRun != null
          ? `no runs at all for over ${describeWindow(windowMs)}`
          : `has never run, and it has been over ${describeWindow(windowMs)}`,
      });
    }
  }

  const status = items.length === 0 ? 'green' : items.length === 1 ? 'amber' : 'red';
  const found = items.length === 0
    ? `All ${plural(watched.length, 'triggered workflow')} ran within their expected window.`
    : `${plural(items.length, 'active workflow')} ${verb(items.length, 'looks', 'look')} switched on, but nothing has run.`;
  return result(3, 'silently-stopped', 'Silently stopped workflows', status, found,
    'A workflow can look switched on while nothing is actually reaching it, so it fails without any error.',
    'Check that the trigger still fires: the webhook URL is still in use, the schedule is right, and the app sending data has not changed.',
    items);
}

/* ---------- check 4: hard-coded secrets ---------- */

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{16,}/,                                    // OpenAI / Anthropic style
  /Bearer\s+[A-Za-z0-9._~+/=-]{16,}/,                          // raw bearer token
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/, // JWT
  /AKIA[0-9A-Z]{16}/,                                          // AWS access key
  /xox[abprs]-[A-Za-z0-9-]{10,}/,                              // Slack token
  /gh[pousr]_[A-Za-z0-9]{20,}/,                                // GitHub token
  /AC[0-9a-f]{32}/,                                            // Twilio account ID (AC + 32 hex)
];

const SECRET_NAME = /(api[_-]?key|apikey|token|secret|password|passwd|authorization|auth[_-]?key|private[_-]?key)/i;

function looksLikeSecret(name, value) {
  if (typeof value !== 'string' || value.length < 12) return false;
  const usesExpression = value.includes('{{');
  if (SECRET_PATTERNS.some((re) => re.test(value))) {
    // A pattern inside an expression is still typed in, so it still counts,
    // unless the whole match comes from $env / $credentials, which can't match the patterns.
    return true;
  }
  if (usesExpression) return false;
  if (name && SECRET_NAME.test(name) && !/\s/.test(value) && value.length >= 16) return true;
  return false;
}

// Walks every parameter. Yields field paths only, never values.
function findSecretPaths(params, path, out) {
  if (Array.isArray(params)) {
    params.forEach((v, i) => findSecretPaths(v, `${path}[${i}]`, out));
    return out;
  }
  if (params && typeof params === 'object') {
    // n8n stores headers and query params as [{ name, value }].
    if (typeof params.name === 'string' && 'value' in params && looksLikeSecret(params.name, params.value)) {
      out.push(`${path} (${params.name})`);
    }
    for (const [key, val] of Object.entries(params)) {
      if (key === 'value' && typeof params.name === 'string') continue; // handled above
      if (typeof val === 'string') {
        if (looksLikeSecret(key, val)) out.push(path ? `${path}.${key}` : key);
      } else {
        findSecretPaths(val, path ? `${path}.${key}` : key, out);
      }
    }
  }
  return out;
}

function checkHardcodedSecrets(ctx) {
  const items = [];
  for (const wf of ctx.workflows) {
    for (const node of wf.nodes || []) {
      const paths = findSecretPaths(node.parameters || {}, '', []);
      for (const p of paths) {
        items.push({ workflow: wf.name, node: node.name, detail: `key-like value in field ${p}` });
      }
    }
  }
  const status = items.length ? 'red' : 'green';
  const found = items.length
    ? `Found ${plural(items.length, 'key-like value')} typed directly into nodes. Values are not shown.`
    : 'No key-like values found in node settings.';
  return result(4, 'hardcoded-secrets', 'Keys typed into nodes', status, found,
    'A key typed into a node is visible to anyone who can open or export the workflow.',
    'Move each key into an n8n credential, then rotate the old key, because it has already been exposed.',
    items);
}

/* ---------- check 5: unprotected webhooks ---------- */

function checkWebhookAuth(ctx) {
  const items = [];
  for (const wf of ctx.workflows.filter(isActive)) {
    for (const node of liveNodes(wf)) {
      if (node.type !== TYPE.webhook) continue;
      const auth = node.parameters && node.parameters.authentication;
      if (!auth || auth === 'none') {
        items.push({ workflow: wf.name, node: node.name, detail: 'webhook accepts calls from anyone' });
      }
    }
  }
  const status = items.length ? 'red' : 'green';
  const found = items.length
    ? `${plural(items.length, 'live webhook')} ${verb(items.length, 'has', 'have')} no authentication.`
    : 'All live webhooks require authentication.';
  return result(5, 'webhook-auth', 'Webhooks with no login', status, found,
    'Anyone who finds the URL can send fake data in and trigger the workflow.',
    'In the Webhook node, set Authentication to Header Auth (or Basic Auth) and give the secret only to the app that calls it.',
    items);
}

/* ---------- check 6: HTTP retry / timeout ---------- */

function checkHttpResilience(ctx) {
  const items = [];
  let total = 0;
  for (const wf of ctx.workflows.filter(isActive)) {
    for (const node of liveNodes(wf)) {
      if (node.type !== TYPE.httpRequest) continue;
      total += 1;
      const timeout = node.parameters && node.parameters.options && node.parameters.options.timeout;
      if (node.retryOnFail !== true && !timeout) {
        items.push({ workflow: wf.name, node: node.name, detail: 'no retry and no timeout' });
      }
    }
  }
  let status = 'green';
  if (items.length) status = items.length / total > 0.5 ? 'red' : 'amber';
  const found = total === 0
    ? 'No HTTP Request nodes in active workflows.'
    : items.length === 0
      ? `All ${plural(total, 'HTTP Request node')} have a retry or a timeout.`
      : `${items.length} of ${plural(total, 'HTTP Request node')} ${verb(items.length, 'has', 'have')} neither a retry nor a timeout.`;
  return result(6, 'http-resilience', 'HTTP calls with no retry or timeout', status, found,
    'One slow or flaky API call can hang or kill the whole run.',
    'In each HTTP Request node, turn on "Retry On Fail" (3 tries) under Settings, and set a timeout under Options.',
    items);
}

/* ---------- check 7: n8n version ---------- */

function parseVersion(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v || '').replace(/^v/, ''));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function compareVersions(a, b) {
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}

function checkVersion(ctx) {
  const why = 'Old versions miss bug fixes, and sometimes security fixes.';
  const fix = 'Plan an upgrade: back up first, read the release notes for breaking changes, and test on a copy before the real instance.';
  const title = 'n8n version up to date';
  const report = ctx.audit && ctx.audit['Instance Risk Report'];

  if (report && Array.isArray(report.sections)) {
    const next = [];
    for (const s of report.sections) if (Array.isArray(s.nextVersions)) next.push(...s.nextVersions);
    if (next.length === 0) {
      return result(7, 'version', title, 'green', 'n8n reports no newer version.', why, fix);
    }
    const security = next.filter((v) => v.hasSecurityFix);
    const status = security.length ? 'red' : 'amber';
    const found = `${plural(next.length, 'newer version')} available` +
      (security.length ? `, including ${plural(security.length, 'security fix', 'security fixes')}.` : '.');
    const items = next.map((v) => ({ workflow: '(instance)', detail: `${v.name}${v.hasSecurityFix ? ' (security fix)' : ''}` }));
    return result(7, 'version', title, status, found, why, fix, items);
  }

  const cur = parseVersion(ctx.config.currentVersion);
  const latest = parseVersion(ctx.config.latestStableVersion);
  if (cur && latest) {
    const cmp = compareVersions(cur, latest);
    if (cmp >= 0) return result(7, 'version', title, 'green', `Running ${ctx.config.currentVersion}, the latest stable.`, why, fix);
    return result(7, 'version', title, 'amber',
      `Running ${ctx.config.currentVersion}. Latest stable is ${ctx.config.latestStableVersion}. Security fixes unknown without the audit report.`, why, fix);
  }
  return result(7, 'version', title, 'amber', 'Could not tell the version: no audit report and no version in config.', why, fix);
}

/* ---------- check 8: abandoned workflows ---------- */

function checkAbandoned(ctx) {
  const cutoff = ctx.nowMs - ctx.config.abandonedDays * DAY;
  const items = ctx.workflows
    .filter((w) => !isActive(w) && (ms(w.updatedAt) || ctx.nowMs) < cutoff)
    .map((w) => ({ workflow: w.name, detail: `inactive, not changed in over ${ctx.config.abandonedDays} days` }));
  const status = items.length ? 'amber' : 'green';
  const found = items.length
    ? `${plural(items.length, 'workflow')} ${verb(items.length, 'looks', 'look')} abandoned.`
    : `No inactive workflows older than ${ctx.config.abandonedDays} days.`;
  return result(8, 'abandoned', 'Abandoned workflows', status, found,
    'Old, switched-off workflows make it harder to see what is really running, and may still hold old keys.',
    'Export anything worth keeping, then archive or delete the rest.',
    items);
}

/* ---------- check 9: backup workflow ---------- */

function isBackupWorkflow(wf) {
  return tagNames(wf).includes('backup') || /backup/i.test(wf.name || '');
}

function checkBackup(ctx) {
  const why = 'If the server dies, a backup is the only way to get your workflows back.';
  const fix = 'Keep one workflow that exports all workflows on a schedule to storage outside this server, with an error alert on it.';
  const title = 'Backup workflow running';
  const backups = ctx.workflows.filter(isBackupWorkflow);
  if (backups.length === 0) {
    return result(9, 'backup', title, 'red', 'No backup workflow found (looked for a "backup" tag or name).', why, fix);
  }
  const ids = new Set(backups.map((w) => String(w.id)));
  const runs = (ctx.executions || [])
    .filter((e) => ids.has(String(e.workflowId)) && ms(e.startedAt) != null)
    .sort((a, b) => ms(b.startedAt) - ms(a.startedAt));
  const names = backups.map((w) => {
    const last = runs.find((e) => String(e.workflowId) === String(w.id));
    const state = isActive(w) ? 'active' : 'inactive';
    const detail = last
      ? `${state}, last run ${last.status} at ${new Date(ms(last.startedAt)).toISOString().slice(0, 16).replace('T', ' ')} UTC`
      : `${state}, no recorded runs`;
    return { workflow: w.name, detail };
  });

  if (runs.length === 0) return result(9, 'backup', title, 'red', 'A backup workflow exists but has no recorded runs.', why, fix, names);
  const latest = runs[0];
  if (latest.status === 'error' || latest.status === 'crashed') {
    return result(9, 'backup', title, 'red', 'The most recent backup run failed.', why, fix, names);
  }
  const lastOk = runs.find((e) => e.status === 'success');
  if (!lastOk) return result(9, 'backup', title, 'red', 'The backup workflow has never succeeded.', why, fix, names);
  const ageDays = (ctx.nowMs - ms(lastOk.startedAt)) / DAY;
  if (ageDays <= ctx.config.backupMaxAgeDays) {
    return result(9, 'backup', title, 'green', `Last successful backup was ${ageDays < 1 ? 'less than a day' : plural(Math.floor(ageDays), 'day')} ago.`, why, fix, names);
  }
  return result(9, 'backup', title, 'amber', `Last successful backup was ${plural(Math.floor(ageDays), 'day')} ago.`, why, fix, names);
}

/* ---------- check 10: kill switch ---------- */

function referencedWorkflowId(node) {
  const id = node.parameters && node.parameters.workflowId;
  if (id && typeof id === 'object') return id.value != null ? String(id.value) : null;
  return id != null ? String(id) : null;
}

function checkKillSwitch(ctx) {
  const why = 'If something goes wrong (a loop, a bad message, a leaked key), you need one place to stop everything that sends.';
  const fix = 'Create a workflow tagged "kill-switch" that returns on or off, and call it with an Execute Workflow node at the start of every workflow that sends messages or calls APIs.';
  const title = 'Kill switch in place';
  const switches = ctx.workflows.filter((w) => tagNames(w).includes('kill-switch'));
  const switchIds = new Set(switches.map((w) => String(w.id)));
  const outbound = ctx.workflows.filter((w) =>
    isActive(w) && !switchIds.has(String(w.id)) && !isErrorHandler(w) &&
    liveNodes(w).some((n) => OUTBOUND_TYPES.has(n.type)));

  if (switches.length === 0) {
    return result(10, 'kill-switch', title, outbound.length ? 'red' : 'green',
      outbound.length
        ? `No kill switch found. ${plural(outbound.length, 'active workflow')} ${verb(outbound.length, 'sends', 'send')} data out with no way to stop them all at once.`
        : 'No kill switch, but no active workflows send data out.',
      why, fix, outbound.map((w) => ({ workflow: w.name, detail: 'sends data out' })));
  }
  const skipping = outbound.filter((w) => !liveNodes(w).some((n) =>
    n.type === TYPE.executeWorkflow && switchIds.has(referencedWorkflowId(n))));
  const items = skipping.map((w) => ({ workflow: w.name, detail: 'sends data out without checking the kill switch' }));
  const status = skipping.length === 0 ? 'green' : 'amber';
  const found = skipping.length === 0
    ? `Kill switch found, and all ${plural(outbound.length, 'outbound workflow')} check it.`
    : `Kill switch found, but ${skipping.length} of ${plural(outbound.length, 'outbound workflow')} skip it.`;
  const partialFix = 'Add an Execute Workflow node that calls the kill switch at the start of each workflow listed below.';
  return result(10, 'kill-switch', title, status, found, why, skipping.length ? partialFix : fix, items);
}

/* ---------- run everything ---------- */

const CHECKS = [
  checkErrorAlerts,
  checkFailureRate,
  checkSilentlyStopped,
  checkHardcodedSecrets,
  checkWebhookAuth,
  checkHttpResilience,
  checkVersion,
  checkAbandoned,
  checkBackup,
  checkKillSwitch,
];

function runChecks(input) {
  const config = Object.assign({}, DEFAULT_CONFIG, input.config || {});
  const excluded = new Set(config.excludeWorkflowNames);
  const workflows = (input.workflows || []).filter((w) => !excluded.has(w.name));
  const keptIds = new Set(workflows.map((w) => String(w.id)));
  const ctx = {
    workflows,
    executions: (input.executions || []).filter((e) => keptIds.has(String(e.workflowId))),
    audit: input.audit || null,
    nowMs: ms(input.now) || Date.now(),
    config,
  };
  return CHECKS.map((check) => check(ctx));
}

function summarize(results) {
  const passed = results.filter((r) => r.status === 'green').length;
  const red = results.filter((r) => r.status === 'red').length;
  const amber = results.filter((r) => r.status === 'amber').length;
  let line = `${passed} of ${results.length} checks passed.`;
  const parts = [];
  if (red) parts.push(`${red} need attention this week`);
  if (amber) parts.push(`${amber} this month`);
  if (parts.length) line += ` ${parts.join(', ')}.`;
  return { passed, red, amber, total: results.length, line };
}

module.exports = {
  DEFAULT_CONFIG,
  runChecks,
  summarize,
  // exported for tests
  findSecretPaths,
  looksLikeSecret,
  scheduleIntervalMs,
  parseVersion,
};
