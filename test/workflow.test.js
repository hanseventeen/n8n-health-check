'use strict';

// Tests for the files that go into n8n: the health check workflow and the sample workflows.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { runChecks } = require('../src/checks');

const root = path.join(__dirname, '..');
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

test('workflow/health-check.json is up to date with src/ (run scripts/build-workflow.js)', () => {
  const before = fs.readFileSync(path.join(root, 'workflow', 'health-check.json'), 'utf8');
  execFileSync(process.execPath, [path.join(root, 'scripts', 'build-workflow.js')]);
  const after = fs.readFileSync(path.join(root, 'workflow', 'health-check.json'), 'utf8');
  assert.equal(after, before, 'the built workflow was stale');
});

test('read-only: the health check workflow only uses read operations', () => {
  const wf = readJson('workflow/health-check.json');
  const allowed = new Set(['workflow:getAll', 'execution:getAll', 'audit:generate']);
  for (const node of wf.nodes) {
    if (node.type === 'n8n-nodes-base.n8n') {
      const op = `${node.parameters.resource}:${node.parameters.operation}`;
      assert.ok(allowed.has(op), `${node.name} uses ${op}`);
    }
    assert.notEqual(node.type, 'n8n-nodes-base.httpRequest', 'no raw HTTP calls: use the n8n API node');
    if (node.type === 'n8n-nodes-base.readWriteFile') {
      assert.equal(node.parameters.operation, 'write');
      assert.match(node.parameters.fileName, /\/home\/node\/\.n8n-files\/reports\//, 'writes only into the reports folder');
    }
  }
  for (const node of wf.nodes) assert.ok(!('credentials' in node), `${node.name} still carries a credential reference`);
  const execNode = wf.nodes.find((n) => n.name === 'Get executions');
  assert.ok(!execNode.parameters.options.includeData, 'execution data must not be requested');
});

test('the Code node runs the tested code against the sample snapshot', () => {
  const wf = readJson('workflow/health-check.json');
  const code = wf.nodes.find((n) => n.name === 'Run checks').parameters.jsCode;
  const s = readJson('test/fixtures/sample-instance.before.json');
  const data = { 'Get workflows': s.workflows, 'Get executions': s.executions, 'Security audit': [s.audit] };
  const $ = (name) => ({ all: () => data[name].map((json) => ({ json })) });
  const out = new Function('$', code)($);
  assert.equal(out.length, 1);
  assert.match(out[0].json.summary, /^\d+ of 10 checks passed\./);
  assert.match(out[0].json.fileBase, /^health-\d{8}-\d{4}$/);
  assert.ok(!out[0].json.markdown.includes('sk-demo'));
});

const load = (dir) => fs.readdirSync(path.join(root, 'samples', dir)).map((f) => readJson(`samples/${dir}/${f}`));

test('sample workflows are fictional: no real-looking contact data', () => {
  const text = JSON.stringify([load('before'), load('after')]);
  for (const email of text.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || []) assert.match(email, /@example\.(com|invalid)$/);
  for (const url of text.match(/https?:\/\/[^"\s]+/g) || []) assert.match(url, /^https:\/\/[\w.-]+\.example\.(com|invalid)\//);
  for (const phone of text.match(/\+1-\d{3}-\d{4}/g) || []) assert.match(phone, /^\+1-555-/);
});

test('samples before vs after: static checks 1, 4, 5 and 10 improve', () => {
  const now = '2026-11-22T12:00:00.000Z';
  const beforeWfs = load('before').map((w) => Object.assign({}, w, { active: !['Old move-out checklist'].includes(w.name), updatedAt: now }));
  const afterById = Object.fromEntries(load('after').map((w) => [w.id, w]));
  const afterWfs = beforeWfs.filter((w) => !afterById[w.id])
    .concat(Object.values(afterById).map((w) => Object.assign({}, w, { active: true, updatedAt: now })));
  const status = (wfs) => Object.fromEntries(runChecks({ workflows: wfs, executions: [], now }).map((r) => [r.number, r.status]));
  const b = status(beforeWfs);
  const a = status(afterWfs);
  assert.notEqual(b[1], 'green'); assert.equal(a[1], 'green');
  assert.equal(b[4], 'red'); assert.equal(a[4], 'green');
  assert.equal(b[5], 'red'); assert.equal(a[5], 'green');
  assert.equal(b[10], 'red'); assert.notEqual(a[10], 'red');
});

test('pagination: both list nodes fetch every page (returnAll follows the API cursor)', () => {
  // Phase 1.4 check: the live runs returned 217 and 220 executions. n8n's own database held
  // exactly 217 and 220 at those moments, so nothing was cut off. This keeps it that way.
  const wf = readJson('workflow/health-check.json');
  for (const name of ['Get workflows', 'Get executions']) {
    const node = wf.nodes.find((n) => n.name === name);
    assert.equal(node.parameters.returnAll, true, `${name} must use returnAll`);
    assert.equal(node.executeOnce, true, `${name} must run once, not once per item`);
  }
});
