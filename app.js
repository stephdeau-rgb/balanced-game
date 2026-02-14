(function () {
  "use strict";

  // ---------- utils ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const n = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const round2 = (x) => Math.round(x * 100) / 100;
  const round0 = (x) => Math.round(x);
  const deepClone = (o) => JSON.parse(JSON.stringify(o));

  function debounce(fn, ms = 120) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  async function copyToClipboard(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch { return false; }
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  // ---------- example data ----------
  const EXAMPLE = {
    config: { enableDoubling: false, enableCrit: false, critMultiplier: 3 },
    classes: [
      { id: "swordsman", name: "Épéiste", role: "dps", baseStats: { hp: 18, atk: 6, def: 3, matk: 1, mdef: 2, spd: 7 } },
      { id: "lancer", name: "Lancier", role: "bruiser", baseStats: { hp: 20, atk: 6, def: 4, matk: 1, mdef: 2, spd: 5 } },
      { id: "mage", name: "Mage", role: "magic", baseStats: { hp: 16, atk: 1, def: 1, matk: 7, mdef: 3, spd: 5 } },
      { id: "priest", name: "Prêtre", role: "support", baseStats: { hp: 17, atk: 1, def: 2, matk: 5, mdef: 4, spd: 4 } },
    ],
    weapons: [
      { id: "iron_sword", name: "Épée fer", type: "physical", might: 4, hit: 85, crit: 0, rangeMin: 1, rangeMax: 1 },
      { id: "iron_lance", name: "Lance fer", type: "physical", might: 4, hit: 80, crit: 0, rangeMin: 1, rangeMax: 1 },
      { id: "fire", name: "Feu", type: "magic", might: 4, hit: 90, crit: 0, rangeMin: 1, rangeMax: 2 },
      { id: "blowgun", name: "Sarbacane", type: "magic", might: 1, hit: 90, crit: 0, rangeMin: 1, rangeMax: 2 },
    ],
    terrain: [
      { id: "plain", name: "Plaine", moveCost: 1, bonus: { def: 0, mdef: 0, avoid: 0 } },
      { id: "forest", name: "Forêt", moveCost: 2, bonus: { def: 1, mdef: 0, avoid: 15 } },
      { id: "fort", name: "Fort", moveCost: 2, bonus: { def: 2, mdef: 2, avoid: 10 } },
    ],
    units: [
      { id: "p1", name: "Hero", classId: "swordsman", weaponId: "iron_sword", side: "player", level: 1, position: { x: 2, y: 4 } },
      { id: "p2", name: "Priest", classId: "priest", weaponId: "blowgun", side: "player", level: 1, position: { x: 3, y: 4 } },
      { id: "e1", name: "Bandit", classId: "lancer", weaponId: "iron_lance", side: "enemy", level: 1, position: { x: 7, y: 2 } },
    ],
  };

  // ---------- state ----------
  const state = {
    data: deepClone(EXAMPLE),
    ui: {
      tab: "main",
      enableDoubling: false,
      enableCrit: false,

      duelAttackerId: "p1",
      duelDefenderId: "e1",
      duelAttTerrainId: "plain",
      duelDefTerrainId: "plain",

      mainSelectedClassId: null,
      mainWeaponId: "iron_sword",
    },
    derived: { exportGame: null, micro: null, errors: [] }
  };

  // ---------- access ----------
  const getClass = (id) => state.data.classes.find(c => c.id === id) || null;
  const getWeapon = (id) => state.data.weapons.find(w => w.id === id) || null;
  const getTerrain = (id) => state.data.terrain.find(t => t.id === id) || null;
  const getUnit = (id) => state.data.units.find(u => u.id === id) || null;

  function unitStats(unit) {
    const cls = getClass(unit.classId);
    if (!cls) return null;
    const base = cls.baseStats || {};
    const o = unit.statsOverride || {};
    return {
      hp: n(o.hp, n(base.hp, 0)),
      atk: n(o.atk, n(base.atk, 0)),
      def: n(o.def, n(base.def, 0)),
      matk: n(o.matk, n(base.matk, 0)),
      mdef: n(o.mdef, n(base.mdef, 0)),
      spd: n(o.spd, n(base.spd, 0)),
    };
  }

  function applyTerrainToDefender(stats, terrain) {
    const b = terrain?.bonus || { def: 0, mdef: 0, avoid: 0 };
    return {
      ...stats,
      def: stats.def + n(b.def, 0),
      mdef: stats.mdef + n(b.mdef, 0),
      avoid: n(b.avoid, 0),
    };
  }

  function attacksCount(aStats, dStats, enableDoubling) {
    if (!enableDoubling) return 1;
    return aStats.spd >= dStats.spd + 4 ? 2 : 1;
  }

  function simulateAttack(attackerUnit, defenderUnit, defenderTerrainId) {
    const aStats = unitStats(attackerUnit);
    const dStatsBase = unitStats(defenderUnit);
    const w = getWeapon(attackerUnit.weaponId);
    if (!aStats || !dStatsBase || !w) return null;

    const terrain = getTerrain(defenderTerrainId);
    const dStats = applyTerrainToDefender(dStatsBase, terrain);

    const hitChance = clamp01((n(w.hit, 0) - n(dStats.avoid, 0)) / 100);
    const ac = attacksCount(aStats, dStatsBase, state.ui.enableDoubling);

    let dmg = 0, isMagic = false;
    if (w.type === "magic") {
      isMagic = true;
      dmg = Math.max(0, aStats.matk + n(w.might, 0) - dStats.mdef);
    } else if (w.type === "physical") {
      dmg = Math.max(0, aStats.atk + n(w.might, 0) - dStats.def);
    } else {
      dmg = 0;
    }

    const critChance = state.ui.enableCrit ? clamp01(n(w.crit, 0) / 100) : 0;
    const critMult = n(state.data.config.critMultiplier, 3);
    const critFactor = 1 + critChance * (critMult - 1);

    const expectedDamage = hitChance * dmg * ac * critFactor;
    return { hitChance, dmg, attacksCount: ac, expectedDamage, isMagic, terrainName: terrain?.name || "—" };
  }

  const TTK = (hp, expected) => expected <= 0 ? Infinity : (Math.max(1, hp) / expected);

  // ---------- export ----------
  function exportGame(data) {
    return {
      CLASSES: data.classes,
      WEAPONS: data.weapons,
      TERRAIN: data.terrain,
      UNITS: data.units,
      CONFIG: data.config,
    };
  }

  // ---------- rendering helpers ----------
  function badge(level, text) {
    const cls = level === "ok" ? "ok" : level === "warn" ? "warn" : "fail";
    return `<span class="badge ${cls}">${text}</span>`;
  }

  function indicatorRow(label, value, level, why) {
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <div class="row gap wrap" style="justify-content:space-between">
        <div>
          <div style="font-weight:900">${label}</div>
          <div class="hint">${why}</div>
        </div>
        ${badge(level, `<b>${value}</b>`)}
      </div>
    `;
    return div;
  }

  function sliderRow(label, min, max, step, value, onInput) {
    const wrap = document.createElement("div");
    wrap.className = "slider-row";
    wrap.innerHTML = `
      <div class="label2">${label}</div>
      <input type="range" min="${min}" max="${max}" step="${step}" value="${value}">
      <div class="val">${value}</div>
    `;
    const range = wrap.querySelector("input");
    const valEl = wrap.querySelector(".val");
    range.addEventListener("input", (e) => {
      valEl.textContent = e.target.value;
      onInput(n(e.target.value));
    });
    return wrap;
  }

  // ---------- Principal: compute vs standard ----------
  function standardUnit() {
    const u = getUnit(state.ui.duelDefenderId);
    return u || state.data.units.find(x => x.side === "enemy") || state.data.units[0] || null;
  }

  function tempUnitFromClass(classId, weaponId) {
    return { id: "tmp", name: "TMP", classId, weaponId, side: "player", level: 1, position: { x: 0, y: 0 } };
  }

  function evaluateMain(classId, weaponId) {
    const std = standardUnit();
    if (!std) return { error: "Aucune unité standard dispo." };

    const attacker = tempUnitFromClass(classId, weaponId);
    const sim = simulateAttack(attacker, std, state.ui.duelDefTerrainId);
    if (!sim) return { error: "Simulation impossible." };

    const stdHp = unitStats(std)?.hp ?? 1;
    const ttk = TTK(stdHp, sim.expectedDamage);

    // règles simples de verdict
    const hit = sim.hitChance;
    const exp = sim.expectedDamage;
    const dmg = sim.dmg;

    const vHit = hit >= 0.7 && hit <= 0.9 ? "ok" : (hit >= 0.6 && hit <= 0.95 ? "warn" : "fail");
    const vTTK = (ttk >= 2 && ttk <= 3) ? "ok" : (ttk >= 1.5 && ttk <= 4 ? "warn" : "fail");
    const vExp = exp > 0 ? "ok" : "fail";
    const vDmg = dmg > 0 ? "ok" : "fail";

    // break alerts
    const breaks = [];
    if (dmg === 0) breaks.push({ level: "fail", text: "Dégâts = 0 → unité inutile sur ce standard." });
    if (hit < 0.5) breaks.push({ level: "warn", text: "Hit < 50% → frustration (trop d’échecs)." });
    if (ttk < 1.2 && exp > 0) breaks.push({ level: "warn", text: "One-shot probable → trop punitif." });
    if (ttk > 4) breaks.push({ level: "warn", text: "TTK > 4 → combats trop longs (ennui)." });
    if (!breaks.length) breaks.push({ level: "ok", text: "Pas d’alerte majeure détectée." });

    // recos simples
    const recos = [];
    if (dmg === 0) recos.push({ level: "fail", text: "Action: baisse DEF/MDEF standard (ou terrain), ou augmente ATK/MATK/Might." });
    if (hit < 0.7) recos.push({ level: "warn", text: "Action: augmente Hit de l’arme (+5 à +10) ou baisse Avoid du terrain." });
    if (ttk > 3) recos.push({ level: "warn", text: "Action: +1 Might (arme) ou +1 ATK/MATK (classe), ou -1 DEF/MDEF standard." });
    if (ttk < 2) recos.push({ level: "warn", text: "Action: +HP/+DEF standard, ou baisse Might / ATK/MATK." });
    if (!recos.length) recos.push({ level: "ok", text: "Rien à changer pour ce standard (selon tes seuils)." });

    return { sim, std, stdHp, ttk, vHit, vTTK, vExp, vDmg, breaks, recos };
  }

  // ---------- render tabs ----------
  function setTab(tab) {
    state.ui.tab = tab;
    $$(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
    $$(".tabpane").forEach(p => p.classList.toggle("active", p.id === `tab-${tab}`));
  }

  // ---------- render selects ----------
  function renderDuelSelects() {
    const units = state.data.units.map(u => ({
      value: u.id,
      label: `${u.side === "enemy" ? "E" : "P"} — ${u.name} (${u.classId}/${u.weaponId})`
    }));
    const terrains = state.data.terrain.map(t => ({ value: t.id, label: t.name }));

    const fill = (el, opts, sel) => {
      if (!el) return;
      el.innerHTML = "";
      for (const o of opts) {
        const op = document.createElement("option");
        op.value = o.value;
        op.textContent = o.label;
        if (o.value === sel) op.selected = true;
        el.appendChild(op);
      }
    };

    fill($("#duel-attacker"), units, state.ui.duelAttackerId);
    fill($("#duel-defender"), units, state.ui.duelDefenderId);
    fill($("#duel-attacker-terrain"), terrains, state.ui.duelAttTerrainId);
    fill($("#duel-defender-terrain"), terrains, state.ui.duelDefTerrainId);
  }

  // ---------- render duels ----------
  function renderDuels() {
    const root = $("#duel-results");
    const recos = $("#micro-recos");
    if (!root || !recos) return;

    root.innerHTML = "";
    recos.innerHTML = "";

    const att = getUnit(state.ui.duelAttackerId);
    const def = getUnit(state.ui.duelDefenderId);
    if (!att || !def) {
      root.innerHTML = `<div class="badge fail">❌ Attaquant/Défenseur introuvable.</div>`;
      return;
    }

    const sim = simulateAttack(att, def, state.ui.duelDefTerrainId);
    if (!sim) {
      root.innerHTML = `<div class="badge fail">❌ Simulation impossible.</div>`;
      return;
    }

    const defHp = unitStats(def)?.hp ?? 1;
    const ttk = TTK(defHp, sim.expectedDamage);

    root.appendChild(indicatorRow("Hit", `${round0(sim.hitChance*100)}%`, sim.hitChance < 0.5 ? "warn" : "ok", "Fiabilité. Trop bas = frustration."));
    root.appendChild(indicatorRow("Dégâts", `${sim.dmg}`, sim.dmg === 0 ? "fail" : "ok", "Si 0 → ça ne marche pas."));
    root.appendChild(indicatorRow("Dégâts attendus", `${round2(sim.expectedDamage)}`, sim.expectedDamage <= 0 ? "fail" : "ok", "Rythme réel: hit × dégâts × attaques."));
    root.appendChild(indicatorRow("TTK", `${Number.isFinite(ttk)? round2(ttk):"∞"}`, ttk>3 ? "warn":"ok", "Tempo. Vise ~2–3 sur standard."));

    // micro recos
    const list = [];
    if (sim.dmg === 0) list.push({ level:"fail", text:"Baisse DEF/MDEF standard (ou terrain) ou augmente Might/ATK/MATK." });
    if (sim.hitChance < 0.7) list.push({ level:"warn", text:"Augmente Hit arme (+5 à +10) ou baisse Avoid terrain." });
    if (ttk > 3) list.push({ level:"warn", text:"+1 Might ou -1 DEF/MDEF standard." });
    if (!list.length) list.push({ level:"ok", text:"RAS sur ce duel (selon tes seuils)." });

    for (const r of list) {
      const d = document.createElement("div");
      d.className = `badge ${r.level}`;
      d.textContent = (r.level==="fail"?"❌ ":"⚠️ ") + r.text;
      if (r.level==="ok") d.textContent = "✅ " + r.text;
      recos.appendChild(d);
    }
  }

  // ---------- render Principal ----------
  function allyClassIds() {
    const ids = new Set(state.data.units.filter(u => u.side === "player").map(u => u.classId));
    return Array.from(ids).filter(id => getClass(id));
  }

  function renderMainList() {
    const root = $("#ally-class-list");
    if (!root) return;

    const ids = allyClassIds();
    if (!ids.length) {
      root.innerHTML = `<div class="badge warn">⚠️ Aucune classe alliée (pas d’unités player).</div>`;
      return;
    }

    // select default
    if (!state.ui.mainSelectedClassId || !getClass(state.ui.mainSelectedClassId)) {
      state.ui.mainSelectedClassId = ids[0];
    }

    root.innerHTML = "";
    for (const id of ids) {
      const c = getClass(id);
      const el = document.createElement("div");
      el.className = "list-item" + (id === state.ui.mainSelectedClassId ? " active" : "");
      el.innerHTML = `
        <div class="list-title">${c.name}</div>
        <div class="list-sub">id: ${c.id} · role: ${c.role || "—"}</div>
      `;
      el.addEventListener("click", () => {
        state.ui.mainSelectedClassId = id;
        renderAll();
      });
      root.appendChild(el);
    }
  }

  function renderMainPanel() {
    const clsId = state.ui.mainSelectedClassId;
    const c = clsId ? getClass(clsId) : null;

    const title = $("#main-class-title");
    const empty = $("#main-class-empty");
    const panel = $("#main-class-panel");
    if (title) title.textContent = c ? `Classe: ${c.name}` : "Sélectionne une classe";

    if (!c) {
      if (empty) empty.style.display = "inline-flex";
      if (panel) panel.style.display = "none";
      return;
    }
    if (empty) empty.style.display = "none";
    if (panel) panel.style.display = "flex";

    // weapon select
    const weaponSel = $("#main-weapon-select");
    if (weaponSel) {
      weaponSel.innerHTML = "";
      for (const w of state.data.weapons) {
        const op = document.createElement("option");
        op.value = w.id;
        op.textContent = `${w.name} (${w.type})`;
        if (w.id === state.ui.mainWeaponId) op.selected = true;
        weaponSel.appendChild(op);
      }
      weaponSel.onchange = (e) => {
        state.ui.mainWeaponId = e.target.value;
        renderAll();
      };
    }

    // dmg type display
    const w = getWeapon(state.ui.mainWeaponId);
    const dmgType = $("#main-dmg-type");
    if (dmgType) {
      dmgType.textContent = w ? (w.type === "magic" ? "Magique (MATK vs MDEF)" : "Physique (ATK vs DEF)") : "—";
    }

    // sliders: class stats
    const statsRoot = $("#main-stats-sliders");
    if (statsRoot) {
      statsRoot.innerHTML = "";
      const bs = c.baseStats;
      const keys = [
        ["HP", "hp", 1, 60],
        ["ATK", "atk", 0, 30],
        ["DEF", "def", 0, 30],
        ["MATK", "matk", 0, 30],
        ["MDEF", "mdef", 0, 30],
        ["SPD", "spd", 0, 30],
      ];
      for (const [label, key, min, max] of keys) {
        statsRoot.appendChild(sliderRow(label, min, max, 1, n(bs[key], 0), (val) => {
          bs[key] = val;
          recomputeAndRender();
        }));
      }
    }

    // sliders: weapon
    const wRoot = $("#main-weapon-sliders");
    if (wRoot && w) {
      wRoot.innerHTML = "";
      wRoot.appendChild(sliderRow("Might", -2, 12, 1, n(w.might, 0), (val) => { w.might = val; recomputeAndRender(); }));
      wRoot.appendChild(sliderRow("Hit", 40, 100, 1, n(w.hit, 0), (val) => { w.hit = val; recomputeAndRender(); }));
      wRoot.appendChild(sliderRow("Crit", 0, 30, 1, n(w.crit, 0), (val) => { w.crit = val; recomputeAndRender(); }));
    }

    // indicators
    const indicators = $("#main-indicators");
    const alerts = $("#main-break-alerts");
    const recos = $("#main-recos");
    if (!indicators || !alerts || !recos) return;

    const evalRes = evaluateMain(c.id, state.ui.mainWeaponId);
    indicators.innerHTML = "";
    alerts.innerHTML = "";
    recos.innerHTML = "";

    if (evalRes.error) {
      indicators.innerHTML = `<div class="badge fail">❌ ${evalRes.error}</div>`;
      return;
    }

    const sim = evalRes.sim;
    const ttk = evalRes.ttk;

    indicators.appendChild(indicatorRow(
      "Hit",
      `${round0(sim.hitChance*100)}%`,
      evalRes.vHit,
      "Pourquoi: fiabilité. Trop bas → frustration."
    ));
    indicators.appendChild(indicatorRow(
      "Dégâts attendus",
      `${round2(sim.expectedDamage)}`,
      evalRes.vExp,
      "Pourquoi: rythme réel (hit × dmg × attaques)."
    ));
    indicators.appendChild(indicatorRow(
      "TTK",
      `${Number.isFinite(ttk)? round2(ttk):"∞"}`,
      evalRes.vTTK,
      "Pourquoi: tempo. Vise ~2–3 sur le standard."
    ));
    indicators.appendChild(indicatorRow(
      "Dégâts (si ça touche)",
      `${sim.dmg}`,
      evalRes.vDmg,
      "Pourquoi: si 0 → tu ne peux jamais progresser."
    ));

    for (const b of evalRes.breaks) {
      const d = document.createElement("div");
      d.className = `badge ${b.level}`;
      d.textContent = (b.level==="fail"?"❌ ":"⚠️ ");
      if (b.level==="ok") d.textContent = "✅ ";
      d.textContent += b.text;
      alerts.appendChild(d);
    }

    for (const r of evalRes.recos) {
      const d = document.createElement("div");
      d.className = `badge ${r.level}`;
      d.textContent = (r.level==="fail"?"❌ ":"⚠️ ");
      if (r.level==="ok") d.textContent = "✅ ";
      d.textContent += r.text;
      recos.appendChild(d);
    }
  }

  // ---------- render data ----------
  function renderData() {
    const editor = $("#json-editor");
    const status = $("#json-status");
    const preview = $("#export-preview");

    if (editor && document.activeElement !== editor) {
      editor.value = JSON.stringify(state.data, null, 2);
    }

    state.derived.exportGame = exportGame(state.data);
    if (preview) preview.textContent = JSON.stringify(state.derived.exportGame, null, 2);

    if (status) {
      status.textContent = "✅ JSON chargé.";
      status.style.color = "var(--ok)";
    }
  }

  // ---------- recompute/render ----------
  const recomputeAndRender = debounce(() => renderAll(), 120);

  function renderAll() {
    // header toggles reflect state
    const td = $("#toggle-doubling");
    const tc = $("#toggle-crit");
    if (td) td.checked = !!state.ui.enableDoubling;
    if (tc) tc.checked = !!state.ui.enableCrit;

    renderMainList();
    renderMainPanel();
    renderDuelSelects();
    renderDuels();
    renderData();
  }

  // ---------- events ----------
  function initTabs() {
    const tabs = $("#tabs");
    if (!tabs) return;
    tabs.addEventListener("click", (e) => {
      const btn = e.target.closest(".tab");
      if (!btn) return;
      setTab(btn.dataset.tab);
    });
  }

  function initHeaderToggles() {
    $("#toggle-doubling")?.addEventListener("change", (e) => {
      state.ui.enableDoubling = e.target.checked;
      recomputeAndRender();
    });
    $("#toggle-crit")?.addEventListener("change", (e) => {
      state.ui.enableCrit = e.target.checked;
      recomputeAndRender();
    });
  }

  function initDuelsEvents() {
    $("#duel-attacker")?.addEventListener("change", (e) => { state.ui.duelAttackerId = e.target.value; recomputeAndRender(); });
    $("#duel-defender")?.addEventListener("change", (e) => { state.ui.duelDefenderId = e.target.value; recomputeAndRender(); });
    $("#duel-attacker-terrain")?.addEventListener("change", (e) => { state.ui.duelAttTerrainId = e.target.value; recomputeAndRender(); });
    $("#duel-defender-terrain")?.addEventListener("change", (e) => { state.ui.duelDefTerrainId = e.target.value; recomputeAndRender(); });
  }

  function initDataButtons() {
    $("#btn-validate")?.addEventListener("click", () => {
      const raw = $("#json-editor")?.value || "";
      try {
        const parsed = JSON.parse(raw);
        state.data = parsed;
        recomputeAndRender();
      } catch (err) {
        const st = $("#json-status");
        if (st) {
          st.textContent = `❌ JSON invalide: ${err.message}`;
          st.style.color = "var(--fail)";
        }
      }
    });

    $("#btn-reset")?.addEventListener("click", () => {
      state.data = deepClone(EXAMPLE);
      state.ui.duelAttackerId = "p1";
      state.ui.duelDefenderId = "e1";
      state.ui.mainSelectedClassId = null;
      state.ui.mainWeaponId = "iron_sword";
      recomputeAndRender();
    });

    $("#btn-copy-editor")?.addEventListener("click", async () => {
      await copyToClipboard($("#json-editor")?.value || "");
    });
    $("#btn-download-editor")?.addEventListener("click", () => {
      downloadText("balance_editor.json", $("#json-editor")?.value || "");
    });

    $("#btn-copy-game")?.addEventListener("click", async () => {
      await copyToClipboard(JSON.stringify(state.derived.exportGame, null, 2));
    });
    $("#btn-download-game")?.addEventListener("click", () => {
      downloadText("balance_game.json", JSON.stringify(state.derived.exportGame, null, 2));
    });
  }

  // ---------- boot ----------
  function boot() {
    initTabs();
    initHeaderToggles();
    initDuelsEvents();
    initDataButtons();

    // init ui from data
    state.ui.enableDoubling = !!state.data.config.enableDoubling;
    state.ui.enableCrit = !!state.data.config.enableCrit;

    renderAll();
  }

  // IMPORTANT: wait DOM
  window.addEventListener("DOMContentLoaded", boot);
})();
