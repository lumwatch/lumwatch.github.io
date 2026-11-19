// Lumwatch terminal: a live ETH/USDG desk for Robinhood Chain mainnet (chain id 4663).
// Candles are built in your browser from every swap in the public WETH/USDG pools: open, high, low and close are
// the pool prices of the first, highest, lowest and last swap in each slice. Nothing comes from an off-chain feed.
// Shield, Send and Prove are previews: nothing is signed.
(() => {
  const root = document.getElementById("tm");
  if (!root) return;
  const RPC = "https://rpc.mainnet.chain.robinhood.com";
  const EXP = "https://robinhoodchain.blockscout.com";
  const SOURCIFY = "https://sourcify.dev/server/v2/contract/4663/";
  const SWAP = "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67";
  // WETH/USDG pools (token0 WETH, 18 decimals; token1 USDG, 6 decimals). Each is checked on load.
  const POOLS = ["0x52e65b17fb6e5ba00ed806f37afcd2daa50271ca", "0x7615926023bb149f36095645c2a81dc367d39750", "0xfae65eaa11943f45e83d5b45dc7a7c801c51bfb0", "0x16679e2ac1a798865ecf1c1639e67693ddb1c220"];
  const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73", USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
  const TF = { "15s": 15, "1m": 60, "5m": 300 };
  const CANDLES = 60, CHUNK = 9000, POLL_MS = 3000;
  const $ = (id) => document.getElementById(id);
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const short = (a) => a.slice(0, 6) + "…" + a.slice(-4);
  const hexN = (h) => parseInt(h, 16);
  const signed = (w) => { const v = BigInt("0x" + w); return v >= 1n << 255n ? v - (1n << 256n) : v; };
  const fmtP = (p) => p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtK = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : n.toFixed(0));
  const ago = (s) => (s < 60 ? Math.max(0, Math.round(s)) + "s" : s < 3600 ? Math.round(s / 60) + "m" : (s / 3600).toFixed(1) + "h");

  let rid = 0;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function rpc(method, params, tries = 3) {
    for (let k = 0; ; k++) {
      try {
        const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++rid, method, params }) });
        if (!r.ok) throw new Error("RPC answered " + r.status);
        const j = await r.json();
        if (j.error) throw Object.assign(new Error(j.error.message || "RPC error"), { final: true });
        return j.result;
      } catch (e) {
        if (e.final || k >= tries - 1) throw e;
        await wait(800 * (k + 1) + Math.random() * 400); // the public RPC rate-limits bursts; back off and try again
      }
    }
  }
  const call = (to, data) => rpc("eth_call", [{ to, data }, "latest"]).catch(() => null);

  let tf = "1m", head = 0, secPerBlock = 0.107, gasWei = 0n, pools = POOLS.slice();
  let trades = [];      // { b, i, p (USDG per ETH), eth, usd, buy, to, tx }
  let lastPolled = 0, loading = false, failures = 0, feedTab = "trades";
  let account = window.lwAccount || null;
  const blocks = [];

  async function basics() {
    const [h, g] = await Promise.all([rpc("eth_blockNumber", []), rpc("eth_gasPrice", [])]);
    head = hexN(h); gasWei = BigInt(g);
    if (basics.done) return;
    const [b1, b0] = await Promise.all([rpc("eth_getBlockByNumber", ["0x" + head.toString(16), false]), rpc("eth_getBlockByNumber", ["0x" + (head - 20000).toString(16), false])]);
    const dt = hexN(b1.timestamp) - hexN(b0.timestamp);
    if (dt > 0) secPerBlock = dt / 20000;
    const ok = await Promise.all(POOLS.map(async (p) => { const [t0, t1] = await Promise.all([call(p, "0x0dfe1681"), call(p, "0xd21220a7")]); return !!t0 && !!t1 && "0x" + t0.slice(26) === WETH && "0x" + t1.slice(26) === USDG; }));
    pools = POOLS.filter((_, k) => ok[k]);
    if (!pools.length) throw new Error("no WETH/USDG pool answered");
    basics.done = true;
  }
  const span = () => Math.ceil((TF[tf] * CANDLES) / secPerBlock);

  function decode(l) {
    const d = l.data.slice(2);
    const a0 = signed(d.slice(0, 64)), a1 = signed(d.slice(64, 128)), q = Number(BigInt("0x" + d.slice(128, 192))) / 2 ** 96;
    return { b: hexN(l.blockNumber), i: hexN(l.logIndex), p: q * q * 1e12, eth: Math.abs(Number(a0)) / 1e18, usd: Math.abs(Number(a1)) / 1e6, buy: a0 < 0n, to: "0x" + l.topics[2].slice(26), tx: l.transactionHash };
  }
  async function getSwaps(from, to, progress) {
    const ranges = [];
    for (let a = from; a <= to; a += CHUNK) ranges.push([a, Math.min(to, a + CHUNK - 1)]);
    const out = []; let done = 0;
    for (let k = 0; k < ranges.length; k += 2) {
      const part = await Promise.all(ranges.slice(k, k + 2).map(([a, b]) => rpc("eth_getLogs", [{ address: pools, topics: [SWAP], fromBlock: "0x" + a.toString(16), toBlock: "0x" + b.toString(16) }])));
      for (const r of part) for (const l of r) out.push(decode(l));
      done += part.length; if (progress) progress(done, ranges.length);
    }
    return out.sort((x, y) => x.b - y.b || x.i - y.i);
  }

  async function load() {
    if (loading) return; loading = true;
    const ld = $("tm-load"); ld.hidden = false; ld.textContent = "Reading ETH/USDG swaps from Robinhood Chain…";
    try {
      await basics();
      trades = await getSwaps(head - span() + 1, head, (d, n) => { if (n > 1) ld.textContent = "Reading ETH/USDG swaps from Robinhood Chain… " + Math.round((d / n) * 100) + "%"; });
      lastPolled = head;
      if (!blocks.length) {
        const recent = await Promise.all(Array.from({ length: 8 }, (_, k) => rpc("eth_getBlockByNumber", ["0x" + (head - k * 10).toString(16), false]).catch(() => null)));
        for (const b of recent) if (b) blocks.push({ n: hexN(b.number), txs: b.transactions.length, t: hexN(b.timestamp) });
      }
      ld.hidden = true; renderAll(true); setLive(true);
    } catch (e) {
      ld.textContent = "Could not read the chain (" + e.message + "). Retrying…"; setLive(false);
      setTimeout(() => { loading = false; load(); }, 5000); return;
    }
    loading = false;
  }

  async function poll() {
    if (loading || document.hidden || !lastPolled) return;
    try {
      const h = hexN(await rpc("eth_blockNumber", []));
      if (h > lastPolled) {
        const fresh = await getSwaps(lastPolled + 1, h);
        head = h; lastPolled = h; trades.push(...fresh);
        const cut = head - span() + 1;
        if (trades.length && trades[0].b < cut) trades = trades.filter((t) => t.b >= cut);
        const blk = await rpc("eth_getBlockByNumber", ["0x" + h.toString(16), false]);
        blocks.unshift({ n: h, txs: blk.transactions.length, t: hexN(blk.timestamp) }); blocks.length = Math.min(blocks.length, 40);
        if (Math.random() < 0.2) gasWei = BigInt(await rpc("eth_gasPrice", []));
        renderAll(false, fresh.length);
      }
      failures = 0; setLive(true);
    } catch { if (++failures > 2) setLive(false); }
  }
  function setLive(ok) { const el = $("tm-live"); el.classList.toggle("off", !ok); el.lastChild.textContent = ok ? " Live · mainnet" : " Reconnecting"; }

  // ---- candles ----
  let candles = [];
  function build() {
    const sp = span(), from = head - sp + 1, size = sp / CANDLES;
    candles = Array.from({ length: CANDLES }, (_, k) => ({ from: Math.round(from + k * size), o: null, h: -Infinity, l: Infinity, c: null, v: 0, n: 0, empty: false }));
    for (const t of trades) {
      const c = candles[Math.min(CANDLES - 1, Math.max(0, Math.floor((t.b - from) / size)))];
      if (c.o === null) c.o = t.p; c.c = t.p; c.h = Math.max(c.h, t.p); c.l = Math.min(c.l, t.p); c.v += t.usd; c.n++;
    }
    let prev = trades.length ? trades[0].p : null;
    for (const c of candles) { if (c.o === null) { c.o = c.c = c.h = c.l = prev; c.empty = true; } prev = c.c; }
  }

  const cv = $("tm-cv"), cx = cv.getContext("2d");
  let hover = -1;
  function draw() {
    const r = cv.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
    cv.width = Math.max(1, r.width * d); cv.height = Math.max(1, r.height * d); cx.setTransform(d, 0, 0, d, 0, 0);
    const W = r.width, H = r.height, padL = 10, padR = 72, top = 36, bot = H - 26, volTop = bot - (bot - top) * 0.18, priceBot = volTop - 12;
    const css = getComputedStyle(document.documentElement), col = (v, fb) => css.getPropertyValue(v).trim() || fb;
    const up = col("--lamp", "#34c77b"), down = col("--danger", "#ef5a4c"), mist = col("--mist", "#a4a5a5"), stone = col("--stone", "#232427"), fog = col("--fog", "#ebecec");
    const mono = col("--mono", "monospace");
    cx.clearRect(0, 0, W, H);
    if (!candles.some((c) => c.o !== null)) return;
    const real = candles.filter((c) => c.o !== null);
    let hi = Math.max(...real.map((c) => c.h)), lo = Math.min(...real.map((c) => c.l));
    if (hi - lo < 0.5) { hi += 0.25; lo -= 0.25; }
    const pad = (hi - lo) * 0.08; hi += pad; lo -= pad;
    const y = (p) => top + ((hi - p) / (hi - lo)) * (priceBot - top);
    const maxV = Math.max(1, ...candles.map((c) => c.v)), bw = (W - padL - padR) / CANDLES;
    cx.font = "11px " + mono; cx.lineWidth = 1;
    for (let g = 0; g <= 5; g++) {
      const p = hi - ((hi - lo) * g) / 5, yy = y(p);
      cx.strokeStyle = stone; cx.beginPath(); cx.moveTo(padL, yy); cx.lineTo(W - padR, yy); cx.stroke();
      cx.fillStyle = mist; cx.textAlign = "left"; cx.fillText(fmtP(p), W - padR + 8, yy + 4);
    }
    candles.forEach((c, k) => {
      if (c.o === null) return;
      const x = padL + k * bw + bw / 2, green = c.c >= c.o, color = c.empty ? mist + "55" : green ? up : down;
      cx.strokeStyle = color; cx.beginPath(); cx.moveTo(Math.round(x) + 0.5, y(c.h)); cx.lineTo(Math.round(x) + 0.5, y(c.l)); cx.stroke();
      const yo = y(c.o), yc = y(c.c);
      cx.fillStyle = color; cx.fillRect(x - bw * 0.34, Math.min(yo, yc), Math.max(1, bw * 0.68), Math.max(1, Math.abs(yc - yo)));
      const vh = ((bot - volTop) * c.v) / maxV;
      cx.fillStyle = (green ? up : down) + (k === hover ? "cc" : "4d"); cx.fillRect(x - bw * 0.34, bot - vh, Math.max(1, bw * 0.68), vh);
    });
    const lastC = candles[CANDLES - 1];
    if (lastC.c) {
      const yl = y(lastC.c), green = lastC.c >= lastC.o;
      cx.strokeStyle = (green ? up : down) + "aa"; cx.setLineDash([3, 3]); cx.beginPath(); cx.moveTo(padL, yl); cx.lineTo(W - padR, yl); cx.stroke(); cx.setLineDash([]);
      cx.fillStyle = green ? up : down; cx.fillRect(W - padR + 2, yl - 9, padR - 4, 18);
      cx.fillStyle = "#0b0c0e"; cx.fillText(fmtP(lastC.c), W - padR + 7, yl + 4);
    }
    cx.fillStyle = mist; cx.textAlign = "center";
    for (let k = 0; k < CANDLES; k += 12) cx.fillText("-" + ago((head - candles[k].from) * secPerBlock), padL + k * bw + bw / 2, H - 8);
    cx.fillText("now", W - padR - bw / 2, H - 8);
    if (hover >= 0) {
      const x = padL + hover * bw + bw / 2;
      cx.strokeStyle = fog + "44"; cx.setLineDash([4, 4]); cx.beginPath(); cx.moveTo(x, top); cx.lineTo(x, bot); cx.stroke(); cx.setLineDash([]);
    }
    const c = candles[hover >= 0 ? hover : CANDLES - 1], g = c.c >= c.o ? "u" : "d";
    for (const [id, v] of [["tm-o", c.o], ["tm-h", c.h], ["tm-l", c.l], ["tm-c", c.c]]) { const e = $(id); e.textContent = fmtP(v); e.className = g; }
    $("tm-v").textContent = fmtK(c.v) + " USDG"; $("tm-n").textContent = c.n + " swap" + (c.n === 1 ? "" : "s");
    cv._geo = { padL, bw };
  }
  cv.addEventListener("mousemove", (e) => {
    const g = cv._geo; if (!g) return;
    const k = Math.floor((e.clientX - cv.getBoundingClientRect().left - g.padL) / g.bw), h2 = k >= 0 && k < CANDLES ? k : -1;
    if (h2 !== hover) { hover = h2; draw(); }
  });
  cv.addEventListener("mouseleave", () => { hover = -1; draw(); });

  function renderStats() {
    const real = candles.filter((c) => !c.empty);
    const last = trades.length ? trades[trades.length - 1].p : null, first = trades.length ? trades[0].p : null;
    const ch = last && first ? last - first : 0, pct = first ? (ch / first) * 100 : 0;
    const big = $("tm-big"); big.textContent = last ? fmtP(last) : "–"; big.className = "tm-big " + (ch >= 0 ? "u" : "d");
    const chg = $("tm-s-chg"); chg.textContent = (ch >= 0 ? "+" : "") + fmtP(ch) + " / " + (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%"; chg.className = ch >= 0 ? "u" : "d";
    $("tm-s-hi").textContent = real.length ? fmtP(Math.max(...real.map((c) => c.h))) : "–";
    $("tm-s-lo").textContent = real.length ? fmtP(Math.min(...real.map((c) => c.l))) : "–";
    $("tm-s-vol").textContent = fmtK(trades.reduce((a, t) => a + t.usd, 0)) + " USDG";
    $("tm-s-n").textContent = trades.length.toLocaleString("en-US");
    $("tm-s-block").textContent = head.toLocaleString("en-US");
    $("tm-s-gas").textContent = (Number(gasWei) / 1e9).toFixed(3) + " gwei";
    $("tm-s-win").textContent = CANDLES + " × " + tf;
    $("tm-s-pools").textContent = pools.length + " pool" + (pools.length === 1 ? "" : "s");
    const fee = $("tm-fee"); if (fee) fee.textContent = gasWei ? (Number(gasWei * 65000n) / 1e18).toFixed(8) + " ETH" : "–";
  }

  function row(href, cells, isNew) {
    const el = document.createElement("a");
    el.className = "tm-row" + (isNew && !still ? " new" : ""); el.href = href; el.target = "_blank"; el.rel = "noopener";
    for (const [c, t] of cells) { const s = document.createElement("span"); s.className = c; s.textContent = t; el.append(s); }
    return el;
  }
  function renderFeed(all, freshN = 0) {
    const box = $("tm-feed"), fh = $("tm-fh");
    box.innerHTML = "";
    if (feedTab === "trades") {
      fh.innerHTML = "<span>Price</span><span>Size (ETH)</span><span style='text-align:right'>Age</span>";
      const last = trades.slice(-40).reverse();
      last.forEach((t, k) => box.append(row(EXP + "/tx/" + t.tx, [[t.buy ? "a" : "s", fmtP(t.p)], ["p", t.eth.toFixed(4)], ["t", ago((head - t.b) * secPerBlock)]], !all && k < freshN)));
      if (!last.length) box.innerHTML = "<div class='tm-empty'>No swaps in this window.</div>";
    } else {
      fh.innerHTML = "<span>Block</span><span>Transactions</span><span style='text-align:right'>Age</span>";
      const now = Date.now() / 1000;
      blocks.forEach((b, k) => box.append(row(EXP + "/block/" + b.n, [["a", b.n.toLocaleString("en-US")], ["p", b.txs + " tx"], ["t", ago(now - b.t)]], k === 0 && !all)));
    }
  }
  document.querySelectorAll("[data-feed]").forEach((b) => b.addEventListener("click", () => {
    feedTab = b.dataset.feed;
    document.querySelectorAll("[data-feed]").forEach((x) => x.setAttribute("aria-selected", x === b));
    renderFeed(true);
  }));
  document.querySelectorAll("[data-tf]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.tf === tf) return;
    tf = b.dataset.tf;
    document.querySelectorAll("[data-tf]").forEach((x) => x.setAttribute("aria-selected", x === b));
    load();
  }));
  function renderAll(all, freshN) { build(); draw(); renderStats(); renderFeed(all, freshN); renderMine(); }

  // ---- actions: Shield / Send / Prove are previews; Check is live ----
  document.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("[data-act]").forEach((x) => x.setAttribute("aria-pressed", x === b));
    document.querySelectorAll("[data-actpane]").forEach((p) => (p.hidden = p.dataset.actpane !== b.dataset.act));
  }));
  function str(hex) {
    if (!hex || hex === "0x") return null;
    const b = hex.slice(2);
    try {
      if (b.length === 64) return decodeURIComponent(b.replace(/(00)+$/, "").replace(/../g, "%$&")) || null;
      const len = parseInt(b.slice(64, 128), 16); return decodeURIComponent(b.slice(128, 128 + len * 2).replace(/../g, "%$&"));
    } catch { return null; }
  }
  const units = (v, d, dp) => { const s = v.toString().padStart(d + 1, "0"); return BigInt(s.slice(0, -d) || "0").toLocaleString("en-US") + (dp ? "." + s.slice(-d).slice(0, dp) : ""); };
  const form = $("tm-checkform");
  if (form) form.addEventListener("submit", async (e) => {
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
    const box = $("tm-mine"); if (!box) return;
    if (!account) {
      if (box.dataset.state === "none") return; box.dataset.state = "none"; box.innerHTML = "";
      const d = document.createElement("div"); d.className = "tm-empty";
      d.innerHTML = "<p style='margin:0'>Connect a wallet to see your public ETH, USDG and WETH balances and your ETH/USDG swaps in this window.</p>";
      const b = document.createElement("button"); b.className = "tm-btn"; b.type = "button"; b.textContent = "Connect wallet";
      b.addEventListener("click", () => document.getElementById("wallet")?.click()); d.append(b); box.append(d); return;
    }
    if (renderMine.busy) return; renderMine.busy = true;
    const me = account.toLowerCase(), pad = me.slice(2).padStart(64, "0");
    try {
      const [eth, usdg, weth] = await Promise.all([rpc("eth_getBalance", [account, "latest"]), call(USDG, "0x70a08231" + pad), call(WETH, "0x70a08231" + pad)]);
      const mine = trades.filter((t) => t.to === me).slice(-20).reverse();
      box.dataset.state = "acct"; box.innerHTML = "";
      const wal = document.createElement("div"); wal.className = "tm-wal";
      for (const [k, v] of [["ETH", units(BigInt(eth), 18, 4)], ["USDG", units(BigInt(usdg || "0x0"), 6, 2)], ["WETH", units(BigInt(weth || "0x0"), 18, 4)]]) { const c = document.createElement("div"); const s = document.createElement("span"); s.textContent = k + " · public"; const b = document.createElement("b"); b.textContent = v; c.append(s, b); wal.append(c); }
      box.append(wal);
      const p = document.createElement("p"); p.className = "tm-small";
      p.textContent = short(account) + " · " + (mine.length ? mine.length + " swap" + (mine.length === 1 ? "" : "s") + " paid out to you in this window." : "no ETH/USDG swaps paid out to you in this window.") + " Anyone can see your balances and swaps. That is what Lumwatch is being built to change.";
      box.append(p);
      mine.forEach((t) => box.append(row(EXP + "/tx/" + t.tx, [[t.buy ? "a" : "s", (t.buy ? "bought " : "sold ") + t.eth.toFixed(4) + " ETH"], ["p", "at " + fmtP(t.p)], ["t", ago((head - t.b) * secPerBlock)]])));
    } catch (e) { box.textContent = "Could not read your balances: " + e.message; }
    renderMine.busy = false;
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
