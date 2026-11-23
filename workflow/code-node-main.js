// ---- Code node entry point. Everything above this line is src/checks.js and src/report.js. ----
// Read-only: this node only reads what the three n8n API nodes returned.

const CONFIG = {
  instanceName: 'Marigold Row Rentals (demo)',
  timeZone: 'Asia/Manila',
  // Leave the health check itself and the other demo project out of the checks.
  excludeWorkflowNames: ['Automation Health Check'],
  excludeNamePrefix: 'Break My Agent',
};

const workflows = $('Get workflows').all().map((i) => i.json);
const executions = $('Get executions').all().map((i) => i.json);
const auditItems = $('Security audit').all().map((i) => i.json);
const audit = auditItems.length ? auditItems[0] : null;
const now = new Date().toISOString();

const excludeNames = CONFIG.excludeWorkflowNames.concat(
  workflows.map((w) => w.name).filter((name) => name.startsWith(CONFIG.excludeNamePrefix)));

const results = __checks.runChecks({ workflows, executions, audit, now, config: { excludeWorkflowNames: excludeNames } });
const meta = { instanceName: CONFIG.instanceName, now, timeZone: CONFIG.timeZone };
const stamp = now.slice(0, 16).replace(/[-:T]/g, '').replace(/^(\d{8})(\d{4})$/, '$1-$2');

return [{
  json: {
    summary: __checks.summarize(results).line,
    fileBase: `health-${stamp}`,
    excludedWorkflows: excludeNames,
    results,
    markdown: __report.buildMarkdown(results, meta),
    html: __report.buildHtml(results, meta),
  },
}];
