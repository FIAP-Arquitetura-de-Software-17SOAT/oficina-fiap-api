const { spawnSync } = require('node:child_process');
const path = require('node:path');

const runner = path.join('scripts', 'run-e2e.js');
const nodeOptions = [
  process.env.NODE_OPTIONS,
  '--experimental-vm-modules',
]
  .filter(Boolean)
  .join(' ');
const result = spawnSync(
  process.execPath,
  [runner, ...process.argv.slice(2)],
  {
    env: {
      ...process.env,
      NODE_OPTIONS: nodeOptions,
      RUN_DATABASE_TESTS: 'true',
    },
    stdio: 'inherit',
  },
);

process.exit(result.status ?? 1);
