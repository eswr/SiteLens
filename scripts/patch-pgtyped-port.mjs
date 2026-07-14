#!/usr/bin/env node
/**
 * Patch `db.port` in a pgtyped JSON config (typically a temp copy).
 * Usage: node scripts/patch-pgtyped-port.mjs <configPath> <port>
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [, , configPath, portArg] = process.argv;
if (!configPath || portArg == null) {
  console.error(
    'Usage: node scripts/patch-pgtyped-port.mjs <configPath> <port>',
  );
  process.exit(1);
}

const port = Number(portArg);
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error(`Invalid port: ${portArg}`);
  process.exit(1);
}

const config = JSON.parse(readFileSync(configPath, 'utf8'));
if (!config.db || typeof config.db !== 'object') {
  console.error(`Config missing db object: ${configPath}`);
  process.exit(1);
}

config.db.port = port;
writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
