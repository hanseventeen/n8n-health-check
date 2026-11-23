'use strict';

/*
 * Builds the one-page health report from check results.
 * Markdown and HTML come from the same data. The HTML escapes everything,
 * because workflow and node names come from the instance and can't be trusted.
 */

const { summarize } = require('./checks');

const LABEL = { green: 'OK', amber: 'This month', red: 'This week' };
const DOT = { green: '🟢', amber: '🟠', red: '🔴' };

const CANT_SEE = [
  'Environment variables, server settings and host-level backups (for example Docker volume snapshots).',
  'What is inside your credentials. That is on purpose.',
  'Runs that n8n has already deleted, or that a workflow is set not to save.',
  'Whether a kill switch is wired correctly inside each workflow, only that it is called.',
];

function formatDate(nowIso, timeZone) {
  const d = new Date(nowIso);
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
    }).format(d) + ` (${timeZone})`;
  } catch (e) {
    return d.toISOString();
  }
}

function itemText(item) {
  return item.node ? `${item.workflow} / ${item.node}: ${item.detail}` : `${item.workflow}: ${item.detail}`;
}

function mdEscape(text) {
  return String(text).replace(/([\\`*_[\]|<>])/g, '\\$1');
}

function buildMarkdown(results, meta) {
  const s = summarize(results);
  const lines = [];
  lines.push(`# Automation health check: ${mdEscape(meta.instanceName || 'n8n instance')}`);
  lines.push('');
  lines.push(`${formatDate(meta.now, meta.timeZone || 'Asia/Manila')}` +
    (meta.version ? ` · n8n ${mdEscape(meta.version)}` : ''));
  lines.push('');
  lines.push(`**${s.line}**`);
  lines.push('');
  lines.push('| | Check | What we found | Fix |');
  lines.push('|---|---|---|---|');
  for (const r of results) {
    const fix = r.status === 'green' ? '' : mdEscape(r.fix);
    lines.push(`| ${DOT[r.status]} ${LABEL[r.status]} | ${r.number}. ${mdEscape(r.title)} | ${mdEscape(r.found)} | ${fix} |`);
  }
  const flagged = results.filter((r) => r.status !== 'green' && r.items.length);
  if (flagged.length) {
    lines.push('');
    lines.push('## Details');
    for (const r of flagged) {
      lines.push('');
      lines.push(`**${r.number}. ${mdEscape(r.title)}**: ${mdEscape(r.why)}`);
      lines.push('');
      for (const item of r.items) lines.push(`- ${mdEscape(itemText(item))}`);
    }
  }
  lines.push('');
  lines.push('## What this check can\'t see');
  lines.push('');
  for (const c of CANT_SEE) lines.push(`- ${c}`);
  lines.push('');
  lines.push('_Read-only: this check changed nothing on the instance and never shows secret values._');
  lines.push('');
  return lines.join('\n');
}

function esc(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildHtml(results, meta) {
  const s = summarize(results);
  const rows = results.map((r) => `
      <tr class="${r.status}">
        <td class="status"><span class="dot"></span>${LABEL[r.status]}</td>
        <td><strong>${r.number}. ${esc(r.title)}</strong><div class="why">${esc(r.why)}</div></td>
        <td>${esc(r.found)}${r.status !== 'green' && r.items.length
          ? `<ul>${r.items.map((i) => `<li>${esc(itemText(i))}</li>`).join('')}</ul>` : ''}</td>
        <td>${r.status === 'green' ? '' : esc(r.fix)}</td>
      </tr>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Automation health check</title>
<style>
  :root { --ink:#1d2433; --muted:#5b6475; --line:#e3e6ec; --bg:#ffffff;
          --green:#1f9d55; --amber:#d97706; --red:#dc2626; }
  body { font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--ink);
         background: var(--bg); margin: 0 auto; max-width: 960px; padding: 24px 16px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .meta { color: var(--muted); margin-bottom: 16px; }
  .summary { font-size: 16px; font-weight: 600; padding: 12px 14px; border: 1px solid var(--line);
             border-radius: 8px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; vertical-align: top; padding: 8px; border-top: 1px solid var(--line); }
  th { color: var(--muted); font-weight: 500; }
  .status { white-space: nowrap; font-weight: 600; }
  .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; }
  .green .dot { background: var(--green); } .amber .dot { background: var(--amber); } .red .dot { background: var(--red); }
  .why { color: var(--muted); font-size: 13px; margin-top: 2px; }
  ul { margin: 6px 0 0; padding-left: 18px; }
  footer { color: var(--muted); font-size: 13px; margin-top: 20px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <h1>Automation health check: ${esc(meta.instanceName || 'n8n instance')}</h1>
  <div class="meta">${esc(formatDate(meta.now, meta.timeZone || 'Asia/Manila'))}${meta.version ? ` · n8n ${esc(meta.version)}` : ''}</div>
  <div class="summary">${esc(s.line)}</div>
  <table>
    <thead><tr><th>Status</th><th>Check</th><th>What we found</th><th>Fix</th></tr></thead>
    <tbody>${rows}
    </tbody>
  </table>
  <footer>
    <strong>What this check can't see:</strong>
    <ul>${CANT_SEE.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
    <p>Read-only: this check changed nothing on the instance and never shows secret values.</p>
  </footer>
</body>
</html>
`;
}

module.exports = { buildMarkdown, buildHtml, CANT_SEE };
