'use strict';

// The two promises from DESIGN.md section 7, as tests:
// 1. Read-only: no call can change the instance.
// 2. Secret values never reach the results or the report.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { API_CALLS, REQUIRED_SCOPES } = require('../src/requests');
const { runChecks } = require('../src/checks');
const { buildMarkdown, buildHtml } = require('../src/report');

const sample = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-instance.before.json'), 'utf8'));

test('read-only: only GET calls, plus POST /audit', () => {
  for (const call of API_CALLS) {
    const ok = call.method === 'GET' || (call.method === 'POST' && call.path === '/api/v1/audit');
    assert.ok(ok, `${call.method} ${call.path} could change the instance`);
  }
});

test('read-only: execution data is never requested', () => {
  const exec = API_CALLS.find((c) => c.path === '/api/v1/executions');
  assert.equal(exec.query.includeData, false);
});

test('read-only: API key scopes are all read or audit', () => {
  for (const s of REQUIRED_SCOPES) assert.match(s, /:(read|generate)$/);
});

test('read-only: no source file calls a write endpoint', () => {
  const src = path.join(__dirname, '..', 'src');
  for (const f of fs.readdirSync(src)) {
    const code = fs.readFileSync(path.join(src, f), 'utf8');
    assert.doesNotMatch(code, /method:\s*'(PUT|PATCH|DELETE)'/, f);
    assert.doesNotMatch(code, /\/(activate|deactivate|retry|stop|archive)\b/, f);
  }
});

// Collect every string that the checks flagged as a secret, straight from the fixtures.
const SECRET_VALUES = ['sk-demo-FAKE0000000000000000', 'demoFAKEtoken000000000000'];

test('no secret value appears in results, Markdown or HTML', () => {
  const failFx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'checks', '04-hardcoded-secrets.fail.json'), 'utf8'));
  for (const input of [sample, failFx]) {
    const results = runChecks(input);
    assert.equal(results.find((r) => r.id === 'hardcoded-secrets').status, 'red', 'the secret should be found');
    const outputs = [JSON.stringify(results), buildMarkdown(results, { now: input.now }), buildHtml(results, { now: input.now })];
    for (const out of outputs) for (const secret of SECRET_VALUES) {
      assert.ok(!out.includes(secret), 'secret value leaked into output');
      assert.ok(!out.includes(secret.slice(0, 12)), 'part of a secret value leaked into output');
    }
  }
});

test('no tenant phone number from node parameters appears in the report', () => {
  const results = runChecks(sample);
  const md = buildMarkdown(results, { now: sample.now });
  assert.ok(!md.includes('555-0142'));
});

test('HTML report escapes workflow names', () => {
  const evil = JSON.parse(JSON.stringify(sample));
  evil.workflows[0].name = '<script>alert(1)</script>';
  const html = buildHtml(runChecks(evil), { now: evil.now, instanceName: '<b>x</b>' });
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<b>x</b>'));
});
