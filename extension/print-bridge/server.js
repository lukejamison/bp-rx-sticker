#!/usr/bin/env node
/**
 * Local print bridge: HTTP POST ZPL -> Zebra raw TCP :9100
 */

const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');

const BRIDGE_VERSION = '0.4.4';
const BRIDGE_HOST = process.env.PRINT_BRIDGE_HOST || '127.0.0.1';
const BRIDGE_PORT = Number(process.env.PRINT_BRIDGE_PORT || 9101);
const DEFAULT_PRINTER_IP = process.env.PRINTER_IP || '172.18.129.123';
const PRINTER_PORT = Number(process.env.PRINTER_PORT || 9100);
const PRINTER_CONNECT_MS = 5000;
const PRINTER_WRITE_MS = 8000;
/** Grace period to let the printer ACK our FIN before we force-close. Sending RST
 * (via destroy() with no prior end()) instead of a clean FIN is what wedges Zebra's
 * raw port-9100 service — it holds the connection slot until an internal timeout
 * clears, which is why prints "work once, then time out" until the bridge restarts. */
const PRINTER_CLOSE_GRACE_MS = 1500;
const INTER_LABEL_MS = 350;
const HTTP_BODY_MS = 30000;
const HTTP_PRINT_BASE_MS = 120000;
const LOG_DIR = path.join(__dirname, 'logs');

let nextRequestId = 1;

try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
} catch {
  /* ignore */
}

const LOG_PATH = path.join(LOG_DIR, `server-${new Date().toISOString().slice(0, 10)}.log`);

function log(level, message, meta) {
  const line = `[${new Date().toISOString()}] [${level}] ${message}${meta ? ` ${JSON.stringify(meta)}` : ''}`;
  console.log(line);
  fs.appendFile(LOG_PATH, `${line}\n`, () => {});
  try {
    if (process.stdout._handle?.setBlocking) {
      process.stdout._handle.setBlocking(true);
    }
  } catch {
    /* ignore */
  }
}

function respondJson(req, res, statusCode, body) {
  if (req.aborted || res.writableEnded) {
    return false;
  }
  try {
    res.writeHead(statusCode, { ...corsHeaders(), 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
    return true;
  } catch (err) {
    log('WARN', 'response failed (client gone?)', { error: err.message });
    return false;
  }
}

function watchClientDisconnect(req, meta) {
  const onClose = () => {
    log('WARN', 'client disconnected during print', meta);
  };
  req.once('aborted', onClose);
  req.once('close', onClose);
}

function resolvePrinterIp(headerIp) {
  const configured = DEFAULT_PRINTER_IP;
  if (headerIp && headerIp !== configured) {
    log('WARN', 'ignoring X-Printer-IP; using bridge PRINTER_IP', { headerIp, configured });
  }
  return configured;
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

function httpTimeoutForZpl(zpl, labelCount) {
  const bytes = Buffer.byteLength(zpl, 'utf8');
  const perLabel = 15000;
  return Math.min(300000, HTTP_PRINT_BASE_MS + Math.ceil(bytes / 40) + labelCount * perLabel);
}

function printTimeoutsForZpl(zpl) {
  const bytes = Buffer.byteLength(zpl, 'utf8');
  return {
    writeMs: Math.min(60000, PRINTER_WRITE_MS + Math.ceil(bytes / 100)),
    jobMs: Math.min(60000, PRINTER_CONNECT_MS + PRINTER_WRITE_MS + Math.ceil(bytes / 80) + 5000),
  };
}

function splitZplLabels(zpl) {
  const labels = [];
  const re = /\^XA[\s\S]*?\^XZ/g;
  let match = re.exec(zpl);
  while (match) {
    labels.push(match[0]);
    match = re.exec(zpl);
  }
  return labels.length ? labels : [zpl];
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      if (waitMs > 300) {
        log('INFO', 'print dequeue', { ...meta, waitMs, queueDepth });
      }
      return task();
    })
    .finally(() => {
      queueDepth = Math.max(0, queueDepth - 1);
    });

  // Never let a rejected job block the queue.
  printChain = run.catch((err) => {
    log('ERROR', 'queue job failed (continuing)', { ...meta, error: err.message });
  });
  return run;
}

function sendZplToPrinter(printerIp, zpl, meta) {
  const { writeMs, jobMs } = printTimeoutsForZpl(zpl);

  return new Promise((resolve, reject) => {
    let settled = false;
    let client = null;
    let connectTimer = null;
    let writeTimer = null;
    let jobTimer = null;
    let closeGraceTimer = null;

    const cleanup = () => {
      clearTimeout(connectTimer);
      clearTimeout(writeTimer);
      clearTimeout(jobTimer);
      clearTimeout(closeGraceTimer);
    };

    // Force-close is a LAST resort, done a beat after we've already settled the
    // promise — never before end() has had a chance to send a real FIN.
    const forceCloseSocket = () => {
      if (!client) return;
      const c = client;
      client = null;
      c.removeAllListeners();
      c.destroy();
    };

    const done = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (err) reject(err);
      else resolve();
      setTimeout(forceCloseSocket, 50);
    };

    jobTimer = setTimeout(() => {
      log('ERROR', 'print job hard timeout', meta);
      done(new Error('Print job timed out'));
    }, jobMs);

    connectTimer = setTimeout(() => {
      done(new Error('Printer connection timed out'));
    }, PRINTER_CONNECT_MS);

    client = net.createConnection({ host: printerIp, port: PRINTER_PORT }, () => {
      clearTimeout(connectTimer);
      client.setNoDelay(true);
      log('INFO', 'printer connected', meta);

      writeTimer = setTimeout(() => {
        done(new Error('Printer write timed out'));
      }, writeMs);

      client.write(zpl, 'utf8', (writeErr) => {
        clearTimeout(writeTimer);
        if (writeErr) {
          done(writeErr);
          return;
        }

        log('INFO', 'printer write ok', meta);

        // Drain any response bytes — unread data in the receive buffer at close time
        // can itself force an RST even when we call end() cleanly.
        client.on('data', () => {});

        // Send a real FIN. Resolve as soon as the printer ACKs the close, or after a
        // short grace period if it never does — but always attempt the clean close.
        client.once('close', () => done());
        client.end();
        closeGraceTimer = setTimeout(() => {
          log('INFO', 'printer close not acked in time — resolving anyway', meta);
          done();
        }, PRINTER_CLOSE_GRACE_MS);
      });
    });

    client.on('error', (err) => {
      log('ERROR', 'printer socket error', { ...meta, error: err.message });
      done(err);
    });
  });
}

