#!/usr/bin/env node
'use strict';

// Usage: node bin/report-offline.js <input.json> [output-folder]
// Reads a saved snapshot (workflows, executions, audit) and writes the
// Markdown and HTML report. No network.

const fs = require('fs');
const path = require('path');
const { runChecks, summarize } = require('../src/checks');
const { buildMarkdown, buildHtml } = require('../src/report');

const input = process.argv[2];
const outDir = process.argv[3] || 'reports';
if (!input) {
  console.error('Usage: node bin/report-offline.js <input.json> [output-folder]');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(input, 'utf8'));
const results = runChecks(data);
const meta = { instanceName: data.instanceName, version: data.version, now: data.now || new Date().toISOString() };
const day = meta.now.slice(0, 10);
const base = path.join(outDir, `health-${path.basename(input, '.json')}-${day}`);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(`${base}.md`, buildMarkdown(results, meta));
fs.writeFileSync(`${base}.html`, buildHtml(results, meta));
console.log(summarize(results).line);
console.log(`Wrote ${base}.md and ${base}.html`);
