(function () {
  const watched = new WeakSet();

  function isTargetPage() {
    return (
      location.hostname === 'onescan.lspedia.com' &&
      location.hash.toLowerCase().startsWith('#/ssccscanin')
    );
  }

  function enhanceLabelsArea(area) {
    if (!isTargetPage() || area.querySelector('.bp-rx-scan-card')) return;

    const wrap = area.querySelector(':scope > span');
    if (!wrap) return;

    const product = wrap.querySelector('.label-barcode[title="Details"]');
    const meta = [...wrap.querySelectorAll('.label-barcode:not([title="Details"])')];
    const actions = [...wrap.querySelectorAll('.scanned-mark, .btn-danger')];

    if (!product && meta.length === 0) return;

    const card = document.createElement('div');
    card.className = 'bp-rx-scan-card';

    const head = document.createElement('div');
    head.className = 'bp-rx-scan-card__head';

    const productSlot = document.createElement('div');
    productSlot.className = 'bp-rx-scan-card__product';
    if (product) productSlot.appendChild(product);

    const actionSlot = document.createElement('div');
    actionSlot.className = 'bp-rx-scan-card__actions';
    actions.forEach((el) => actionSlot.appendChild(el));

    head.appendChild(productSlot);
    if (actions.length) head.appendChild(actionSlot);
    card.appendChild(head);

    if (meta.length) {
      const metaRow = document.createElement('div');
      metaRow.className = 'bp-rx-scan-card__meta';
      meta.forEach((el) => metaRow.appendChild(el));
      card.appendChild(metaRow);
    }

    wrap.replaceChildren(card);
    watchArea(area);
  }

  function watchArea(area) {
    if (watched.has(area)) return;
    watched.add(area);

    const observer = new MutationObserver(() => {
      if (!area.isConnected) return;
      if (!area.querySelector('.bp-rx-scan-card')) {
        enhanceLabelsArea(area);
      }
    });

    observer.observe(area, { childList: true, subtree: true });
  }

  function scan(root = document) {
    if (!isTargetPage()) return;
    root.querySelectorAll('[class*="ssccScanIn"] .labels-area').forEach(enhanceLabelsArea);
  }

  function boot() {
    scan();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (node.matches?.('.labels-area')) {
            enhanceLabelsArea(node);
          } else {
            node.querySelectorAll?.('.labels-area').forEach(enhanceLabelsArea);
          }
        }
      }
    });

    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }

    window.addEventListener('hashchange', () => scan());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