async function sendAllLabels(printerIp, zpl, meta) {
  const labels = splitZplLabels(zpl);
  log('INFO', 'sending labels', { ...meta, labelTotal: labels.length });

  for (let i = 0; i < labels.length; i++) {
    if (i > 0) {
      await delay(INTER_LABEL_MS);
    }
    const labelMeta = { ...meta, labelIndex: i + 1, labelTotal: labels.length, bytes: labels[i].length };
    await sendZplToPrinter(printerIp, labels[i], labelMeta);
    log('INFO', 'label sent', labelMeta);
  }
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
      bridgeVersion: BRIDGE_VERSION,
      printerIp: DEFAULT_PRINTER_IP,
      printerPort: PRINTER_PORT,
      pid: process.pid,
      queueDepth,
      logFile: LOG_PATH,
    }));
    return;
  }

  if (req.method !== 'POST' || req.url !== '/print') {
    res.writeHead(404, corsHeaders());
    res.end('Not found');
    return;
  }

  const printerIp = resolvePrinterIp(req.headers['x-printer-ip']);
  const requestId = nextRequestId++;
  const startedAt = Date.now();

  log('INFO', 'incoming POST /print', { requestId, printerIp, pid: process.pid });
  watchClientDisconnect(req, { requestId });

  try {
    requestTimer.arm(HTTP_BODY_MS, 'read-body');
    const zpl = await readBody(req);
    if (!zpl.trim()) {
      requestTimer.clear();
      respondJson(req, res, 400, { ok: false, error: 'Empty ZPL body' });
      return;
    }

    const labels = splitZplLabels(zpl);
    const meta = {
      requestId,
      printerIp,
      bytes: zpl.length,
      labels: labels.length,
      pid: process.pid,
    };

    requestTimer.arm(httpTimeoutForZpl(zpl, labels.length), 'print-job');
    log('INFO', 'print request', meta);

    await enqueuePrint(() => sendAllLabels(printerIp, zpl, meta), meta);

    requestTimer.clear();
    const elapsedMs = Date.now() - startedAt;
    log('INFO', 'print ok', { ...meta, elapsedMs });

    if (!respondJson(req, res, 200, {
      ok: true,
      printerIp,
      bytes: zpl.length,
      labels: labels.length,
      requestId,
      elapsedMs,
    })) {
      log('WARN', 'print delivered but HTTP client already gone', { ...meta, elapsedMs });
    }
  } catch (err) {
    requestTimer.clear();
    log('ERROR', 'print failed', { requestId, printerIp, error: err.message, elapsedMs: Date.now() - startedAt });
    if (!res.headersSent) {
      respondJson(req, res, 500, { ok: false, error: err.message, printerIp, requestId });
    }
  }
}

server.keepAliveTimeout = 5000;
server.headersTimeout = 10000;

let listenRetries = 15;

function tryListen() {
  server.listen(BRIDGE_PORT, BRIDGE_HOST, () => {
    log('INFO', 'listening', {
      bridgeVersion: BRIDGE_VERSION,
      bridge: `http://${BRIDGE_HOST}:${BRIDGE_PORT}`,
      printer: `${DEFAULT_PRINTER_IP}:${PRINTER_PORT}`,
      pid: process.pid,
      logFile: LOG_PATH,
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
