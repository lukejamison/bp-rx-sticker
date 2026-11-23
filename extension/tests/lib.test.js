// Run with: node --test extension/tests/lib.test.js
// The extension libs are plain browser scripts (no exports), so load them in a vm context.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(file, expose) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', file), 'utf8');
  const ctx = vm.createContext({});
  vm.runInContext(src, ctx);
  return vm.runInContext(`({${expose.join(',')}})`, ctx);
}

const gs1 = load('gs1.js', ['parseGs1Barcode', 'gtinToUpc12', 'upc12ToNdc10', 'ndc10To11Variants']);
const zpl = load('zpl.js', ['generateLabel', 'generateMultipleLabels', 'resolveLabelCount', 'generateTestLabel']);

const GS = String.fromCharCode(29);

test('gtinToUpc12 drops the packaging prefix', () => {
  assert.equal(gs1.gtinToUpc12('00307815770310'), '307815770310');
  assert.equal(gs1.gtinToUpc12('307815770310'), '307815770310');
  assert.equal(gs1.gtinToUpc12(''), null);
});

test('upc12ToNdc10 requires the 3 indicator', () => {
  assert.equal(gs1.upc12ToNdc10('307815770310'), '0781577031');
  assert.equal(gs1.upc12ToNdc10('407815770310'), null);
  assert.equal(gs1.upc12ToNdc10('3078157703'), null);
});

test('ndc10To11Variants gives the three paddings', () => {
  assert.deepEqual([...gs1.ndc10To11Variants('0781577031')], ['00781577031', '07815077031', '07815770301']);
  assert.deepEqual([...gs1.ndc10To11Variants('123')], []);
});

test('parses human-readable GS1', () => {
  const p = gs1.parseGs1Barcode('(01)00307815770310(17)271231(10)RF6342(21)ABC123');
  assert.equal(p.gtin, '00307815770310');
  assert.equal(p.expiry, '271231');
  assert.equal(p.lot, 'RF6342');
  assert.equal(p.serial, 'ABC123');
  assert.ok(p.lookupCodes.includes('307815770310'));
});

test('parses FNC1-separated GS1 and keeps numeric lot/serial intact', () => {
  const p = gs1.parseGs1Barcode(`0100307815770310172712311001234${GS}21017899`);
  assert.equal(p.gtin, '00307815770310');
  assert.equal(p.lot, '01234');
  assert.equal(p.serial, '017899'); // contains "01" - must not terminate early
});

test('parses a plain UPC and puts it first in lookup codes', () => {
  const p = gs1.parseGs1Barcode('307815770310');
  assert.equal(p.lookupCodes[0], '307815770310');
});

test('empty and garbage input do not throw', () => {
  assert.deepEqual([...gs1.parseGs1Barcode('   ').lookupCodes], []);
  assert.doesNotThrow(() => gs1.parseGs1Barcode('not a barcode'));
});

test('resolveLabelCount clamps and defaults', () => {
  assert.equal(zpl.resolveLabelCount({ invoiceQty: '2' }), 2);
  assert.equal(zpl.resolveLabelCount({ invoiceQty: '0' }), 1);
  assert.equal(zpl.resolveLabelCount({ invoiceQty: '500' }), 99);
  assert.equal(zpl.resolveLabelCount({}), 1);
  assert.equal(zpl.resolveLabelCount({ receivedQty: '3 EA' }), 3);
});

test('generateLabel produces one well-formed label', () => {
  const out = zpl.generateTestLabel({});
  assert.ok(out.startsWith('^XA'));
  assert.ok(out.trimEnd().endsWith('^XZ'));
  assert.equal(out.match(/\^XA/g).length, 1);
  assert.match(out, /ELIQUIS/);
});

test('generateLabel survives a very long drug name and odd characters', () => {
  const out = zpl.generateLabel({
    itemName: 'X'.repeat(300) + ' ^FD~ caret',
    ndc: '30781577031',
    upc: '300030894212',
    cost: '1234.5',
    supplier: 'S',
    printWidth: 203,
    labelLength: 203,
  });
  assert.ok(out.trimEnd().endsWith('^XZ'));
  // user text must not inject raw ZPL control chars inside a field
  assert.ok(!/\^FD[^\n]*\^FD~ caret/.test(out));
});

test('generateMultipleLabels repeats and clamps', () => {
  const data = { itemName: 'A', ndc: '30781577031', upc: '300030894212', cost: '1', printWidth: 203, labelLength: 203 };
  assert.equal(zpl.generateMultipleLabels(data, 3).match(/\^XA/g).length, 3);
  assert.equal(zpl.generateMultipleLabels(data, 0).match(/\^XA/g).length, 1);
  assert.equal(zpl.generateMultipleLabels(data, 1000).match(/\^XA/g).length, 99);
});
