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
  };
}

function sendZplToPrinter(printerIp, zpl) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve();
    };

    const client = net.createConnection({ host: printerIp, port: PRINTER_PORT }, () => {
      client.write(zpl, 'utf8', (writeErr) => {
        if (writeErr) {
          client.destroy();
          done(writeErr);
          return;
        }
        client.end(() => done());
      });
    });

    const timer = setTimeout(() => {
      client.destroy();
      done(new Error('Printer connection timed out'));
    }, 10000);

    client.on('error', (err) => {
      client.destroy();
      done(err);
    });
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

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { ...corsHeaders(), 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, printerIp: DEFAULT_PRINTER_IP, printerPort: PRINTER_PORT }));
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

    await sendZplToPrinter(printerIp, zpl);
    log('INFO', 'print ok', { printerIp, bytes: zpl.length });
    res.writeHead(200, { ...corsHeaders(), 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, printerIp, bytes: zpl.length }));
  } catch (err) {
    log('ERROR', 'print failed', { printerIp, error: err.message });
    res.writeHead(500, { ...corsHeaders(), 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: err.message, printerIp }));
  }
});

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
  log('ERROR', 'uncaughtException (bridge keeps running)', { error: err.message, stack: err.stack });
});

process.on('unhandledRejection', (reason) => {
  log('ERROR', 'unhandledRejection', { error: String(reason) });
});

tryListen();
