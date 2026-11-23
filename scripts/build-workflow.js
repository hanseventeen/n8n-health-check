#!/usr/bin/env node
'use strict';

// Builds workflow/health-check.json from the template plus the tested source files,
// so the Code node always runs exactly the code the offline tests ran.
// Usage: node scripts/build-workflow.js

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const wrap = (name, code, requireLine) => `const ${name} = (function () {
  const module = { exports: {} };
  ${requireLine}
${code}
  return module.exports;
})();
`;

const jsCode = [
  '// Built by scripts/build-workflow.js from src/checks.js and src/report.js. Edit those, not this.',
  wrap('__checks', read('src/checks.js'), ''),
  wrap('__report', read('src/report.js'), 'const require = () => __checks;'),
  read('workflow/code-node-main.js'),
].join('\n');

const workflow = JSON.parse(read('workflow/health-check.template.json'));
const code = workflow.nodes.find((n) => n.name === 'Run checks');
code.parameters.jsCode = jsCode;
fs.writeFileSync(path.join(root, 'workflow', 'health-check.json'), JSON.stringify(workflow, null, 2) + '\n');
console.log('Wrote workflow/health-check.json');
