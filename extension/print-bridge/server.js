#!/usr/bin/env node
/**
 * Local print bridge: HTTP POST ZPL → Zebra raw TCP :9100
 *
 * Run on the same PC as Chrome (Windows OneScan workstation):
 *   node extension/print-bridge/server.js
 *
 * Env:
 *   PRINTER_IP=172.18.129.132
 *   PRINTER_PORT=9100
 *   PRINT_BRIDGE_PORT=9101
 */

const http = require('http');
const net = require('net');

const BRIDGE_HOST = process.env.PRINT_BRIDGE_HOST || '127.0.0.1';
const BRIDGE_PORT = Number(process.env.PRINT_BRIDGE_PORT || 9101);
const DEFAULT_PRINTER_IP = process.env.PRINTER_IP || '172.18.129.132';
const PRINTER_PORT = Number(process.env.PRINTER_PORT || 9100);

function log(level, message, extra) {
  const ts = new Date().toISOString();
  const suffix = extra ? ` ${JSON.stringify(extra)}` : '';
  console.log(`[${ts}] [${level}] ${message}${suffix}`);
}

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
    const client = net.createConnection({ host: printerIp, port: PRINTER_PORT }, () => {
      client.write(zpl, 'utf8', () => client.end());
    });
    client.setTimeout(10000, () => {
      client.destroy(new Error('Printer connection timed out'));
    });
    client.on('error', reject);
    client.on('close', (hadError) => {
      if (hadError) return;
      resolve();
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
    log('INFO', 'health check');
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

server.listen(BRIDGE_PORT, BRIDGE_HOST, () => {
  log('INFO', 'listening', {
    bridge: `http://${BRIDGE_HOST}:${BRIDGE_PORT}`,
    printer: `${DEFAULT_PRINTER_IP}:${PRINTER_PORT}`,
  });
});
