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
const PRINTER_DRAIN_MS = 500;
const PRINTER_SOCKET_KILL_MS = 2500;
const HTTP_BODY_MS = 30000;
const HTTP_PRINT_BASE_MS = 90000;

let nextRequestId = 1;

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

function createRequestTimer(req, res) {
  let timer = null;

  const clear = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    req.setTimeout(0);
    req.removeAllListeners('timeout');
  };

  const arm = (ms, label) => {
    clear();
    timer = setTimeout(() => {
      log('WARN', 'HTTP request timed out', { label, ms });
      if (!res.headersSent) {
        res.writeHead(504, { ...corsHeaders(), 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Print bridge request timed out' }));
      }
      req.destroy();
    }, ms);
  };

  return { arm, clear };
}

function httpTimeoutForZpl(zpl) {
  const bytes = Buffer.byteLength(zpl, 'utf8');
  return Math.min(180000, HTTP_PRINT_BASE_MS + Math.ceil(bytes / 50));
}

function printTimeoutsForZpl(zpl) {
  const bytes = Buffer.byteLength(zpl, 'utf8');
  return {
    writeMs: Math.min(90000, PRINTER_WRITE_MS + Math.ceil(bytes / 150)),
  };
}

/** One printer job at a time — Zebra raw TCP misbehaves with overlapping connections. */
let printChain = Promise.resolve();
let queueDepth = 0;

function enqueuePrint(task, meta) {
  queueDepth += 1;
  const queuedAt = Date.now();
  log('INFO', 'print queued', { ...meta, queueDepth });

  const run = printChain
    .then(async () => {
      const waitMs = Date.now() - queuedAt;
      if (waitMs > 500) {
        log('INFO', 'print dequeue', { ...meta, waitMs, queueDepth });
      }
      return task();
    })
    .finally(() => {
      queueDepth = Math.max(0, queueDepth - 1);
    });

  printChain = run.catch(() => {});
  return run;
}

function sendZplToPrinter(printerIp, zpl, meta) {
  const { writeMs } = printTimeoutsForZpl(zpl);

  return new Promise((resolve, reject) => {
    let settled = false;
    let client = null;
    let connectTimer = null;
    let writeTimer = null;
    let killTimer = null;

    const cleanup = () => {
      clearTimeout(connectTimer);
      clearTimeout(writeTimer);
      clearTimeout(killTimer);
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
      }, writeMs);

      client.write(zpl, 'utf8', (writeErr) => {
        clearTimeout(writeTimer);
        if (writeErr) {
          done(writeErr);
          return;
        }

        // Do not wait on client.end() — Zebra often never ACKs close, which blocks the next job.
        killTimer = setTimeout(() => done(), PRINTER_DRAIN_MS);
        try {
          client.end();
        } catch {
          /* ignore */
        }
        setTimeout(() => {
          if (!settled && client) {
            log('WARN', 'forcing printer socket close', meta);
            done();
          }
        }, PRINTER_SOCKET_KILL_MS);
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
  void handleRequest(req, res);
});

async function handleRequest(req, res) {
  const requestTimer = createRequestTimer(req, res);

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
      queueDepth,
    }));
    return;
  }

  if (req.method !== 'POST' || req.url !== '/print') {
    res.writeHead(404, corsHeaders());
    res.end('Not found');
    return;
  }

  const printerIp = req.headers['x-printer-ip'] || DEFAULT_PRINTER_IP;
  const requestId = nextRequestId++;

  try {
    requestTimer.arm(HTTP_BODY_MS, 'read-body');
    const zpl = await readBody(req);
    if (!zpl.trim()) {
      requestTimer.clear();
      res.writeHead(400, { ...corsHeaders(), 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Empty ZPL body' }));
      return;
    }

    const labelCount = (zpl.match(/\^XZ/g) || []).length || 1;
    const meta = { requestId, printerIp, bytes: zpl.length, labels: labelCount, pid: process.pid };

    requestTimer.arm(httpTimeoutForZpl(zpl), 'print-job');
    log('INFO', 'print request', meta);

    await enqueuePrint(() => sendZplToPrinter(printerIp, zpl, meta), meta);

    requestTimer.clear();
    log('INFO', 'print ok', meta);
    res.writeHead(200, { ...corsHeaders(), 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, printerIp, bytes: zpl.length, labels: labelCount, requestId }));
  } catch (err) {
    requestTimer.clear();
    log('ERROR', 'print failed', { requestId, printerIp, error: err.message });
    if (!res.headersSent) {
      res.writeHead(500, { ...corsHeaders(), 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message, printerIp, requestId }));
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
