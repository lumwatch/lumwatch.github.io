// Lumwatch site script. Every block checks that its elements exist, so one file serves every page.
(() => {
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const root = getComputedStyle(document.documentElement);
  const COL = { ok: root.getPropertyValue("--safe").trim(), warn: root.getPropertyValue("--warn").trim(), bad: root.getPropertyValue("--danger").trim(), lamp: root.getPropertyValue("--lamp").trim() };
  let beam = COL.lamp;
  let redraw = () => {};
  const hexA = (h, a) => { const n = parseInt(h.replace("#", ""), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${Math.max(0, a).toFixed(3)})`; };

  // ---- curtain (home only) ----
  const curtain = document.getElementById("curtain");
  if (curtain) { let seen = false; try { seen = sessionStorage.getItem("lw-curtain") === "1"; sessionStorage.setItem("lw-curtain", "1"); } catch {} setTimeout(() => curtain.classList.add("gone"), still || seen ? 0 : 1500); curtain.addEventListener("click", () => curtain.classList.add("gone")); }

  // ---- nav dropdowns + burger ----
  const dds = [...document.querySelectorAll(".dd")];
  dds.forEach((d) => d.querySelector("button").addEventListener("click", (e) => { e.stopPropagation(); const o = !d.classList.contains("open"); dds.forEach((x) => { x.classList.remove("open"); x.querySelector("button").setAttribute("aria-expanded", "false"); }); if (o) { d.classList.add("open"); d.querySelector("button").setAttribute("aria-expanded", "true"); } }));
  document.addEventListener("click", () => dds.forEach((x) => x.classList.remove("open")));
  const nav = document.getElementById("nav"), burger = document.getElementById("burger");
  if (burger) burger.addEventListener("click", (e) => { e.stopPropagation(); nav.classList.toggle("open"); burger.setAttribute("aria-expanded", nav.classList.contains("open")); });

  // ---- connect wallet (Robinhood Chain, chain id 4663) ----
  const CHAIN = { chainId: "0x1237", chainName: "Robinhood Chain", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"], blockExplorerUrls: ["https://robinhoodchain.blockscout.com"] };
  const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
  const wbtn = document.getElementById("wallet");
  const shortA = (a) => a.slice(0, 6) + "…" + a.slice(-4);
  let account = null;
  async function showBalances() {
    const box = document.getElementById("mywallet"); if (!box || !account || !window.ethereum) return;
    try {
      const pad = account.slice(2).toLowerCase().padStart(64, "0");
      const [eth, usdg] = await Promise.all([window.ethereum.request({ method: "eth_getBalance", params: [account, "latest"] }), window.ethereum.request({ method: "eth_call", params: [{ to: USDG, data: "0x70a08231" + pad }, "latest"] })]);
      const f = (v, d, k) => { const s = BigInt(v).toString().padStart(d + 1, "0"); return Number(s.slice(0, -d)).toLocaleString("en-US") + "." + s.slice(-d).slice(0, k); };
      box.hidden = false; box.querySelector("[data-a]").textContent = shortA(account);
      box.querySelector("[data-eth]").textContent = f(eth, 18, 4); box.querySelector("[data-usdg]").textContent = f(usdg, 6, 2);
    } catch (e) { box.hidden = false; box.querySelector("[data-a]").textContent = shortA(account) + " · switch to Robinhood Chain to read balances"; }
  }
  function setAccount(a) {
    account = a || null;
    if (wbtn) { wbtn.textContent = account ? shortA(account) : "Connect wallet"; wbtn.classList.toggle("on", !!account); }
    showBalances();
  }
  async function connect() {
    if (!window.ethereum) { if (wbtn) { wbtn.textContent = "No wallet found"; setTimeout(() => setAccount(null), 2000); } return; }
    try {
      const [a] = await window.ethereum.request({ method: "eth_requestAccounts" });
      try { await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN.chainId }] }); }
      catch (e) { if (e && e.code === 4902) await window.ethereum.request({ method: "wallet_addEthereumChain", params: [CHAIN] }); }
      setAccount(a);
    } catch { setAccount(null); }
  }
  if (wbtn) wbtn.addEventListener("click", () => (account ? window.open("https://robinhoodchain.blockscout.com/address/" + account, "_blank", "noopener") : connect()));
  document.querySelectorAll("[data-connect]").forEach((b) => b.addEventListener("click", connect));
  if (window.ethereum) {
    window.ethereum.request({ method: "eth_accounts" }).then((a) => setAccount(a && a[0])).catch(() => {});
    window.ethereum.on?.("accountsChanged", (a) => setAccount(a && a[0]));
    window.ethereum.on?.("chainChanged", () => showBalances());
  }

  // ---- the voyage: pinned scene, the lighthouse grows as you sail in ----
  const cv = document.getElementById("sky");
  if (cv) {
  const cx = cv.getContext("2d"), voyage = document.querySelector(".voyage");
  let W = 0, H = 0, stars = [];
  function size() {
    const r = cv.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
    W = r.width; H = r.height; cv.width = W * d; cv.height = H * d; cx.setTransform(d, 0, 0, d, 0, 0);
    stars = Array.from({ length: Math.round(W * H / 4200) }, () => ({ x: Math.random() * W, y: Math.random() * H * .6, r: Math.random() * 1.3 + .2, p: Math.random() * 6 }));
  }
  const prog = () => { const r = voyage.getBoundingClientRect(); return Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - innerHeight))); };
  const phases = [...document.querySelectorAll(".phase")], dots = [...document.querySelectorAll(".depth span")];
  let lastPhase = -1;
  function draw(t) {
    const p = still ? 0 : prog();
    const ph = p < .33 ? 0 : p < .7 ? 1 : 2;
    if (ph !== lastPhase) { phases.forEach((el, i) => el.classList.toggle("off", i !== ph)); dots.forEach((d, i) => d.classList.toggle("on", i === ph)); lastPhase = ph; }
    const horizon = H * (.64 + p * .06);
    const g = cx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#050607"); g.addColorStop(horizon / H, "#121316"); g.addColorStop(Math.min(1, horizon / H + .002), "#0e0f11"); g.addColorStop(1, "#0b0c0e");
    cx.fillStyle = g; cx.fillRect(0, 0, W, H);
    for (const s of stars) { cx.globalAlpha = .25 + .35 * Math.sin(t / 900 + s.p); cx.fillStyle = "#ebecec"; cx.beginPath(); cx.arc(s.x, s.y - p * 80, s.r * .8, 0, 7); cx.fill(); }
    cx.globalAlpha = 1;
    // moon
    const sun = cx.createRadialGradient(W * .2, H * .26 - p * 60, 10, W * .2, H * .26 - p * 60, 180); sun.addColorStop(0, "rgba(235,236,236,.06)"); sun.addColorStop(1, "rgba(235,236,236,0)"); cx.fillStyle = sun; cx.fillRect(0, 0, W, H);
    // lighthouse: grows and centres as you sail in
    const narrow = W < 700; const scale = narrow ? .55 + p * .25 : 1 + p * 1.1, lx = W * (narrow ? .9 : .88 - p * .06), towerH = Math.min(280, H * .42) * scale; cx.globalAlpha = narrow ? .55 : 1;
    const top = horizon - towerH, wB = 30 * scale, wT = 16 * scale;
    const a = still ? -0.6 : (t / 8000) * Math.PI * 2, face = (Math.cos(a) + 1) / 2;
    const len = Math.max(W, H) * 1.5, spread = .08 + p * .04, dir = Math.sin(a) >= 0 ? 1 : -1, ang = Math.PI + (Math.cos(a) * .95) * dir;
    const by = top + 18 * scale, gr = cx.createRadialGradient(lx, by, 4, lx, by, len);
    gr.addColorStop(0, hexA(beam, .32 * (.3 + .7 * face))); gr.addColorStop(1, hexA(beam, 0));
    cx.fillStyle = gr; cx.beginPath(); cx.moveTo(lx, by); cx.arc(lx, by, len, ang - spread, ang + spread); cx.closePath(); cx.fill();
    // water lines + reflection
    for (let k = 0; k < 18; k++) { const y = horizon + 6 + k * k * 1.6; if (y > H) break; cx.strokeStyle = `rgba(235,236,236,${.06 - k * .003})`; cx.beginPath(); for (let x = 0; x <= W; x += 24) cx.lineTo(x, y + Math.sin(x / 60 + t / 700 + k) * (1 + k * .2)); cx.stroke(); }
    const rg = cx.createLinearGradient(lx, horizon, lx, H); rg.addColorStop(0, hexA(beam, .18 * face + .04)); rg.addColorStop(1, hexA(beam, 0));
    cx.fillStyle = rg; cx.fillRect(lx - 16 * scale, horizon, 32 * scale, H - horizon);
    cx.fillStyle = "#ebecec"; cx.strokeStyle = "#0b0c0e"; cx.lineWidth = 1; cx.beginPath(); cx.moveTo(lx - wB, horizon); cx.lineTo(lx - wT, top + 30 * scale); cx.lineTo(lx + wT, top + 30 * scale); cx.lineTo(lx + wB, horizon); cx.fill(); cx.stroke();
    cx.fillStyle = "#2a2b2f"; for (let k = 1; k < 4; k++) { const yy = horizon - k * (horizon - top - 30 * scale) / 4, ww = wB - (wB - wT) * k / 4; cx.fillRect(lx - ww, yy, ww * 2, 8 * scale); }
    cx.fillStyle = beam; cx.shadowColor = beam; cx.shadowBlur = 30 * (.4 + face); cx.fillRect(lx - 11 * scale, top + 10 * scale, 22 * scale, 18 * scale); cx.shadowBlur = 0;
    cx.fillStyle = "#ebecec"; cx.beginPath(); cx.moveTo(lx - 15 * scale, top + 10 * scale); cx.lineTo(lx, top - 6 * scale); cx.lineTo(lx + 15 * scale, top + 10 * scale); cx.fill();
    cx.globalAlpha = 1;
    // the quay with three lit buildings appears in the last phase
    const q = Math.max(0, (p - .6) / .4);
    if (q > 0) { cx.globalAlpha = q; cx.fillStyle = "#17181a"; cx.fillRect(0, horizon - 8, W * .55, 8);
      [[.08, 60, 40], [.22, 80, 54], [.38, 70, 46]].forEach(([fx, bh, bw]) => { const x = W * fx; cx.fillStyle = "#17181a"; cx.strokeStyle = "#2a2b2f"; cx.lineWidth = 1.5; cx.strokeRect(x, horizon - 8 - bh, bw, bh); cx.fillRect(x, horizon - 8 - bh, bw, bh); cx.fillStyle = hexA(COL.lamp, .8); for (let r = 0; r < 3; r++) cx.fillRect(x + 8 + r * (bw - 16) / 3, horizon - bh + 4, 6, 8); });
      cx.globalAlpha = 1; }
    if (!still) requestAnimationFrame(draw);
  }
  size(); addEventListener("resize", size); requestAnimationFrame(draw); redraw = () => requestAnimationFrame(draw);
  }

  // ---- app window views (hash-free so the page stays one link) ----
  const tabs = [...document.querySelectorAll(".side button")];
  function show(v) {
    if (!tabs.length) return;
    tabs.forEach((b) => b.setAttribute("aria-selected", b.dataset.view === v ? "true" : "false"));
    document.querySelectorAll(".view").forEach((el) => (el.hidden = el.id !== "v-" + v));
    const au = document.getElementById("appurl"); if (au) au.textContent = "lumwatch.app/app · " + ({ overview: "overview", scan: "token check", market: "private send", granary: "shield", watch: "clean proof" })[v];
    if (["market", "granary", "watch"].includes(v)) runFlow(v);
  }
  tabs.forEach((b) => b.addEventListener("click", () => { show(b.dataset.view); try { history.replaceState(null, "", "#" + b.dataset.view); } catch {} }));
  const VIEWS = { overview: 1, shield: "granary", send: "market", prove: "watch", check: "scan" };
  const fromHash = () => { const h = location.hash.slice(1); const v = VIEWS[h] === 1 ? h : VIEWS[h]; if (v) show(v); };
  if (tabs.length) { fromHash(); addEventListener("hashchange", fromHash); }

  // ---- pipelines: queued → working → done, one step at a time ----
  const LABELS = { market: [["building proof…", "proved · 1.4 s"], ["submitting…", "gas paid"], ["settling…", "delivered"], ["sealing…", "1,050 USDG private"]],
    granary: [["signing…", "approved"], ["sealing…", "note built"], ["adding…", "leaf 4,821"], ["updating…", "+1,000 USDG private"]],
    watch: [["loading…", "list · Nov 2026"], ["building proof…", "proved · 2.1 s"], ["packing…", "proof ready"], ["verifying…", "valid on-chain"]] };
  const DONE = { market: "Sent · nothing on-chain links you to 0x9f3c…41e7 (example)", granary: "Shielded · +1,000 USDG in your private balance (example)", watch: "Clean proof ready · not in the block list, history still private (example)" };
  const timers = {};
  function runFlow(name) {
    clearTimeout(timers[name]);
    const steps = [...document.querySelectorAll(`[data-flow="${name}"] .step`)], res = document.getElementById("r-" + name);
    if (!steps.length || !res) return;
    steps.forEach((s) => { s.className = "step"; s.querySelector(".st").textContent = "queued"; });
    res.className = "result"; res.textContent = "Running the example…";
    let i = 0;
    const tick = () => {
      if (i > 0) { const d = steps[i - 1]; d.className = "step done"; d.querySelector(".st").textContent = LABELS[name][i - 1][1]; }
      if (i === steps.length) { res.className = "result ok"; res.textContent = DONE[name]; timers[name] = setTimeout(() => runFlow(name), 6000); return; }
      const s = steps[i]; s.className = "step run"; s.querySelector(".st").textContent = LABELS[name][i][0]; i++;
      timers[name] = setTimeout(tick, still ? 0 : 1100);
    };
    tick();
  }
  document.querySelectorAll("[data-run]").forEach((b) => b.addEventListener("click", () => runFlow(b.dataset.run)));

  document.querySelectorAll("[data-autorun]").forEach((el) => runFlow(el.dataset.autorun));
  // ---- overview: an example watch log that keeps moving ----
  const feed = document.getElementById("feed"), bars = document.getElementById("bars");
  if (feed && bars) {
  const SAMPLE = [["ok", "SHIELDED", "+500 USDG into the pool"], ["ok", "SENT", "120 USDG · relayer paid gas"], ["ok", "PROOF", "clean proof shared"], ["ok", "SENT", "45 USDG · relayer paid gas"], ["ok", "SHIELDED", "+0.20 ETH into the pool"], ["ok", "CHANGE", "fresh note · 335 USDG"]];
  let fi = 0;
  function pushFeed() {
    const [c, v, why] = SAMPLE[fi++ % SAMPLE.length], d = document.createElement("div"), now = new Date();
    d.innerHTML = `<span class="t"></span><span></span><span class="${c}"></span>`;
    d.children[0].textContent = now.toTimeString().slice(0, 8); d.children[1].textContent = why; d.children[2].textContent = v;
    feed.prepend(d); while (feed.children.length > 6) feed.lastChild.remove();
  }
  for (let k = 0; k < 6; k++) pushFeed();
  if (!still) setInterval(pushFeed, 2600);
  for (let k = 0; k < 24; k++) { const b = document.createElement("i"); b.style.height = (20 + Math.round(70 * Math.abs(Math.sin(k / 3.2)) + (k % 5) * 3)) + "%"; bars.append(b); }
  if (!still) setInterval(() => [...bars.children].forEach((b) => (b.style.height = Math.max(8, Math.min(100, parseFloat(b.style.height) + (Math.random() * 20 - 10))) + "%")), 3000);
  }

  // ---- building scenes ----
  const scenes = [...document.querySelectorAll("canvas[data-scene]")];
  function sceneSize(c) { const r = c.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2); c.width = r.width * d; c.height = r.height * d; const x = c.getContext("2d"); x.setTransform(d, 0, 0, d, 0, 0); c._w = r.width; c._h = r.height; }
  scenes.forEach(sceneSize); addEventListener("resize", () => scenes.forEach(sceneSize));
  const grains = Array.from({ length: 40 }, () => ({ x: Math.random(), y: Math.random(), v: .4 + Math.random() * .6 }));
  function scene(t) {
    for (const c of scenes) {
      const x = c.getContext("2d"), w = c._w, h = c._h; x.clearRect(0, 0, w, h);
      x.fillStyle = "#0e0f11"; x.fillRect(0, 0, w, h);
      if (c.dataset.scene === "light") {
        const rows = 6; for (let r = 0; r < rows; r++) { const y = 26 + r * 26; x.fillStyle = "#1b1b1d"; x.fillRect(30, y, w - 60, 16); }
        const sx = 30 + ((t / 18) % (w - 60)); const gg = x.createLinearGradient(sx - 60, 0, sx + 10, 0); gg.addColorStop(0, "rgba(52,199,123,0)"); gg.addColorStop(1, "rgba(52,199,123,.3)");
        x.fillStyle = gg; x.fillRect(sx - 60, 18, 70, rows * 26); x.fillStyle = COL.lamp; x.fillRect(sx, 18, 2, rows * 26);
        for (let r = 0; r < rows; r++) { const y = 26 + r * 26; if (sx > w - 70) { x.fillStyle = [COL.ok, COL.ok, COL.warn, COL.ok, COL.warn, COL.ok][r]; x.beginPath(); x.arc(w - 46, y + 8, 5, 0, 7); x.fill(); } }
      } else if (c.dataset.scene === "market") {
        const n = 4, gap = (w - 60) / (n - 1); for (let i = 0; i < n; i++) { const cxp = 30 + i * gap; x.fillStyle = "#1b1b1d"; x.fillRect(cxp - 22, h - 70, 44, 40); x.fillStyle = "#2a2b2f"; x.beginPath(); x.moveTo(cxp - 28, h - 70); x.lineTo(cxp, h - 92); x.lineTo(cxp + 28, h - 70); x.fill(); }
        const ph = (t / 1100) % n, i = Math.floor(ph), f = ph - i, from = 30 + i * gap, to = 30 + Math.min(n - 1, i + 1) * gap;
        const px = i < n - 1 ? from + (to - from) * f : to, py = h - 110 - Math.sin(f * Math.PI) * 30;
        x.fillStyle = COL.lamp; x.shadowColor = COL.lamp; x.shadowBlur = 16; x.beginPath(); x.arc(px, py, 8, 0, 7); x.fill(); x.shadowBlur = 0;
        x.fillStyle = "#6e7074"; x.font = "11px JetBrains Mono, monospace"; ["prove", "relay", "deliver", "change"].forEach((l, k) => { x.textAlign = "center"; x.fillText(l, 30 + k * gap, h - 14); });
      } else {
        const sw = Math.min(110, w * .35), sx0 = w / 2 - sw / 2, top = 30, bot = h - 20;
        const lvl = ((t / 60) % 100) / 100, fy = bot - (bot - top - 20) * lvl;
        x.fillStyle = "#1b1b1d"; x.fillRect(sx0, top + 20, sw, bot - top - 20); x.beginPath(); x.moveTo(sx0 - 6, top + 20); x.lineTo(w / 2, top - 4); x.lineTo(sx0 + sw + 6, top + 20); x.fill();
        x.fillStyle = "rgba(52,199,123,.7)"; x.fillRect(sx0 + 4, fy, sw - 8, bot - fy);
        for (const gpt of grains) { gpt.y += gpt.v * .012; if (gpt.y > 1) { gpt.y = 0; gpt.x = Math.random(); } const gx = sx0 + 8 + gpt.x * (sw - 16), gy = top + 20 + gpt.y * (fy - top - 20); x.fillStyle = COL.lamp; x.fillRect(gx, gy, 3, 3); }
        x.fillStyle = "#6e7074"; x.font = "11px JetBrains Mono, monospace"; x.textAlign = "left"; x.fillText(`pool · ${Math.round(lvl * 4821)} notes`, 12, 18);
      }
    }
    if (!still) requestAnimationFrame(scene);
  }
  if (scenes.length) requestAnimationFrame(scene);

  // ---- terminal with command tabs (Blackpool-style) ----
  const SCRIPTS = {
    shield: [["c", "# move USDG into your private balance"], ["p", "$ lumwatch shield 1000 USDG"], ["", "  approve  exactly 1,000 USDG · one signature"], ["g", "  ✓ seal    note built on this device"], ["g", "  ✓ commit  leaf 4,821 added to the pool"], ["g", "  ✓ private balance 1,000 USDG"]],
    send: [["c", "# pay an address privately"], ["p", "$ lumwatch send 25 USDG --to 0x9f3c…41e7"], ["", "  proof    groth16 · built on this device · 1.4 s"], ["g", "  ✓ relay  gas paid by the relayer"], ["g", "  ✓ sent   25 USDG delivered"], ["g", "  ✓ change 975 USDG back as a fresh note"]],
    prove: [["c", "# prove your funds are clean"], ["p", "$ lumwatch prove --list public-blocklist"], ["", "  list     public block list · Nov 2026"], ["", "  proof    built on this device · 2.1 s"], ["g", "  ✓ clean  your deposit is not in the list"], ["g", "  ✓ copied share the proof with whoever asks"]],
    check: [["c", "# check a token before you buy (live in the app today)"], ["p", "$ lumwatch check 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73"], ["", "  reading Robinhood Chain · Sourcify"], ["g", "  ✓ code    present (2,202 bytes)"], ["g", "  ✓ source  verified (exact match)"], ["y", "  ! upgradeable proxy · logic can be swapped"], ["y", "  verdict: LOOK CLOSER"]],
  };
  document.querySelectorAll(".bpterm").forEach((t) => {
    const out = t.querySelector("pre"), tabs = [...t.querySelectorAll("[data-cmd]")];
    let timer = null, cur = 0;
    function play(name) {
      clearTimeout(timer); out.textContent = "";
      tabs.forEach((b) => b.setAttribute("aria-selected", b.dataset.cmd === name ? "true" : "false"));
      const lines = SCRIPTS[name]; let i = 0;
      const next = () => {
        if (i >= lines.length) { const n = document.createElement("span"); n.className = "c"; n.textContent = "  (example output · CLI ships with the contracts)\n"; out.append(n); if (!t.dataset.manual) timer = setTimeout(() => { cur = (cur + 1) % tabs.length; play(tabs[cur].dataset.cmd); }, 3200); return; }
        const [c, txt] = lines[i++];
        const s = document.createElement("span"); if (c) s.className = c; out.append(s);
        if (c === "p" && !still) { let k = 0; const type = () => { s.textContent = txt.slice(0, ++k); if (k < txt.length) timer = setTimeout(type, 18); else { s.textContent += "\n"; timer = setTimeout(next, 260); } }; type(); }
        else { s.textContent = txt + "\n"; timer = setTimeout(next, still ? 0 : 320); }
      };
      next();
    }
    tabs.forEach((b, i) => b.addEventListener("click", () => { t.dataset.manual = "1"; cur = i; play(b.dataset.cmd); }));
    const copy = t.querySelector("[data-copycmd]");
    if (copy) copy.addEventListener("click", async () => { const line = SCRIPTS[tabs[cur].dataset.cmd].find((l) => l[0] === "p")[1].replace(/^\$ /, ""); try { await navigator.clipboard.writeText(line); copy.textContent = "Copied"; } catch { copy.textContent = "Select it"; } setTimeout(() => (copy.textContent = "Copy"), 1500); });
    play(tabs[0].dataset.cmd);
  });

  // ---- sections rise as you sail in (readable at rest) ----
  if (!still && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.remove("pre"); io.unobserve(e.target); } }), { threshold: .1 });
    document.querySelectorAll(".reveal").forEach((el) => { if (el.getBoundingClientRect().top > innerHeight) { el.classList.add("pre"); io.observe(el); } });
  }

  // ---- I: the Light, live reads from Robinhood Chain and Sourcify ----
  const RPC = "https://rpc.mainnet.chain.robinhood.com", SOURCIFY = "https://sourcify.dev/server/v2/contract/4663/";
  const PONS = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e", DEAD = "000000000000000000000000000000000000dead";
  const $ = (id) => document.getElementById(id);
  const short = (a) => a.slice(0, 6) + "…" + a.slice(-4);
  const pad = (a) => a.replace(/^0x/, "").toLowerCase().padStart(64, "0");
  let rid = 0;
  async function rpc(method, params) {
    const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++rid, method, params }) });
    const j = await r.json(); if (j.error) throw Object.assign(new Error(j.error.message), { rpc: true }); return j.result;
  }
  const call = (to, data) => rpc("eth_call", [{ to, data }, "latest"]).catch((e) => { if (e.rpc) return null; throw e; });
  function str(hex) {
    if (!hex || hex === "0x") return null;
    const b = hex.slice(2);
    if (b.length === 64) { try { return decodeURIComponent(b.replace(/(00)+$/, "").replace(/../g, "%$&")) || null; } catch { return null; } } // bytes32 names
    const len = parseInt(b.slice(64, 128), 16); const raw = b.slice(128, 128 + len * 2);
    try { return decodeURIComponent(raw.replace(/../g, "%$&")); } catch { return null; }
  }
  const big = (hex) => (hex && hex !== "0x" ? BigInt(hex) : null);
  function units(v, d) { const s = v.toString().padStart(d + 1, "0"); const w = s.slice(0, -d || undefined) || "0", f = d ? s.slice(-d).replace(/0+$/, "").slice(0, 2) : ""; return Number(w).toLocaleString("en-US") + (f ? "." + f : ""); }

  function render(v) {
    beam = COL[v.level === "ok" ? "ok" : v.level === "bad" ? "bad" : "warn"];
    $("lamp").style.setProperty("--v", beam); $("vtitle").style.setProperty("--v", beam);
    $("vtitle").textContent = { ok: "Clear", warn: "Look closer", bad: "Stop" }[v.level];
    $("vtext").textContent = v.text;
    $("checks").innerHTML = "";
    let n = 0;
    for (const [cls, k, val] of v.rows) {
      const li = document.createElement("li"); li.className = cls + (still ? "" : " in"); li.style.animationDelay = (n++ * 90) + "ms";
      li.innerHTML = '<span class="i"></span><span class="k"></span><span class="v"></span>';
      li.querySelector(".i").textContent = { ok: "✓", warn: "!", bad: "✕", na: "i" }[cls];
      li.querySelector(".k").textContent = k; li.querySelector(".v").textContent = val;
      $("checks").append(li);
    }
    const soon = document.createElement("li"); soon.className = "na";
    soon.innerHTML = '<span class="i">◌</span><span class="k">Buy and sell-back test</span><span class="v">next watch: a simulated buy and sell to catch hidden taxes</span>';
    $("checks").append(soon);
    $("scanfoot").textContent = v.foot;
    if (still) redraw();
  }

  async function scan(addr) {
    const rows = [];
    const [code, block] = await Promise.all([rpc("eth_getCode", [addr, "latest"]), rpc("eth_blockNumber", [])]);
    const foot = `Live read at block ${parseInt(block, 16).toLocaleString("en-US")} from Robinhood Chain and Sourcify.`;
    if (!code || code === "0x") return { level: "bad", text: `${short(addr)} has no contract code. It is a wallet or an empty address, not a token. Don't send tokens here thinking it is one.`, rows: [["bad", "Contract code", "none"]], foot };
    rows.push(["ok", "Contract code", `present (${((code.length - 2) / 2).toLocaleString("en-US")} bytes)`]);
    const [n, s, d, ts, own, impl, launch, dead] = await Promise.all([
      call(addr, "0x06fdde03"), call(addr, "0x95d89b41"), call(addr, "0x313ce567"), call(addr, "0x18160ddd"), call(addr, "0x8da5cb5b"),
      rpc("eth_getStorageAt", [addr, "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc", "latest"]),
      call(PONS, "0x3cf28b5a" + pad(addr)), call(addr, "0x70a08231" + pad(DEAD)),
    ]);
    const name = str(n), sym = str(s), dec = big(d), sup = big(ts);
    if (dec === null || sup === null) return { level: "bad", text: `${short(addr)} is a contract, but it does not answer like a token (no decimals or total supply).`, rows: rows.concat([["bad", "Token basics", "decimals or totalSupply missing"]]), foot };
    const D = Number(dec);
    rows.push(["ok", "Token basics", `${name || "?"} (${sym || "?"}) · ${D} decimals · ${units(sup, D)} supply`]);
    let level = "ok"; const notes = [];
    let verified = null;
    try { const r = await fetch(SOURCIFY + addr); const j = await r.json(); verified = ["exact_match", "match"].includes(j.match) ? j.match : null; } catch { verified = undefined; }
    if (verified) rows.push(["ok", "Source code", `verified on Sourcify (${verified.replace("_", " ")})`]);
    else if (verified === null) { rows.push(["warn", "Source code", "not verified on Sourcify"]); level = "warn"; notes.push("its source code is not published on Sourcify, so nobody can read what the contract does"); }
    else rows.push(["na", "Source code", "Sourcify did not answer"]);
    if (!own || own === "0x") rows.push(["ok", "Owner", "no owner() function"]);
    else if (/^0x0+$/.test(own)) rows.push(["ok", "Owner", "renounced (zero address)"]);
    else { rows.push(["warn", "Owner", `0x${own.slice(-40)} can still call owner-only functions`]); level = "warn"; notes.push("an owner address still controls it"); }
    if (impl && !/^0x0+$/.test(impl)) { rows.push(["warn", "Upgradeable", `proxy · logic at 0x${impl.slice(-40)} can be swapped`]); level = "warn"; notes.push("it is an upgradeable proxy, so its code can change"); }
    else rows.push(["ok", "Upgradeable", "no proxy slot set"]);
    if (launch && launch.length >= 2 + 64 * 15 && parseInt(launch.slice(2 + 64 * 14, 2 + 64 * 15), 16) === 1) {
      const w = (i) => launch.slice(2 + 64 * i, 2 + 64 * (i + 1));
      const creator = "0x" + w(2).slice(-40), tax = parseInt(w(8), 16), phase = parseInt(w(10), 16);
      rows.push(["na", "Pons launch", `yes · creator ${short(creator)} · creator tax ${tax / 100}% · ${phase === 0 ? "still on the bonding curve" : "graduated to a pool"}`]);
    } else rows.push(["na", "Pons launch", "not launched through Pons V2"]);
    const db = big(dead);
    if (db && db > 0n) rows.push(["na", "Burned", `${units(db, D)} at 0x…dEaD (${(Number(db * 10000n / sup) / 100).toFixed(2)}% of supply)`]);
    else rows.push(["na", "Burned", "nothing at 0x…dEaD"]);
    const label = `${sym || "This token"} at ${short(addr)}`;
    const text = level === "ok" ? `${label}. Nothing in these checks stands out. Clear is not a promise; the sell-back test is still to come.` : `${label}: ${notes.join("; ")}. Look closer is a reason to read more, not proof of a scam.`;
    return { level, text, rows, foot };
  }

  // Saved scans for the preview, where outside requests may be blocked. Same checks, read at blocks 117,963,641 to 117,972,051.
  const SAVED = {
    "0x5fc5360d0400a0fd4f2af552add042d716f1d168": { level: "warn", text: "USDG at 0x5fc5…d168: an owner address still controls it; it is an upgradeable proxy, so its code can change. Look closer is a reason to read more, not proof of a scam.", rows: [["ok", "Contract code", "present (170 bytes)"], ["ok", "Token basics", "Global Dollar (USDG) · 6 decimals · 627,544,907.12 supply"], ["ok", "Source code", "verified on Sourcify (exact match)"], ["warn", "Owner", "0xcfa0388f5ddf905fdc08c45c716c15dc10a14c6f can still call owner-only functions"], ["warn", "Upgradeable", "proxy · logic at 0x68184c449e1a8f34fa18d289737129fd27b66f8f can be swapped"], ["na", "Pons launch", "not launched through Pons V2"], ["na", "Burned", "8,324.65 at 0x…dEaD (0.00% of supply)"]] },
    "0x0bd7d308f8e1639fab988df18a8011f41eacad73": { level: "warn", text: "WETH at 0x0Bd7…AD73: it is an upgradeable proxy, so its code can change. Look closer is a reason to read more, not proof of a scam.", rows: [["ok", "Contract code", "present"], ["ok", "Token basics", "WETH (WETH) · 18 decimals · 34,901.1 supply"], ["ok", "Source code", "verified on Sourcify (exact match)"], ["ok", "Owner", "no owner() function"], ["warn", "Upgradeable", "proxy · logic at 0xc6b81b429797e0f555440b70cd99e032d7ae947e can be swapped"], ["na", "Pons launch", "not launched through Pons V2"], ["na", "Burned", "0.37 at 0x…dEaD (0.00% of supply)"]] },
    "0x000000000000000000000000000000000000dead": { level: "bad", text: "0x0000…dEaD has no contract code. It is a wallet or an empty address, not a token. Don't send tokens here thinking it is one.", rows: [["bad", "Contract code", "none"]] },
  };

  if ($("scanform")) $("scanform").addEventListener("submit", async (e) => {
    e.preventDefault();
    const addr = $("ca").value.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) { render({ level: "bad", text: "That is not a contract address. It should be 0x followed by 40 letters and digits.", rows: [], foot: "Nothing was read." }); return; }
    $("scan").disabled = true; $("scan").textContent = "Reading the chain…"; document.querySelector(".scanner").classList.add("busy");
    try { render(await scan(addr)); }
    catch {
      const s = SAVED[addr.toLowerCase()];
      if (s) render({ ...s, foot: "This preview cannot reach the chain, so this is a saved scan from a recent block. On the live site the same checks run on the latest block." });
      else render({ level: "warn", text: "The chain could not be reached from this page. Try one of the examples, or open Lumwatch on its own site.", rows: [], foot: "Nothing was read." });
    } finally { $("scan").disabled = false; $("scan").textContent = "Shine the light"; document.querySelector(".scanner").classList.remove("busy"); }
  });
  document.querySelectorAll("[data-ca]").forEach((b) => b.addEventListener("click", () => { $("ca").value = b.dataset.ca; $("scanform").requestSubmit(); }));



  // ---- agent console: talk to the Lumwatch agent. check and balance are live; shield, send and prove are previews ----
  const clog = document.getElementById("clog"), cform = document.getElementById("cform"), cin = document.getElementById("cin");
  if (clog && cform && cin) {
    const TOKENS = { usdg: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", weth: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73" };
    const sleepMs = (ms) => new Promise((r) => setTimeout(r, still ? 0 : ms));
    function line(cls, text) { const d = document.createElement("div"); d.className = "cl " + cls; d.textContent = text; clog.append(d); clog.scrollTop = clog.scrollHeight; return d; }
    async function think() { const d = line("think", "agent is thinking"); await sleepMs(500); d.remove(); }
    async function tool(name, args) { line("tool", `→ ${name}(${args})`); await sleepMs(450); }
    const HELP = ["check <token address | USDG | WETH>   live · reads Robinhood Chain and Sourcify", "balance                               live · your connected wallet on Robinhood Chain", "shield <amount> USDG                  preview · walkthrough, nothing is signed", "send <amount> USDG to <address>       preview · walkthrough, nothing is signed", "prove                                 preview · clean proof walkthrough"];
    async function run(raw) {
      const q = raw.trim(); if (!q) return;
      line("you", q); cin.value = ""; cin.disabled = true;
      const low = q.toLowerCase();
      try {
        await think();
        const addr = (q.match(/0x[0-9a-fA-F]{40}/) || [])[0] || (/\busdg\b/.test(low) && /check|scan|safe|token/.test(low) ? TOKENS.usdg : null) || (/\bweth\b/.test(low) && /check|scan|safe|token/.test(low) ? TOKENS.weth : null);
        if (/^(help|\?)$|what can you do/.test(low)) { line("agent", "Here is what I can do:"); HELP.forEach((h) => line("mono", "  " + h)); }
        else if (/check|scan|is .* safe|token/.test(low) && addr) {
          await tool("lumwatch.check_token", addr.slice(0, 6) + "…" + addr.slice(-4));
          let v; try { v = await scan(addr); } catch { v = null; }
          if (!v) { line("warn", "I couldn't reach Robinhood Chain from this page. Try again on lumwatch.app."); }
          else {
            line(v.level === "ok" ? "ok" : v.level === "bad" ? "bad" : "warn", { ok: "Clear", warn: "Look closer", bad: "Stop" }[v.level] + " · " + v.text);
            v.rows.forEach(([c, k, val]) => line("mono " + c, `  ${{ ok: "✓", warn: "!", bad: "✕", na: "·" }[c]} ${k}: ${val}`));
            line("dim", v.foot);
          }
        }
        else if (/check|scan|token/.test(low)) { line("agent", "Give me a token contract address (0x…), or say check USDG or check WETH."); }
        else if (/balance|wallet|how much/.test(low)) {
          await tool("lumwatch.wallet_balance", account ? account.slice(0, 6) + "…" + account.slice(-4) : "no wallet");
          if (!account) { line("agent", "Connect a wallet first (top right), then ask again."); }
          else {
            try {
              const pad = account.slice(2).toLowerCase().padStart(64, "0");
              const [eth, usdg] = await Promise.all([window.ethereum.request({ method: "eth_getBalance", params: [account, "latest"] }), window.ethereum.request({ method: "eth_call", params: [{ to: TOKENS.usdg, data: "0x70a08231" + pad }, "latest"] })]);
              const f = (v, d, k) => { const s = BigInt(v).toString().padStart(d + 1, "0"); return Number(s.slice(0, -d)).toLocaleString("en-US") + "." + s.slice(-d).slice(0, k); };
              line("ok", `Public balance on Robinhood Chain: ${f(eth, 18, 4)} ETH · ${f(usdg, 6, 2)} USDG`);
              line("dim", "Anyone can see this. Shielding would move it into a private balance (in development).");
            } catch { line("warn", "Your wallet answered with an error. Switch it to Robinhood Chain and ask again."); }
          }
        }
        else if (/shield|deposit|go private/.test(low)) {
          const amt = (low.match(/(\d+(?:\.\d+)?)/) || [])[1] || "100";
          await tool("lumwatch.shield", `${amt} USDG`);
          for (const [c, t] of [["mono g", "  ✓ approve  exactly " + amt + " USDG · one signature"], ["mono g", "  ✓ seal     note built on this device"], ["mono g", "  ✓ commit   hash added to the pool"], ["ok", `Private balance +${amt} USDG`]]) { line(c, t); await sleepMs(380); }
          line("dim", "Preview: contracts in development. Nothing was signed or sent.");
        }
        else if (/send|pay|transfer/.test(low)) {
          const amt = (low.match(/(\d+(?:\.\d+)?)/) || [])[1] || "25";
          const to = addr ? addr.slice(0, 6) + "…" + addr.slice(-4) : "0x9f3c…41e7";
          await tool("lumwatch.private_send", `${amt} USDG → ${to}`);
          for (const [c, t] of [["mono g", "  ✓ proof   groth16 · built on this device · 1.4 s"], ["mono g", "  ✓ relay   gas paid by the relayer"], ["mono g", `  ✓ deliver ${amt} USDG to ${to}`], ["ok", "Sent privately · nothing on-chain links it to your wallet"]]) { line(c, t); await sleepMs(380); }
          line("dim", "Preview: contracts in development. Nothing was signed or sent.");
        }
        else if (/prove|clean|proof|compliance/.test(low)) {
          await tool("lumwatch.clean_proof", "public-blocklist");
          for (const [c, t] of [["mono g", "  ✓ list    public block list · Nov 2026"], ["mono g", "  ✓ proof   built on this device · 2.1 s"], ["ok", "Clean · your deposit is not in the list, and your history stays private"]]) { line(c, t); await sleepMs(380); }
          line("dim", "Preview: contracts in development. No proof was made.");
        }
        else { line("agent", "I can check a token, read your balance, or walk you through shield, send and prove. Type help to see the commands."); }
      } finally { cin.disabled = false; cin.focus({ preventScroll: true }); }
    }
    cform.addEventListener("submit", (e) => { e.preventDefault(); run(cin.value); });
    document.querySelectorAll("[data-ask]").forEach((b) => b.addEventListener("click", () => run(b.dataset.ask)));
    line("agent", "Hi, I'm the Lumwatch agent. Ask me to check a token, read your balance, or try shield, send and prove. Type help for the list.");
  }
})();
