const DEFAULTS = globalThis.UPP_DEFAULTS;
let prefs = DEFAULTS;
let host = null;

function load() {
  return new Promise((res) => chrome.storage.sync.get(DEFAULTS, (p) => {
    res({ ...DEFAULTS, ...p, sites: { ...DEFAULTS.sites, ...(p.sites || {}) } });
  }));
}

function save(patch) {
  prefs = { ...prefs, ...patch };
  chrome.storage.sync.set(prefs);
  showSample();
}

function showSample() {
  const u = prefs.volumeUnit;
  const f = UPP.DISPLAY.volume[u];
  document.querySelector(".sample").textContent = `${UPP.formatMoney((2.45 / 946.352) * f, prefs)}/${u}`;
}

function buildSeg(id, options, key) {
  const box = document.getElementById(id);
  box.innerHTML = "";
  for (const opt of options) {
    const u = typeof opt === "string" ? opt : opt.value;
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = typeof opt === "string" ? opt : opt.label;
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(prefs[key] === u));
    b.addEventListener("click", () => {
      save({ [key]: u });
      box.querySelectorAll("button").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
    });
    box.appendChild(b);
  }
}

function matchSite(h) {
  for (const s of Object.keys(prefs.sites)) if (h === s || h.endsWith("." + s)) return s;
  return null;
}

async function init() {
  prefs = await load();
  buildSeg("weight", Object.keys(UPP.DISPLAY.weight), "weightUnit");
  buildSeg("volume", Object.keys(UPP.DISPLAY.volume), "volumeUnit");
  buildSeg("money", [{ value: "dollars", label: "$0.08" }, { value: "cents", label: "8¢" }], "moneyFormat");
  buildSeg("decimals", [
    { value: 2, label: "0.01" }, { value: 3, label: "0.001" }, { value: 4, label: "0.0001" }
  ], "decimals");

  showSample();

  const toggle = document.getElementById("siteToggle");
  const note = document.getElementById("siteNote");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  try {
    const url = new URL(tab.url);
    if (!/^https?:$/.test(url.protocol)) throw 0;
    host = url.hostname.replace(/^www\./, "");
  } catch {
    toggle.disabled = true;
    note.hidden = false;
    note.textContent = "Open a store's website to turn tags on there.";
    return;
  }

  document.getElementById("host").textContent = host;
  const key = matchSite(host) || host;
  toggle.checked = !!prefs.sites[key];
  toggle.addEventListener("change", () => {
    save({ sites: { ...prefs.sites, [key]: toggle.checked } });
  });
}

init();
