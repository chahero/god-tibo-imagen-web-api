#!/usr/bin/env node
// @ts-nocheck
import http from 'node:http';

import { createHttpHandler } from '../server/app.js';

function parseArgs(argv) {
  const parsed = {
    host: process.env.GTI_HOST || '127.0.0.1',
    port: Number(process.env.GTI_PORT || 8787)
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    switch (token) {
      case '--host':
        parsed.host = next;
        index += 1;
        break;
      case '--port':
        parsed.port = Number(next);
        index += 1;
        break;
      case '--help':
      case '-h':
        parsed.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (!Number.isInteger(parsed.port) || parsed.port < 1 || parsed.port > 65535) {
    throw new Error('Port must be an integer from 1 to 65535.');
  }

  return parsed;
}

function printHelp() {
  console.log(`
Usage:
  gti-serve --host 127.0.0.1 --port 8787

Endpoints:
  GET  /health
  GET  /
  POST /api/generate
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const server = http.createServer(createHttpHandler());
  server.on('error', (error) => {
    if (error?.code === 'EADDRINUSE') {
      console.error(`Port ${args.port} is already in use on ${args.host}.`);
      console.error(`Open http://${args.host}:${args.port} if the server is already running, or start with --port <other-port>.`);
      process.exitCode = 1;
      return;
    }
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  });
  server.listen(args.port, args.host, () => {
    console.log(`got-tibo-imagen-web-api server listening at http://${args.host}:${args.port}`);
  });
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
