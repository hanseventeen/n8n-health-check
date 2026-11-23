'use strict';

// One passing and one failing fixture per check (some checks have an extra case).
// Each fixture says which check it targets and what status it must get.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runChecks } = require('../src/checks');

const dir = path.join(__dirname, 'fixtures', 'checks');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();

test('every check has at least one green and one non-green fixture', () => {
  for (let n = 1; n <= 10; n += 1) {
    const mine = files.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
      .filter((fx) => fx.expect.check === n);
    assert.ok(mine.some((fx) => fx.expect.status === 'green'), `check ${n} has no passing fixture`);
    assert.ok(mine.some((fx) => fx.expect.status !== 'green'), `check ${n} has no failing fixture`);
  }
});

for (const file of files) {
  const fx = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  test(`${file}: check ${fx.expect.check} is ${fx.expect.status} (${fx.description})`, () => {
    const results = runChecks(fx);
    assert.equal(results.length, 10);
    const r = results.find((x) => x.number === fx.expect.check);
    assert.equal(r.status, fx.expect.status, `found: ${r.found}`);
    if (fx.expect.status !== 'green' && r.id !== 'version') {
      assert.ok(r.items.length > 0 || r.id === 'backup', 'a failing check should name what failed');
    }
  });
}
