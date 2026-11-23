'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { looksLikeSecret, findSecretPaths, scheduleIntervalMs, parseVersion, summarize } = require('../src/checks');

test('secret patterns: catches key shapes, ignores expressions and normal text', () => {
  assert.equal(looksLikeSecret('Authorization', 'Bearer sk-demo-FAKE0000000000000000'), true);
  assert.equal(looksLikeSecret('x', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJkZW1vIn0.ZmFrZXNpZ25hdHVyZQ'), true);
  assert.equal(looksLikeSecret('api_key', 'demoFAKEtoken000000000000'), true);
  assert.equal(looksLikeSecret('Authorization', '={{ $env.SMS_TOKEN }}'), false);
  assert.equal(looksLikeSecret('message', 'Your rent of $1,200 is due on the 1st.'), false);
  assert.equal(looksLikeSecret('url', 'https://api.example.com/units'), false);
});

test('secret finder returns field paths, never values', () => {
  const paths = findSecretPaths({ headerParameters: { parameters: [{ name: 'Authorization', value: 'Bearer sk-demo-FAKE0000000000000000' }] } }, '', []);
  assert.deepEqual(paths, ['headerParameters.parameters[0] (Authorization)']);
  assert.ok(!paths.join(' ').includes('sk-demo'));
});

test('schedule intervals', () => {
  const h = 3600 * 1000;
  assert.equal(scheduleIntervalMs({ parameters: { rule: { interval: [{ field: 'hours', hoursInterval: 2 }] } } }), 2 * h);
  assert.equal(scheduleIntervalMs({ parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 5 }] } } }), 5 * 60 * 1000);
  assert.equal(scheduleIntervalMs({ parameters: {} }), 24 * h, 'default schedule is daily');
});

test('version parsing', () => {
  assert.deepEqual(parseVersion('2.42.7'), [2, 42, 7]);
  assert.deepEqual(parseVersion('v2.48.7'), [2, 48, 7]);
  assert.equal(parseVersion('latest'), null);
});

test('summary line', () => {
  const mk = (status) => ({ status });
  const s = summarize([...Array(6).fill(mk('green')), mk('red'), mk('red'), mk('amber'), mk('amber')]);
  assert.equal(s.line, '6 of 10 checks passed. 2 need attention this week, 2 this month.');
  assert.equal(summarize(Array(10).fill(mk('green'))).line, '10 of 10 checks passed.');
});

test('excludeWorkflowNames leaves a workflow and its runs out of every check', () => {
  const { runChecks } = require('../src/checks');
  const input = {
    now: '2026-11-20T09:00:00.000Z',
    workflows: [{ id: 'x', name: 'Break My Agent v1', active: true, nodes: [{ name: 'Webhook', type: 'n8n-nodes-base.webhook', parameters: {} }], settings: {} }],
    executions: [{ id: '1', workflowId: 'x', status: 'error', startedAt: '2026-11-20T08:00:00.000Z' }],
  };
  assert.equal(runChecks(input).find((r) => r.id === 'webhook-auth').status, 'red');
  input.config = { excludeWorkflowNames: ['Break My Agent v1'] };
  const results = runChecks(input);
  assert.equal(results.find((r) => r.id === 'webhook-auth').status, 'green');
  assert.ok(!JSON.stringify(results).includes('Break My Agent'));
});

test('backup check names the last run and when it happened', () => {
  const { runChecks } = require('../src/checks');
  const fx = require('./fixtures/checks/09-backup.fail.json');
  const r = runChecks(fx).find((x) => x.id === 'backup');
  assert.match(r.items[0].detail, /^active, last run error at \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/);
});

test('kill switch: when one exists but is skipped, the fix says to add the call, not to create one', () => {
  const { runChecks } = require('../src/checks');
  const fx = require('./fixtures/checks/10-kill-switch.partial.json');
  const r = runChecks(fx).find((x) => x.id === 'kill-switch');
  assert.equal(r.status, 'amber');
  assert.match(r.fix, /^Add an Execute Workflow node/);
});
