const { spawnSync } = require('node:child_process');
const path = require('node:path');

const jest = require.resolve('jest/bin/jest');
const result = spawnSync(
  process.execPath,
  [
    jest,
    '--config',
    path.join('test', 'jest-e2e.json'),
    ...process.argv.slice(2),
  ],
  {
    env: { ...process.env, LOG_LEVEL: 'silent' },
    stdio: 'inherit',
  },
);

process.exit(result.status ?? 1);
