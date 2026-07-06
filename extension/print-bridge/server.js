#!/usr/bin/env node
/**
 * Local print bridge: HTTP POST ZPL -> Zebra raw TCP :9100
 */

const http = require('http');
const net = require('net');

const BRIDGE_HOST = process.env.PRINT_BRIDGE_HOST || '127.0.0.1';
const BRIDGE_PORT = Number(process.env.PRINT_BRIDGE_PORT || 9101);
const DEFAULT_PRINTER_IP = process.env.PRINTER_IP || '172.18.129.132';
const PRINTER_PORT = Number(process.env.PRINTER_PORT || 9100);
const PRINTER_CONNECT_MS = 5000;
const PRINTER_WRITE_MS = 8000;
const PRINTER_END_MS = 3000;
const HTTP_REQUEST_MS = 20000;

function log(level, message, meta) {
  const ts = new Date().toISOString();
  const suffix = meta ? ` ${JSON.stringify(meta)}` : '';
  console.log(`[${ts}] [${level}] ${message}${suffix}`);
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Printer-IP',
    Connection: 'close',
  };
}

/** One printer job at a time — Zebra raw TCP misbehaves with overlapping connections. */
let printChain = Promise.resolve();

function enqueuePrint(task) {
  const run = printChain.then(task, task);
  printChain = run.catch(() => {});
  return run;
}

function sendZplToPrinter(printerIp, zpl) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let client = null;
    let connectTimer = null;
    let writeTimer = null;
    let endTimer = null;

    const cleanup = () => {
      clearTimeout(connectTimer);
      clearTimeout(writeTimer);
      clearTimeout(endTimer);
    };

    const done = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (client) {
        client.removeAllListeners();
        client.destroy();
        client = null;
      }
      if (err) reject(err);
      else resolve();
    };

    connectTimer = setTimeout(() => {
      done(new Error('Printer connection timed out'));
    }, PRINTER_CONNECT_MS);

    client = net.createConnection({ host: printerIp, port: PRINTER_PORT }, () => {
      clearTimeout(connectTimer);
      writeTimer = setTimeout(() => {
        done(new Error('Printer write timed out'));
      }, PRINTER_WRITE_MS);

      client.write(zpl, 'utf8', (writeErr) => {
        clearTimeout(writeTimer);
        if (writeErr) {
          done(writeErr);
          return;
        }

        endTimer = setTimeout(() => {
          log('WARN', 'printer socket end timeout — assuming print delivered', { printerIp });
          done();
        }, PRINTER_END_MS);

        client.end(() => {
          clearTimeout(endTimer);
          done();
        });
      });
    });

    client.on('error', (err) => done(err));
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer((req, res) => {
  req.setTimeout(HTTP_REQUEST_MS, () => {
    log('WARN', 'HTTP request timed out', { method: req.method, url: req.url });
    if (!res.headersSent) {
      res.writeHead(504, { ...corsHeaders(), 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Request timed out' }));
    }
    req.destroy();
  });

  void handleRequest(req, res);
});

async function handleRequest(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { ...corsHeaders(), 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      printerIp: DEFAULT_PRINTER_IP,
      printerPort: PRINTER_PORT,
      pid: process.pid,
    }));
    return;
  }

  if (req.method !== 'POST' || req.url !== '/print') {
    res.writeHead(404, corsHeaders());
    res.end('Not found');
    return;
  }

  const printerIp = req.headers['x-printer-ip'] || DEFAULT_PRINTER_IP;

  try {
    const zpl = await readBody(req);
    if (!zpl.trim()) {
      res.writeHead(400, { ...corsHeaders(), 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Empty ZPL body' }));
      return;
    }

    log('INFO', 'print request', { printerIp, bytes: zpl.length, pid: process.pid });

    await enqueuePrint(() => sendZplToPrinter(printerIp, zpl));

    log('INFO', 'print ok', { printerIp, bytes: zpl.length });
    res.writeHead(200, { ...corsHeaders(), 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, printerIp, bytes: zpl.length }));
  } catch (err) {
    log('ERROR', 'print failed', { printerIp, error: err.message });
    if (!res.headersSent) {
      res.writeHead(500, { ...corsHeaders(), 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message, printerIp }));
    }
  }
}

server.keepAliveTimeout = 5000;
server.headersTimeout = 10000;

let listenRetries = 15;

function tryListen() {
  server.listen(BRIDGE_PORT, BRIDGE_HOST, () => {
    log('INFO', 'listening', {
      bridge: `http://${BRIDGE_HOST}:${BRIDGE_PORT}`,
      printer: `${DEFAULT_PRINTER_IP}:${PRINTER_PORT}`,
      pid: process.pid,
    });
  });
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' && listenRetries > 0) {
    listenRetries -= 1;
    log('WARN', 'port in use, retrying listen', { retriesLeft: listenRetries, port: BRIDGE_PORT });
    setTimeout(() => {
      server.close(() => tryListen());
    }, 2000);
    return;
  }
  log('ERROR', 'HTTP server error', {
    error: err.message,
    code: err.code,
    hint: err.code === 'EADDRINUSE' ? 'stale bridge process may be holding the port' : undefined,
  });
  process.exit(err.code === 'EADDRINUSE' ? 2 : 1);
});

process.on('uncaughtException', (err) => {
  log('ERROR', 'uncaughtException', { error: err.message, stack: err.stack });
});

process.on('unhandledRejection', (reason) => {
  log('ERROR', 'unhandledRejection', { error: String(reason) });
});

tryListen();
