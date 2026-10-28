// Pure parsing + math. No DOM. Shared by content.js and the tests.
(function (root) {
  const WEIGHT = { oz: 28.3495, lb: 453.592, g: 1, kg: 1000 };
  const VOLUME = { floz: 29.5735, ml: 1, l: 1000, gal: 3785.41, qt: 946.353, pt: 473.176 };

  // What the user can pick to display (factor = base units per display unit)
  const DISPLAY = {
    weight: { "oz": 28.3495, "lb": 453.592, "g": 1, "100 g": 100, "kg": 1000 },
    volume: { "fl oz": 29.5735, "L": 1000, "100 mL": 100, "qt": 946.353, "gal": 3785.41 },
    count: { "ea": 1, "dozen": 12 }
  };

  // Longest tokens first so "fl oz" wins over "oz".
  const UNIT_SRC =
    "fl\\.?\\s*oz\\.?|fluid\\s+ounces?|ounces?|oz\\.?|pounds?|lbs?\\.?|kilograms?|kgs?|grams?|g" +
    "|millilit(?:er|re)s?|ml|lit(?:er|re)s?|l|gallons?|gal|quarts?|qt|pints?|pt" +
    "|count|ct|pack|pk|pieces?|pcs?|each|ea|rolls?|sheets?|bags?|loads?|tablets?|capsules?|bars?|dozen";
  const MEASURE_SRC =
    "fl\\.?\\s*oz\\.?|fluid\\s+ounces?|ounces?|oz\\.?|pounds?|lbs?\\.?|kilograms?|kgs?|grams?|g" +
    "|millilit(?:er|re)s?|ml|lit(?:er|re)s?|l|gallons?|gal|quarts?|qt|pints?|pt";
  const NUM_SRC = "(\\d+(?:\\.\\d+)?|\\.\\d+)";
  const END = "(?![a-z])";

  const SIZE_RE = new RegExp("(?<![\\d.$])(?:(\\d+)\\s*\\/\\s*(\\d+)|" + NUM_SRC + ")\\s*-?\\s*(" + UNIT_SRC + ")" + END, "gi");
  const MULTI_RE = new RegExp(
    "(\\d+)\\s*-?\\s*(?:(?:pk|pack)" + END + "\\s*[\\/,x×-]?|(?:ct|count)" + END + "\\s*[x×\\/]|[x×])\\s*(?:of\\s*)?" +
    NUM_SRC + "\\s*-?\\s*(" + MEASURE_SRC + ")" + END, "i");
  // Things like "$0.08/fl oz" or "12¢ per oz": already unit prices, ignore when hunting for the size.
  const UNIT_PRICE_RE = new RegExp(
    "(?:\\$\\s?\\d[\\d,]*(?:\\.\\d+)?|\\d+(?:\\.\\d+)?\\s*¢)\\s*(?:\\/|per)\\s*(?:\\d+\\s*)?(?:" + UNIT_SRC + "|each|ea|unit|item)" + END, "gi");
  const PER_UNIT_AFTER_RE = new RegExp("^\\s*(?:\\/|per|a)\\s*(" + MEASURE_SRC + ")" + END, "i");
  const STORE_UP_RE = new RegExp(
    "(?:\\$\\s?(\\d[\\d,]*(?:\\.\\d+)?)|(\\d+(?:\\.\\d+)?)\\s*¢)\\s*(?:\\/|per)\\s*(\\d+(?:\\.\\d+)?\\s*)?(" +
    UNIT_SRC + "|unit|item)" + END, "i");
  const PACK_OF_RE = /\bpack\s+of\s+(\d+)\b/i;
  const PRICE_RE = /\$\s?(\d{1,4}(?:,\d{3})*(?:\.\d{1,2})?)|(\d{1,2})\s*¢/;
  const PRICE_ONLY_RE = /^\s*(?:now|sale|price|current price|only)?\s*:?\s*(?:\$\s?\d{1,4}(?:,\d{3})*(?:\.\d{1,2})?|\d{1,2}\s*¢)\s*(?:each|ea\.?)?\s*$/i;

  function unitInfo(token) {
    const t = token.toLowerCase().replace(/\s+/g, " ").replace(/\.$/, "").trim();
    if (/^fl\.?\s*oz\.?$|^fluid ounces?$/.test(t)) return { dim: "volume", f: VOLUME.floz };
    if (/^(oz|ounces?)$/.test(t)) return { dim: "weight", f: WEIGHT.oz };
    if (/^(lbs?|pounds?)$/.test(t)) return { dim: "weight", f: WEIGHT.lb };
    if (/^(kgs?|kilograms?)$/.test(t)) return { dim: "weight", f: WEIGHT.kg };
    if (/^(g|grams?)$/.test(t)) return { dim: "weight", f: WEIGHT.g };
    if (/^(ml|millilit(er|re)s?)$/.test(t)) return { dim: "volume", f: VOLUME.ml };
    if (/^(l|lit(er|re)s?)$/.test(t)) return { dim: "volume", f: VOLUME.l };
    if (/^(gal|gallons?)$/.test(t)) return { dim: "volume", f: VOLUME.gal };
    if (/^(qt|quarts?)$/.test(t)) return { dim: "volume", f: VOLUME.qt };
    if (/^(pt|pints?)$/.test(t)) return { dim: "volume", f: VOLUME.pt };
    if (/^dozen$/.test(t)) return { dim: "count", f: 12, name: "dozen" };
    if (/^(rolls?|sheets?|bags?|loads?|tablets?|capsules?|bars?)$/.test(t)) {
      return { dim: "count", f: 1, name: t.replace(/s$/, "") };
    }
    if (/^(count|ct|pack|pk|pieces?|pcs?|each|ea|rolls?|sheets?|bags?|loads?|tablets?|capsules?|bars?)$/.test(t)) return { dim: "count", f: 1 };
    return null;
  }

  // Stuff nobody compares by weight. Eggs by the dozen, the rest per item.
  const DOZEN_RE = /\beggs?\b/i;
  const COUNT_FIRST_RE = new RegExp(
    "\\b(eggs?|paper\\s?towels?|toilet\\s?(?:paper|tissue)|bath\\s?tissue|napkins?|facial\\s?tissues?" +
    "|batter(?:y|ies)|k-?cups?|coffee\\s?pods?|detergent\\s?pods?|dishwasher\\s?pods?|laundry\\s?pods?" +
    "|diapers?|wipes?|trash\\s?bags?|storage\\s?bags?|sandwich\\s?bags?|freezer\\s?bags?|foil\\s?pans?" +
    "|plates?|bowls?|cutlery|forks?|spoons?|knives|straws?|light\\s?bulbs?|dryer\\s?sheets?" +
    "|coffee\\s?filters?|tea\\s?bags?|tampons?|razors?|blades?|sponges?" +
    // snacks and singles people buy by the piece, not by weight
    "|bars?|pouch(?:es)?|packets?|sticks?|pops?|popsicles?|sandwiches?|burritos?|bagels?|buns?" +
    "|muffins?|donuts?|doughnuts?|waffles?|hot\\s?dogs?|corn\\s?dogs?|gummies|lollipops?" +
    "|yogurt\\s?cups?|juice\\s?boxes?|drink\\s?pouch(?:es)?|meals?|entr[ée]es?)\\b", "i");

  function singular(w) {
    const t = w.toLowerCase().trim();
    if (/ies$/.test(t)) return t.replace(/ies$/, "y");
    if (/(ch|sh|x|ss)es$/.test(t)) return t.replace(/es$/, "");
    if (/s$/.test(t) && !/ss$/.test(t)) return t.replace(/s$/, "");
    return t;
  }

  function stripUnitPrices(text) {
    return text.replace(UNIT_PRICE_RE, " ");
  }

  // Returns { dim, base, label, display?, preferred? } where base is grams / mL / items.
  function parseSize(rawText) {
    const size = parseSizeInner(rawText);
    if (!size) return null;
    const p = stripUnitPrices(rawText).match(PACK_OF_RE); // Amazon: "16 Ounce (Pack of 6)"
    if (p && +p[1] > 1 && !size.multi) {
      size.base *= +p[1];
      size.label += ` × ${p[1]}`;
    }
    return size;
  }

  function parseSizeInner(rawText) {
    const text = stripUnitPrices(rawText);
    const noun = text.match(COUNT_FIRST_RE);
    const countFirst = !!noun;
    // "5 ct" of protein bars reads better as "/bar"
    const nounUnit = noun && !/\s/.test(noun[1]) && noun[1].length <= 12 ? singular(noun[1]) : null;
    const dozen = DOZEN_RE.test(text);

    const m = text.match(MULTI_RE);
    if (m && !countFirst) {
      const u = unitInfo(m[3]);
      if (u) {
        const n = parseFloat(m[1]);
        const each = parseFloat(m[2]);
        return { dim: u.dim, base: n * each * u.f, label: `${n} × ${each} ${m[3].trim()}`, multi: true };
      }
    }

    let firstCount = null;
    let firstMeasure = null;
    SIZE_RE.lastIndex = 0;
    let s;
    while ((s = SIZE_RE.exec(text))) {
      let qty;
      if (s[1] !== undefined) {
        const num = +s[1], den = +s[2];
        if (!(num < den && [2, 3, 4, 8].includes(den))) continue; // "12/12 fl oz" is not a fraction
        qty = num / den;
      } else {
        qty = parseFloat(s[3]);
      }
      const u = unitInfo(s[4]);
      if (!u || !qty) continue;
      const hit = { dim: u.dim, base: qty * u.f, label: s[0].trim() };
      if (u.dim === "count") {
        if (!firstCount && hit.base > 1) {
          if (dozen) hit.display = "dozen";
          else hit.display = u.name || nounUnit || undefined;
          firstCount = hit;
        }
        continue;
      }
      if (!firstMeasure) firstMeasure = hit;
      if (!countFirst) return hit; // weight/volume normally wins
    }
    if (countFirst && firstCount) return { ...firstCount, preferred: true };
    return firstMeasure || firstCount;
  }

  function parsePrice(text) {
    const m = text.match(PRICE_RE);
    if (!m) return null;
    if (m[1] !== undefined) return parseFloat(m[1].replace(/,/g, ""));
    return parseInt(m[2], 10) / 100;
  }

  // If text right after a price says "/lb", the price is already per unit.
  function perUnitAfter(textAfter) {
    const m = textAfter.match(PER_UNIT_AFTER_RE);
    if (!m) return null;
    const u = unitInfo(m[1]);
    return u ? { dim: u.dim, base: u.f, label: `1 ${m[1].trim()}` } : null;
  }

  function storeUnitPrice(text) {
    const m = text.match(STORE_UP_RE);
    if (!m) return null;
    const v = m[1] !== undefined ? parseFloat(m[1].replace(/,/g, "")) : parseFloat(m[2]) / 100;
    const mult = m[3] ? parseFloat(m[3]) : 1;
    if (/^(pack|pk)$/i.test(m[4])) return null; // "per pack" isn't per item
    const u = /^(unit|item)$/i.test(m[4]) ? { dim: "count", f: 1 } : unitInfo(m[4]);
    if (!u || !v || !mult) return null;
    return { dim: u.dim, perBase: v / (mult * u.f), label: m[0].replace(/\s+/g, " ").trim() };
  }

  // decimals = places in dollar terms: 2 -> $0.08, 3 -> $0.077, 4 -> $0.0766
  function formatMoney(v, prefs) {
    const d = [2, 3, 4].includes(+prefs?.decimals) ? +prefs.decimals : 2;
    if (prefs?.moneyFormat === "cents" && v < 1) return `${(v * 100).toFixed(d - 2)}¢`;
    return `$${v.toFixed(v >= 1 ? 2 : d)}`;
  }

  // perBase = dollars per gram / mL / item. That's what sorting compares.
  function unitPriceFromBase(perBase, dim, display, prefs) {
    if (!perBase || !isFinite(perBase)) return null;
    const unit = dim === "weight" ? prefs.weightUnit
      : dim === "volume" ? prefs.volumeUnit
      : display || "ea";
    const factor = DISPLAY[dim][unit] || (dim === "count" ? 1 : 0);
    if (!factor) return null;
    const value = perBase * factor;
    return {
      value, unit, dim, perBase,
      text: `${formatMoney(value, prefs)}/${unit}`,
      exact: `$${value.toFixed(6)}/${unit}`
    };
  }

  function unitPrice(price, size, prefs) {
    if (!price || !size || !size.base) return null;
    return unitPriceFromBase(price / size.base, size.dim, size.display, prefs);
  }

  function calcFromText(text, prefs) {
    const cleaned = stripUnitPrices(text);
    const price = parsePrice(cleaned);
    const size = parseSize(text);
    const up = unitPrice(price, size, prefs);
    return up ? { price, size, ...up } : null;
  }

  root.UPP = {
    DISPLAY, parseSize, parsePrice, perUnitAfter, unitPrice, unitPriceFromBase, storeUnitPrice, calcFromText,
    formatMoney, stripUnitPrices, PRICE_ONLY_RE
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
