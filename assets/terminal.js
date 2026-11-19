// Lumwatch terminal: a live desk for Robinhood Chain mainnet (chain id 4663).
// Every number here is read from the chain in your browser. Shield, Send and Prove are previews: nothing is signed.
(() => {
  const root = document.getElementById("tm");
  if (!root) return;
  const RPC = "https://rpc.mainnet.chain.robinhood.com";
  const EXP = "https://robinhoodchain.blockscout.com";
  const SOURCIFY = "https://sourcify.dev/server/v2/contract/4663/";
  const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const MKTS = {
    USDG: { address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", decimals: 6, dp: 2 },
    WETH: { address: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73", decimals: 18, dp: 4 },
  };
  const TF = { "1m": 60, "5m": 300, "15m": 900 };
  const BARS = 60, CHUNK = 2000, POLL_MS = 4000;
  const $ = (id) => document.getElementById(id);
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const short = (a) => a.slice(0, 6) + "…" + a.slice(-4);
  const tiny = (a) => a.slice(0, 6) + "…";
  const hexN = (h) => parseInt(h, 16);

  let rid = 0;
  async function rpc(method, params) {
    const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++rid, method, params }) });
    if (!r.ok) throw new Error("RPC answered " + r.status);
    const j = await r.json();
    if (j.error) throw new Error(j.error.message || "RPC error");
    return j.result;
  }
  const units = (v, d, dp) => {
    const s = v.toString().padStart(d + 1, "0");
    const w = BigInt(s.slice(0, -d) || "0"), f = s.slice(-d).slice(0, dp);
    return w.toLocaleString("en-US") + (dp ? "." + f : "");
  };
  const compact = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : n.toFixed(n < 10 ? 2 : 0));
  const ago = (s) => (s < 60 ? Math.max(0, Math.round(s)) + "s" : s < 3600 ? Math.round(s / 60) + "m" : Math.round(s / 3600) + "h");

  // ---- state ----
  let mkt = "USDG", tf = "1m";
  let head = 0, secPerBlock = 0.1, gasWei = 0n;
  let logs = [];          // { b, from, to, v (bigint), tx, i }
  let lastPolled = 0, loading = false, alive = true, failures = 0;
  let account = window.lwAccount || null;
  const blocks = [];      // { n, txs, t }

  // ---- chain basics: head, block time, gas ----
  async function basics() {
    const [h, g] = await Promise.all([rpc("eth_blockNumber", []), rpc("eth_gasPrice", [])]);
    head = hexN(h); gasWei = BigInt(g);
    if (!basics.timed) {
      const [b1, b0] = await Promise.all([rpc("eth_getBlockByNumber", ["0x" + head.toString(16), false]), rpc("eth_getBlockByNumber", ["0x" + (head - 20000).toString(16), false])]);
      const dt = hexN(b1.timestamp) - hexN(b0.timestamp);
      if (dt > 0) secPerBlock = dt / 20000;
      basics.timed = true;
    }
  }
  const spanBlocks = () => Math.ceil(TF[tf] / secPerBlock);

  function decode(l) {
    return { b: hexN(l.blockNumber), from: "0x" + l.topics[1].slice(26), to: "0x" + l.topics[2].slice(26), v: BigInt(l.data === "0x" ? 0 : l.data), tx: l.transactionHash, i: hexN(l.logIndex) };
  }
  async function getLogs(from, to) {
    const out = [];
    for (let a = from; a <= to; a += CHUNK) {
      const b = Math.min(to, a + CHUNK - 1);
      const r = await rpc("eth_getLogs", [{ address: MKTS[mkt].address, topics: [TRANSFER], fromBlock: "0x" + a.toString(16), toBlock: "0x" + b.toString(16) }]);
      for (const l of r) if (l.topics.length === 3) out.push(decode(l));
    }
    return out;
  }

  // ---- full load for the current market and timeframe ----
  async function load() {
    if (loading) return; loading = true;
    $("tm-load").hidden = false; $("tm-load").textContent = "Reading " + mkt + " transfers from Robinhood Chain…";
    try {
      await basics();
      const from = head - spanBlocks() + 1;
      logs = await getLogs(from, head);
      lastPolled = head;
      if (!blocks.length) {
        const recent = await Promise.all(Array.from({ length: 8 }, (_, k) => rpc("eth_getBlockByNumber", ["0x" + (head - k * 10).toString(16), false]).catch(() => null)));
        for (const b of recent) if (b) blocks.push({ n: hexN(b.number), txs: b.transactions.length, t: hexN(b.timestamp) });
      }
      $("tm-load").hidden = true;
      draw(); renderFeed(true); renderStats(); renderMine(); setLive(true);
    } catch (e) {
      $("tm-load").textContent = "Could not read the chain (" + e.message + "). Retrying…";
      setLive(false);
      setTimeout(() => { loading = false; load(); }, 5000);
      return;
    }
    loading = false;
  }

  // ---- live poll: new blocks and new transfers ----
  async function poll() {
    if (!alive || loading || document.hidden || !lastPolled) return;
    try {
      const h = hexN(await rpc("eth_blockNumber", []));
      if (h > lastPolled) {
        const fresh = await getLogs(lastPolled + 1, h);
        head = h; lastPolled = h;
        if (fresh.length) logs.push(...fresh);
        const cut = head - spanBlocks() + 1;
        logs = logs.filter((l) => l.b >= cut);
        const blk = await rpc("eth_getBlockByNumber", ["0x" + h.toString(16), false]);
        blocks.unshift({ n: h, txs: blk.transactions.length, t: hexN(blk.timestamp) });
        blocks.length = Math.min(blocks.length, 40);
        if (Math.random() < 0.25) gasWei = BigInt(await rpc("eth_gasPrice", []));
        draw(); renderFeed(false, fresh.length); renderStats(); renderBlocks(); renderMine();
      }
      failures = 0; setLive(true);
    } catch { if (++failures > 2) setLive(false); }
  }

  function setLive(ok) {
    const el = $("tm-live");
    el.classList.toggle("off", !ok);
    el.lastChild.textContent = ok ? " Live · mainnet" : " Reconnecting";
  }

  // ---- stats bar ----
  function renderStats() {
    const m = MKTS[mkt];
    const total = logs.reduce((a, l) => a + l.v, 0n);
    const senders = new Set(logs.map((l) => l.from)).size;
    $("tm-big").textContent = logs.length.toLocaleString("en-US");
    $("tm-s-block").textContent = head.toLocaleString("en-US");
    $("tm-s-gas").textContent = (Number(gasWei) / 1e9).toFixed(3) + " gwei";
    $("tm-s-bt").textContent = secPerBlock.toFixed(3) + " s";
    $("tm-s-vol").textContent = units(total, m.decimals, m.dp) + " " + mkt;
    $("tm-s-send").textContent = senders.toLocaleString("en-US");
    $("tm-s-win").textContent = tf + " · " + spanBlocks().toLocaleString("en-US") + " blocks";
    $("tm-fee").textContent = gasWei ? (Number(gasWei * 65000n) / 1e18).toFixed(8) + " ETH" : "-";
  }

  // ---- chart: transfer volume per bucket (bars) and transfer count (line) ----
  const cv = $("tm-cv"), cx = cv.getContext("2d");
  let buckets = [], hover = -1;
  function bucketize() {
    const span = spanBlocks(), from = head - span + 1, size = span / BARS;
    buckets = Array.from({ length: BARS }, (_, k) => ({ from: Math.round(from + k * size), vol: 0n, n: 0 }));
    for (const l of logs) { const k = Math.min(BARS - 1, Math.max(0, Math.floor((l.b - from) / size))); buckets[k].vol += l.v; buckets[k].n++; }
  }
  function draw() {
    bucketize();
    const r = cv.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
    cv.width = Math.max(1, r.width * d); cv.height = Math.max(1, r.height * d);
    cx.setTransform(d, 0, 0, d, 0, 0);
    const W = r.width, H = r.height, padL = 12, padR = 64, top = 40, bot = H - 30;
    const css = getComputedStyle(document.documentElement);
    const col = (v, fb) => css.getPropertyValue(v).trim() || fb;
    const lamp = col("--lamp", "#34c77b"), warn = col("--warn", "#e9a23b"), mist = col("--mist", "#a4a5a5"), stone = col("--stone", "#232427");
    cx.clearRect(0, 0, W, H);
    const m = MKTS[mkt], toNum = (v) => Number(v / 10n ** BigInt(Math.max(0, m.decimals - 6))) / 1e6;
    const vols = buckets.map((b) => toNum(b.vol)), maxV = Math.max(1e-9, ...vols), maxN = Math.max(1, ...buckets.map((b) => b.n));
    const bw = (W - padL - padR) / BARS;
    cx.strokeStyle = stone; cx.lineWidth = 1; cx.fillStyle = mist; cx.font = "11px JetBrains Mono, monospace"; cx.textAlign = "left";
    for (let g = 0; g <= 4; g++) {
      const y = top + ((bot - top) * g) / 4;
      cx.beginPath(); cx.moveTo(padL, y); cx.lineTo(W - padR, y); cx.stroke();
      cx.fillText(compact(maxV * (1 - g / 4)), W - padR + 8, y + 4);
    }
    buckets.forEach((b, k) => {
      const h = ((bot - top) * vols[k]) / maxV, x = padL + k * bw;
      cx.fillStyle = k === hover ? lamp : lamp + "99";
      cx.fillRect(x + bw * 0.15, bot - h, Math.max(1, bw * 0.7), h);
    });
    cx.strokeStyle = warn; cx.lineWidth = 1.6; cx.beginPath();
    buckets.forEach((b, k) => { const x = padL + k * bw + bw / 2, y = bot - ((bot - top) * b.n) / maxN; k ? cx.lineTo(x, y) : cx.moveTo(x, y); });
    cx.stroke();
    cx.fillStyle = mist; cx.textAlign = "center";
    for (let k = 0; k < BARS; k += 15) {
      const secsAgo = (head - buckets[k].from) * secPerBlock;
      cx.fillText("-" + ago(secsAgo), padL + k * bw + bw / 2, H - 10);
    }
    cx.fillText("now", W - padR - bw / 2, H - 10);
    if (hover >= 0) {
      const x = padL + hover * bw + bw / 2;
      cx.strokeStyle = mist + "66"; cx.setLineDash([4, 4]); cx.beginPath(); cx.moveTo(x, top); cx.lineTo(x, bot); cx.stroke(); cx.setLineDash([]);
    }
    $("tm-l-vol").textContent = compact(vols.reduce((a, v) => a + v, 0)) + " " + mkt;
    $("tm-l-n").textContent = logs.length.toLocaleString("en-US");
    cv._geo = { padL, bw, W, padR };
  }
  cv.addEventListener("mousemove", (e) => {
    const g = cv._geo; if (!g || !buckets.length) return;
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left;
    const k = Math.floor((x - g.padL) / g.bw);
    hover = k >= 0 && k < BARS ? k : -1; draw();
    const tip = $("tm-tip");
    if (hover < 0) { tip.style.display = "none"; return; }
    const b = buckets[hover], m = MKTS[mkt];
    const end = hover < BARS - 1 ? buckets[hover + 1].from - 1 : head;
    tip.innerHTML = "";
    for (const t of [`blocks ${b.from.toLocaleString("en-US")}–${end.toLocaleString("en-US")}`, `${units(b.vol, m.decimals, m.dp)} ${mkt} moved`, `${b.n} transfer${b.n === 1 ? "" : "s"}`]) { const d = document.createElement("div"); d.textContent = t; tip.append(d); }
    tip.style.display = "block";
    tip.style.left = Math.min(r.width - 200, Math.max(8, x + 12)) + "px"; tip.style.top = "44px";
  });
  cv.addEventListener("mouseleave", () => { hover = -1; $("tm-tip").style.display = "none"; draw(); });

  // ---- right column: live transfers and blocks ----
  let feedTab = "tx";
  function row(href, a, p, t, isNew) {
    const el = document.createElement("a");
    el.className = "tm-row" + (isNew && !still ? " new" : ""); el.href = href; el.target = "_blank"; el.rel = "noopener";
    for (const [cls, txt] of [["a", a], ["p", p], ["t", t]]) { const s = document.createElement("span"); s.className = cls; s.textContent = txt; el.append(s); }
    return el;
  }
  function renderFeed(all, freshN = 0) {
    if (feedTab !== "tx") return;
    const box = $("tm-feed"), m = MKTS[mkt];
    $("tm-fh").innerHTML = "<span>Amount</span><span>From → to</span><span style='text-align:right'>Age</span>";
    box.innerHTML = "";
    const last = logs.slice(-40).reverse();
    last.forEach((l, k) => box.append(row(EXP + "/tx/" + l.tx, units(l.v, m.decimals, m.dp), tiny(l.from) + " → " + tiny(l.to), ago((head - l.b) * secPerBlock), !all && k < freshN)));
    if (!last.length) box.innerHTML = "<div class='tm-empty'>No " + mkt + " transfers in this window.</div>";
  }
  function renderBlocks() {
    if (feedTab !== "blk") return;
    const box = $("tm-feed");
    $("tm-fh").innerHTML = "<span>Block</span><span>Transactions</span><span style='text-align:right'>Age</span>";
    box.innerHTML = "";
    const now = Date.now() / 1000;
    blocks.forEach((b, k) => box.append(row(EXP + "/block/" + b.n, b.n.toLocaleString("en-US"), b.txs + " tx", ago(now - b.t), k === 0)));
    if (!blocks.length) box.innerHTML = "<div class='tm-empty'>Waiting for the next block…</div>";
  }
  document.querySelectorAll("[data-feed]").forEach((b) => b.addEventListener("click", () => {
    feedTab = b.dataset.feed;
    document.querySelectorAll("[data-feed]").forEach((x) => x.setAttribute("aria-selected", x === b));
    feedTab === "tx" ? renderFeed(true) : renderBlocks();
  }));

  // ---- market and timeframe switches ----
  document.querySelectorAll("[data-mkt]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.mkt === mkt) return;
    mkt = b.dataset.mkt;
    document.querySelectorAll("[data-mkt]").forEach((x) => x.setAttribute("aria-pressed", x === b));
    document.querySelectorAll("[data-mktname]").forEach((x) => (x.textContent = mkt));
    load();
  }));
  document.querySelectorAll("[data-tf]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.tf === tf) return;
    tf = b.dataset.tf;
    document.querySelectorAll("[data-tf]").forEach((x) => x.setAttribute("aria-selected", x === b));
    load();
  }));

  // ---- action panel: Shield / Send / Prove are previews; Check is live ----
  document.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("[data-act]").forEach((x) => x.setAttribute("aria-pressed", x === b));
    document.querySelectorAll("[data-actpane]").forEach((p) => (p.hidden = p.dataset.actpane !== b.dataset.act));
  }));
  const call = (to, data) => rpc("eth_call", [{ to, data }, "latest"]).catch(() => null);
  function str(hex) {
    if (!hex || hex === "0x") return null;
    const b = hex.slice(2);
    try {
      if (b.length === 64) return decodeURIComponent(b.replace(/(00)+$/, "").replace(/../g, "%$&")) || null;
      const len = parseInt(b.slice(64, 128), 16); return decodeURIComponent(b.slice(128, 128 + len * 2).replace(/../g, "%$&"));
    } catch { return null; }
  }
  $("tm-checkform").addEventListener("submit", async (e) => {
    e.preventDefault();
    const a = $("tm-checkaddr").value.trim(), out = $("tm-checkout");
    out.innerHTML = "";
    const li = (cls, t) => { const x = document.createElement("li"); x.className = cls; const i = document.createElement("span"); i.textContent = { ok: "✓", warn: "!", bad: "✕" }[cls]; const s = document.createElement("span"); s.textContent = t; x.append(i, s); out.append(x); };
    if (!/^0x[0-9a-fA-F]{40}$/.test(a)) return li("bad", "That is not a 0x address.");
    li("warn", "Reading the chain…");
    try {
      const code = await rpc("eth_getCode", [a, "latest"]);
      out.innerHTML = "";
      if (!code || code === "0x") return li("bad", "No contract code: a wallet or an empty address, not a token.");
      li("ok", "Contract code present (" + ((code.length - 2) / 2).toLocaleString("en-US") + " bytes)");
      const [n, s, d, ts, own, impl] = await Promise.all([call(a, "0x06fdde03"), call(a, "0x95d89b41"), call(a, "0x313ce567"), call(a, "0x18160ddd"), call(a, "0x8da5cb5b"),
        rpc("eth_getStorageAt", [a, "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc", "latest"]).catch(() => null)]);
      if (!d || d === "0x" || !ts || ts === "0x") return li("bad", "A contract, but it does not answer like a token.");
      const D = Number(BigInt(d));
      li("ok", (str(n) || "?") + " (" + (str(s) || "?") + ") · " + D + " decimals · " + units(BigInt(ts), D, 0) + " supply");
      if (!own || own === "0x") li("ok", "No owner() function");
      else if (/^0x0+$/.test(own)) li("ok", "Owner renounced");
      else li("warn", "Owner " + short("0x" + own.slice(-40)) + " can still call owner-only functions");
      if (impl && !/^0x0*$/.test(impl)) li("warn", "Upgradeable proxy: its code can be swapped (logic at " + short("0x" + impl.slice(-40)) + ")");
      try { const r = await fetch(SOURCIFY + a); const j = await r.json(); ["exact_match", "match"].includes(j.match) ? li("ok", "Source verified on Sourcify (" + j.match.replace("_", " ") + ")") : li("warn", "Source not verified on Sourcify"); }
      catch { li("warn", "Sourcify did not answer"); }
    } catch (err) { out.innerHTML = ""; li("bad", "Could not read the chain: " + err.message); }
  });

  // ---- bottom: your wallet ----
  async function renderMine() {
    const box = $("tm-mine");
    if (!account) { box.innerHTML = ""; const d = document.createElement("div"); d.className = "tm-empty"; d.innerHTML = "<p style='margin:0'>Connect a wallet to see your public balances and your " + mkt + " transfers in this window.</p>"; const b = document.createElement("button"); b.className = "tm-btn"; b.type = "button"; b.textContent = "Connect wallet"; b.addEventListener("click", () => document.getElementById("wallet")?.click()); d.append(b); box.append(d); return; }
    const me = account.toLowerCase(), pad = me.slice(2).padStart(64, "0");
    try {
      const [eth, usdg, weth] = await Promise.all([rpc("eth_getBalance", [account, "latest"]), call(MKTS.USDG.address, "0x70a08231" + pad), call(MKTS.WETH.address, "0x70a08231" + pad)]);
      const mine = logs.filter((l) => l.from === me || l.to === me).slice(-20).reverse();
      box.innerHTML = "";
      const wal = document.createElement("div"); wal.className = "tm-wal";
      for (const [k, v] of [["ETH", units(BigInt(eth), 18, 4)], ["USDG", units(BigInt(usdg || "0x0"), 6, 2)], ["WETH", units(BigInt(weth || "0x0"), 18, 4)]]) { const c = document.createElement("div"); const s = document.createElement("span"); s.textContent = k + " · public"; const b = document.createElement("b"); b.textContent = v; c.append(s, b); wal.append(c); }
      box.append(wal);
      const p = document.createElement("p"); p.className = "tm-small";
      p.textContent = short(account) + " · " + (mine.length ? mine.length + " " + mkt + " transfer" + (mine.length === 1 ? "" : "s") + " in this window:" : "no " + mkt + " transfers in this " + tf + " window.") + " Anyone can see these. That is what Lumwatch is being built to change.";
      box.append(p);
      const m = MKTS[mkt];
      mine.forEach((l) => box.append(row(EXP + "/tx/" + l.tx, (l.from === me ? "−" : "+") + units(l.v, m.decimals, m.dp), l.from === me ? "to " + short(l.to) : "from " + short(l.from), ago((head - l.b) * secPerBlock))));
    } catch (e) { box.textContent = "Could not read your balances: " + e.message; }
  }
  window.addEventListener("lw:account", (e) => { account = e.detail || null; renderMine(); });
  document.querySelectorAll("[data-btab]").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("[data-btab]").forEach((x) => x.setAttribute("aria-selected", x === b));
    document.querySelectorAll("[data-bpane]").forEach((p) => (p.hidden = p.dataset.bpane !== b.dataset.btab));
  }));

  addEventListener("resize", () => draw());
  document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });
  load();
  setInterval(poll, POLL_MS);
})();
