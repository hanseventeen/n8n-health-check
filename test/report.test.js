'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runChecks, summarize } = require('../src/checks');
const { buildMarkdown, buildHtml } = require('../src/report');

const sample = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-instance.before.json'), 'utf8'));
const results = runChecks(sample);
const meta = { instanceName: sample.instanceName, version: sample.version, now: sample.now };

test('sample instance: every broken sample trips the check it was built to trip', () => {
  const status = Object.fromEntries(results.map((r) => [r.number, r.status]));
  const names = (n) => results.find((r) => r.number === n).items.map((i) => i.workflow);
  assert.equal(status[1], 'amber');            // S1 has no error workflow
  assert.ok(names(1).includes('Tenant maintenance intake'));
  assert.equal(status[2], 'red');              // S3 fails most runs
  assert.ok(names(2).includes('Daily vacancy report'));
  assert.ok(['amber', 'red'].includes(status[3])); // S4 never called
  assert.ok(names(3).includes('Lease renewal follow-up'));
  assert.equal(status[4], 'red');              // S2 key in header
  assert.equal(status[5], 'red');              // S1 open webhook
  assert.ok(['amber', 'red'].includes(status[6])); // S2 no retry/timeout
  assert.equal(status[7], 'red');              // 2.42.7 behind, security fix
  assert.equal(status[8], 'amber');            // S5 abandoned
  assert.equal(status[9], 'red');              // S6 backup failing
  assert.equal(status[10], 'red');             // no kill switch
});

test('Markdown report: title, summary line first, all 10 checks, limits footer', () => {
  const md = buildMarkdown(results, meta);
  const lines = md.split('\n');
  assert.match(lines[0], /^# Automation health check: Marigold Row Rentals/);
  assert.ok(md.includes(`**${summarize(results).line}**`));
  for (let n = 1; n <= 10; n += 1) assert.match(md, new RegExp(`\\| ${n}\\. `));
  assert.match(md, /What this check can't see/);
  assert.match(md, /November 20, 2026/);
});

test('HTML report is a complete page with the same summary', () => {
  const html = buildHtml(results, meta);
  assert.match(html, /^<!doctype html>/);
  assert.ok(html.includes(summarize(results).line));
  assert.equal((html.match(/<tr class="(green|amber|red)">/g) || []).length, 10);
});
