(() => {
  if (window.__uppLoaded) return;
  window.__uppLoaded = true;

  const DEFAULTS = globalThis.UPP_DEFAULTS;

  // Sites where we know exactly what one product box is.
  const ADAPTERS = [
    { host: /(^|\.)amazon\./, item: '[data-component-type="s-search-result"]' }
  ];
  const adapter = ADAPTERS.find((a) => a.host.test(location.hostname)) || null;

  let prefs = DEFAULTS;
  let observer = null;
  let timer = null;
  let sortOn = false;

  const hasLayout = () => document.documentElement.getClientRects().length > 0;

  function siteOn(p) {
    const host = location.hostname.replace(/^www\./, "");
    for (const [site, on] of Object.entries(p.sites || {})) {
      if (host === site || host.endsWith("." + site)) return on;
    }
    return false;
  }

  // ---------- reading prices ----------

  // Aldi-style "$2 <sup>45</sup>" reads as "$245". If the digits live in separate
  // pieces and the last piece is 2 digits, that last piece is the cents.
  function priceText(el) {
    const raw = el.textContent.replace(/\s+/g, " ").trim();
    if (raw.includes(".") || !raw.includes("$")) return raw;
    const parts = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const t = walker.currentNode.nodeValue.replace(/[\s$]/g, "");
      if (/^\d+$/.test(t)) parts.push(t);
    }
    if (parts.length >= 2 && parts[parts.length - 1].length === 2) {
      const cents = parts.pop();
      return `$${parts.join("")}.${cents}`;
    }
    return raw;
  }

  function isPriceEl(el) {
    const t = el.textContent;
    if (!t || t.length > 30 || !/[$¢]/.test(t)) return false;
    return UPP.PRICE_ONLY_RE.test(priceText(el));
  }

  function isStruck(el) {
    if (el.closest("s, del, strike, .upp-tag")) return true;
    if (!hasLayout()) return false;
    const deco = getComputedStyle(el).textDecorationLine || "";
    return deco.includes("line-through");
  }

  function isVisible(el) {
    if (!hasLayout()) return true;
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  }

  function textAfter(container, el, n = 20) {
    const r = document.createRange();
    r.setStartAfter(el);
    r.setEnd(container, container.childNodes.length);
    return r.toString().slice(0, n);
  }

  function textBefore(container, el, n = 6) {
    const r = document.createRange();
    r.setStart(container, 0);
    r.setEndBefore(el);
    return r.toString().slice(-n);
  }

  // "$0.45" in "($0.45/Ounce)" is the store's unit price, not the product price.
  function isUnitPriceEl(el) {
    const box = el.parentElement?.parentElement || el.parentElement;
    if (!box) return false;
    return /^\s*(\/|per\b)/i.test(textAfter(box, el)) || /\(\s*$/.test(textBefore(box, el));
  }

  // Text of a box with a space between every piece ("32 fl oz" + "Many in stock"
  // must not become "32 fl ozMany"). Leaves out the price itself and our tags.
  function spacedText(node, priceEl) {
    const out = [];
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const tn = walker.currentNode;
      if (priceEl.contains(tn) || tn.parentElement?.closest(".upp-tag, .upp-sort")) continue;
      const v = tn.nodeValue.trim();
      if (v) out.push(v);
    }
    return out.join(" ");
  }

  // Walk up from the price until a box mentions a size. Never climb into a box that
  // holds another product's price. Weight/volume beats a count.
  function findCard(priceEl, priceCount) {
    if (adapter) {
      const item = priceEl.closest(adapter.item);
      if (!item) return null;
      const text = spacedText(item, priceEl);
      return { card: item, size: UPP.parseSize(text), store: UPP.storeUnitPrice(text) };
    }
    let node = priceEl.parentElement;
    let countHit = null;
    for (let i = 0; i < 10 && node && node !== document.body; i++) {
      if ((priceCount.get(node) || 0) > 1) break;
      if ((node.textContent || "").length > 3000) break;
      const perUnit = UPP.perUnitAfter(textAfter(node, priceEl)); // "$0.29 /lb"
      if (perUnit) return { card: node, size: perUnit, store: null };
      const text = spacedText(node, priceEl);
      const size = UPP.parseSize(text);
      const store = UPP.storeUnitPrice(text);
      if (store || (size && (size.dim !== "count" || size.preferred))) return { card: node, size, store };
      if (size && !countHit) countHit = { card: node, size, store: null };
      node = node.parentElement;
    }
    return countHit;
  }

  // Store's own unit price is the most accurate number when it exists, unless the
  // item is something we price by the piece (bars, eggs...) and the store used weight.
  function resolve(price, size, store) {
    if (store && !(size && size.preferred && size.dim !== store.dim)) {
      const display = store.dim === "count" && size?.dim === "count" ? size.display : undefined;
      const r = UPP.unitPriceFromBase(store.perBase, store.dim, display, prefs);
      return r && { ...r, how: `Store's own unit price: ${store.label}` };
    }
    const r = UPP.unitPrice(price, size, prefs);
    return r && { ...r, how: `$${price.toFixed(2)} ÷ ${size.label} = ${r.exact}` };
  }

  function makeTag(r) {
    const tag = document.createElement("span");
    tag.className = "upp-tag";
    tag.textContent = r.text;
    tag.title = r.how;
    tag.dataset.dim = r.dim;
    tag.dataset.perBase = String(r.perBase);
    return tag;
  }

  function scan() {
    if (!document.body) return;
    const all = document.querySelectorAll("span, div, p, strong, b, ins, bdi, data, h2, h3, h4, h5, h6");

    // 1) Find the real price elements.
    const prices = [];
    for (const el of all) {
      if (el.closest(".upp-tag, .upp-sort") || !isPriceEl(el)) continue;
      const pt = priceText(el);
      if ([...el.children].some((c) => isPriceEl(c) && priceText(c) === pt)) continue; // wrapper
      const parent = el.parentElement;
      if (parent && isPriceEl(parent) && priceText(parent) !== pt) continue; // "$2" half of "$2.45"
      if (isStruck(el) || !isVisible(el) || isUnitPriceEl(el)) continue;
      prices.push({ el, pt });
    }

    // 2) Count prices inside each ancestor so we know where one product ends.
    const priceCount = new Map();
    for (const { el } of prices) {
      let n = el.parentElement;
      for (let i = 0; i < 10 && n && n !== document.body; i++, n = n.parentElement) {
        priceCount.set(n, (priceCount.get(n) || 0) + 1);
      }
    }

    // 3) Tag them.
    const done = new Set();
    for (const { el, pt } of prices) {
      const found = findCard(el, priceCount);
      if (!found || done.has(found.card)) continue;
      done.add(found.card);

      const price = UPP.parsePrice(pt);
      const r = resolve(price, found.size, found.store);
      if (!r) continue;

      const tag = makeTag(r);
      const existing = found.card.querySelector(".upp-tag");
      if (existing) {
        if (existing.textContent !== tag.textContent || existing.dataset.perBase !== tag.dataset.perBase) {
          existing.replaceWith(tag);
        }
        continue;
      }
      el.insertAdjacentElement("afterend", tag);
    }
  }

  // ---------- sorting ----------

  // Find each tag's product box and the list that holds them.
  function findItems() {
    const tags = [...document.querySelectorAll(".upp-tag")];
    const out = [];
    if (adapter) {
      for (const tag of tags) {
        const item = tag.closest(adapter.item);
        if (item?.parentElement) out.push({ tag, item, list: item.parentElement });
      }
      return out;
    }
    const tagCount = new Map();
    for (const tag of tags) {
      let n = tag.parentElement;
      for (let i = 0; i < 15 && n && n !== document.body; i++, n = n.parentElement) {
        tagCount.set(n, (tagCount.get(n) || 0) + 1);
      }
    }
    for (const tag of tags) {
      let n = tag.parentElement;
      for (let i = 0; i < 15 && n && n.parentElement && n !== document.body; i++, n = n.parentElement) {
        const mine = tagCount.get(n) || 0;
        const parents = tagCount.get(n.parentElement) || 0;
        if (parents > mine) {
          if (mine === 1) out.push({ tag, item: n, list: n.parentElement });
          break;
        }
      }
    }
    return out;
  }

  function usesOrder(list) {
    const d = getComputedStyle(list).display;
    return /flex|grid/.test(d);
  }

  function applySort(announce) {
    const groups = new Map();
    for (const it of findItems()) {
      if (!groups.has(it.list)) groups.set(it.list, []);
      groups.get(it.list).push(it);
    }
    document.querySelectorAll(".upp-best").forEach((t) => t.classList.remove("upp-best"));

    let summary = null;
    let biggest = null;
    for (const [list, items] of groups) {
      if (items.length < 2) continue;
      const dimCount = {};
      for (const it of items) dimCount[it.tag.dataset.dim] = (dimCount[it.tag.dataset.dim] || 0) + 1;
      const mainDim = Object.keys(dimCount).sort((a, b) => dimCount[b] - dimCount[a])[0];
      const ranked = items.slice().sort((a, b) => {
        const am = a.tag.dataset.dim === mainDim ? 0 : 1;
        const bm = b.tag.dataset.dim === mainDim ? 0 : 1;
        if (am !== bm) return am - bm;
        if (a.tag.dataset.dim !== b.tag.dataset.dim) return a.tag.dataset.dim < b.tag.dataset.dim ? -1 : 1;
        return +a.tag.dataset.perBase - +b.tag.dataset.perBase;
      });
      ranked[0].tag.classList.add("upp-best");
      ranked[0].tag.title = "Cheapest on this page. " + ranked[0].tag.title.replace(/^Cheapest on this page\. /, "");

      const children = [...list.children];
      children.forEach((c, i) => { if (!c.dataset.uppOrig) c.dataset.uppOrig = String(i); });
      const rankOf = new Map(ranked.map((it, i) => [it.item, i]));
      list.dataset.uppSorted = usesOrder(list) ? "order" : "move";

      if (list.dataset.uppSorted === "order") {
        for (const c of children) {
          c.style.order = rankOf.has(c) ? String(rankOf.get(c)) : String(100000 + +c.dataset.uppOrig);
        }
      } else {
        const rest = children.filter((c) => !rankOf.has(c)).sort((a, b) => a.dataset.uppOrig - b.dataset.uppOrig);
        list.append(...ranked.map((it) => it.item), ...rest);
      }

      if (!biggest || items.length > biggest.items) {
        biggest = { list, items: items.length };
        const others = items.length - dimCount[mainDim];
        const unit = ranked[0].tag.textContent.split("/").pop();
        summary = `Cheapest per ${unit} first.` +
          (others ? ` ${others} priced in other units (like oz vs fl oz) are after those.` : "") +
          ` Only sorts what's loaded on this page.`;
      }
    }

    if (announce) {
      if (!biggest) { toast("Not enough tagged items here to sort."); return false; }
      const top = biggest.list.getBoundingClientRect().top + window.scrollY - 120;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      toast(summary);
    }
    return !!biggest;
  }

  function clearSort() {
    document.querySelectorAll(".upp-best").forEach((t) => t.classList.remove("upp-best"));
    for (const list of document.querySelectorAll("[data-upp-sorted]")) {
      const kids = [...list.children];
      if (list.dataset.uppSorted === "order") {
        kids.forEach((c) => (c.style.order = ""));
      } else {
        kids.filter((c) => c.dataset.uppOrig)
          .sort((a, b) => a.dataset.uppOrig - b.dataset.uppOrig)
          .forEach((c) => list.appendChild(c));
      }
      delete list.dataset.uppSorted;
    }
  }

  function sortButton() {
    let btn = document.querySelector(".upp-sort");
    const tags = document.querySelectorAll(".upp-tag").length;
    if (tags < 3 || !siteOn(prefs)) { btn?.remove(); return; }
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.className = "upp-sort";
      btn.addEventListener("click", () => {
        if (observer) observer.disconnect();
        try {
          if (sortOn) { clearSort(); sortOn = false; }
          else { sortOn = applySort(true); }
        } finally { watch(); sortButton(); }
      });
      document.body.appendChild(btn);
    }
    btn.textContent = sortOn ? "Back to normal order" : "Sort by unit price";
    btn.setAttribute("aria-pressed", String(sortOn));
  }

  // ---------- plumbing ----------

  function scheduleScan() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (observer) observer.disconnect();
      try {
        scan();
        if (sortOn) applySort(false); // new results loaded: keep them sorted
        sortButton();
      } finally { watch(); }
    }, 350);
  }

  function watch() {
    if (!observer) observer = new MutationObserver(scheduleScan);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function stop() {
    clearTimeout(timer);
    if (observer) observer.disconnect();
    clearSort();
    sortOn = false;
    document.querySelectorAll(".upp-tag, .upp-sort").forEach((t) => t.remove());
  }

  function applyPrefs(p) {
    prefs = { ...DEFAULTS, ...p, sites: { ...DEFAULTS.sites, ...(p.sites || {}) } };
    stop();
    if (siteOn(prefs)) scheduleScan();
  }

  function toast(message) {
    document.querySelector(".upp-toast")?.remove();
    const box = document.createElement("div");
    box.className = "upp-toast";
    box.setAttribute("role", "status");
    box.textContent = message;
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 7000);
    box.addEventListener("click", () => box.remove());
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type !== "upp-selection") return;
    const r = UPP.calcFromText(msg.text || "", prefs);
    if (r) toast(`${r.text}   ($${r.price.toFixed(2)} ÷ ${r.size.label})`);
    else toast("Couldn't find both a price and a size. Highlight both, like “$2.45 … 32 fl oz”.");
  });

  chrome.storage.sync.get(DEFAULTS, applyPrefs);
  chrome.storage.onChanged.addListener(() => chrome.storage.sync.get(DEFAULTS, applyPrefs));
})();
