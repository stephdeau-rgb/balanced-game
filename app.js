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

  function safeId(str) {
    return String(str || "").toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  }

  // ---------- example data ----------
  const EXAMPLE = {
    config: { enableDoubling: false, enableCrit: false, critMultiplier: 3 },
    classes: [
      { id: "swordsman", name: "Épéiste", role: "dps", baseStats: { hp: 18, atk: 6, def: 3, matk: 1, mdef: 2, spd: 7 } },
      { id: "lancer", name: "Lancier", role: "bruiser", baseStats: { hp: 20, atk: 6, def: 4, matk: 1, mdef: 2, spd: 5 } },
      { id: "mage", name: "Mage", role: "magic", baseStats: { hp: 16, atk: 1, def: 1, matk: 7, mdef: 3, spd: 5 } },
      { id: "priest", name: "Prêtre", role: "support", baseStats: { hp: 17, atk: 1, def: 2, matk: 5, mdef: 4, spd: 4 } },

      { id: "axe", name: "Hache", role: "physical", baseStats: { hp: 22, atk: 7, def: 3, matk: 0, mdef: 1, spd: 3 } },
      { id: "archer", name: "Archer", role: "ranged", baseStats: { hp: 18, atk: 6, def: 2, matk: 0, mdef: 2, spd: 5 } },
    ],
    weapons: [
      { id: "iron_sword", name: "Épée fer", type: "physical", might: 4, hit: 85, crit: 0, rangeMin: 1, rangeMax: 1 },
      { id: "iron_lance", name: "Lance fer", type: "physical", might: 4, hit: 80, crit: 0, rangeMin: 1, rangeMax: 1 },
      { id: "iron_axe", name: "Hache fer", type: "physical", might: 5, hit: 75, crit: 0, rangeMin: 1, rangeMax: 1 },
      { id: "bow", name: "Arc", type: "physical", might: 3, hit: 85, crit: 0, rangeMin: 2, rangeMax: 2 },
      { id: "fire", name: "Feu", type: "magic", might: 4, hit: 90, crit: 0, rangeMin: 1, rangeMax: 2 },
      { id: "blowgun", name: "Sarbacane", type: "magic", might: 1, hit: 90, crit: 0, rangeMin: 1, rangeMax: 2 },
    ],
    terrain: [
      { id: "plain", name: "Plaine", moveCost: 1, bonus: { def: 0, mdef: 0, avoid: 0 } },
      { id: "forest", name: "Forêt", moveCost: 2, bonus: { def: 1, mdef: 0, avoid: 15 } },
      { id: "fort", name: "Fort", moveCost: 2, bonus: { def: 2, mdef: 2, avoid: 10 } },
    ],
    units: [
      // players
      { id: "p1", name: "Hero", classId: "swordsman", weaponId: "iron_sword", side: "player", level: 1, position: { x: 2, y: 4 } },
      { id: "p2", name: "Priest", classId: "priest", weaponId: "blowgun", side: "player", level: 1, position: { x: 3, y: 4 } },
      { id: "p3", name: "Mage", classId: "mage", weaponId: "fire", side: "player", level: 1, position: { x: 4, y: 4 } },

      // enemies (more to show "all units")
      { id: "e1", name: "Bandit A", classId: "axe", weaponId: "iron_axe", side: "enemy", level: 1, position: { x: 7, y: 2 } },
      { id: "e2", name: "Bandit B", classId: "axe", weaponId: "iron_axe", side: "enemy", level: 1, position: { x: 8, y: 2 }, statsOverride:{ hp: 20, def: 2 } },
      { id: "e3", name: "Lancer A", classId: "lancer", weaponId: "iron_lance", side: "enemy", level: 1, position: { x: 7, y: 3 } },
      { id: "e4", name: "Archer A", classId: "archer", weaponId: "bow", side: "enemy", level: 1, position: { x: 9, y: 4 } },
      { id: "e5", name: "Mage A", classId: "mage", weaponId: "fire", side: "enemy", level: 1, position: { x: 9, y: 3 }, statsOverride:{ hp: 15, def: 1 } },
    ],
  };

  // ---------- state ----------
  const state = {
    data: deepClone(EXAMPLE),
    baseline: deepClone(EXAMPLE),
    ui: {
      tab: "main",
      enableDoubling: false,
      enableCrit: false,

      duelAttackerId: "p1",
      duelDefenderId: "e1",
      duelAttTerrainId: "plain",  // terrain for "you" in defense tables
      duelDefTerrainId: "plain",  // terrain for enemies in offense tables

      mainSelectedClassId: null,
      mainWeaponId: "iron_sword",

      weaponCloneOnTune: true,
      classPreferredWeapon: {}, // { classId: weaponId }
      weaponClonedFrom: {},     // { clonedWeaponId: originalWeaponId }
    },
    derived: { exportGame: null }
  };

  // ---------- access ----------
  const getClass = (id) => state.data.classes.find(c => c.id === id) || null;
  const getWeapon = (id) => state.data.weapons.find(w => w.id === id) || null;
  const getTerrain = (id) => state.data.terrain.find(t => t.id === id) || null;
  const getUnit = (id) => state.data.units.find(u => u.id === id) || null;

  function unitStats(unit, useData = state.data) {
    const cls = useData.classes.find(c => c.id === unit.classId);
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

  // ---------- combat ----------
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
  const pct = (x) => `${round0(x * 100)}%`;

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

  // ---------- UI helpers ----------
  function badge(level, html) {
    const cls = level === "ok" ? "ok" : level === "warn" ? "warn" : "fail";
    return `<span class="badge ${cls}">${html}</span>`;
  }
  function chip(level, title, desc) {
    const el = document.createElement("div");
    el.innerHTML = badge(level, `<b>${title}:</b> ${desc}`);
    return el.firstElementChild;
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

  // ---------- pools ----------
  function allyClassIds() {
    const ids = new Set(state.data.units.filter(u => u.side === "player").map(u => u.classId));
    return Array.from(ids).filter(id => getClass(id));
  }
  function enemyUnits() {
    return state.data.units.filter(u => u.side === "enemy");
  }
  function standardUnit() {
    const u = getUnit(state.ui.duelDefenderId);
    return u || enemyUnits()[0] || state.data.units[0] || null;
  }

  function getDefaultWeaponForClass(classId) {
    // 1) preferred in session
    const pref = state.ui.classPreferredWeapon[classId];
    if (pref && getWeapon(pref)) return pref;

    // 2) from a player unit that uses this class
    const u = state.data.units.find(x => x.side === "player" && x.classId === classId && getWeapon(x.weaponId));
    if (u) return u.weaponId;

    // 3) fallback first weapon
    return state.data.weapons[0]?.id || "";
  }

  function uniqueWeaponId(base) {
    const ids = new Set(state.data.weapons.map(w => w.id));
    let id = base;
    let i = 2;
    while (ids.has(id)) id = `${base}_${i++}`;
    return id;
  }

  function cloneWeaponForClassIfNeeded(classId, currentWeaponId) {
    if (!state.ui.weaponCloneOnTune) return currentWeaponId;

    const pref = state.ui.classPreferredWeapon[classId];
    if (pref && getWeapon(pref)) return pref;

    const original = getWeapon(currentWeaponId);
    if (!original) return currentWeaponId;

    const id = uniqueWeaponId(`${safeId(original.id)}_tuned_${safeId(classId)}`);
    const copy = deepClone(original);
    copy.id = id;
    copy.name = `${original.name} (tuned ${classId})`;

    state.data.weapons.push(copy);
    state.ui.classPreferredWeapon[classId] = copy.id;
    state.ui.weaponClonedFrom[copy.id] = original.id;

    return copy.id;
  }

  // ---------- verdict rules (simple) ----------
  function verdictFromHit(hit) {
    if (hit >= 0.7 && hit <= 0.9) return "ok";
    if (hit >= 0.6 && hit <= 0.95) return "warn";
    return "fail";
  }
  function verdictFromTTK(ttk) {
    if (ttk >= 2 && ttk <= 3) return "ok";
    if (ttk >= 1.5 && ttk <= 4) return "warn";
    return "fail";
  }
  function verdictFromTTD(ttd) {
    // “tours avant mort” (défense) — cible ~2.5–5 en early (ajuste tes seuils plus tard)
    if (ttd >= 2.5 && ttd <= 5.5) return "ok";
    if (ttd >= 1.8 && ttd <= 7) return "warn";
    return "fail";
  }
  function worstVerdict(...vs) {
    if (vs.includes("fail")) return "fail";
    if (vs.includes("warn")) return "warn";
    return "ok";
  }

  // ---------- evaluations ----------
  function tempUnitFromClass(classId, weaponId) {
    return { id: "tmp", name: "TMP", classId, weaponId, side: "player", level: 1, position: { x: 0, y: 0 } };
  }

  function evaluateVsStandard(classId, weaponId) {
    const std = standardUnit();
    if (!std) return { error: "Aucun standard dispo." };

    const attacker = tempUnitFromClass(classId, weaponId);
    const sim = simulateAttack(attacker, std, state.ui.duelDefTerrainId);
    if (!sim) return { error: "Simulation impossible." };

    const stdHp = unitStats(std)?.hp ?? 1;
    const ttk = TTK(stdHp, sim.expectedDamage);

    const vHit = verdictFromHit(sim.hitChance);
    const vTTK = verdictFromTTK(ttk);
    const vDmg = sim.dmg > 0 ? "ok" : "fail";
    const vExp = sim.expectedDamage > 0 ? "ok" : "fail";

    const breaks = [];
    if (sim.dmg === 0) breaks.push({ level: "fail", text: "Dégâts = 0 → progression bloquée sur ce standard." });
    if (sim.hitChance < 0.5) breaks.push({ level: "warn", text: "Hit < 50% → frustration (trop d’échecs)." });
    if (ttk < 1.2 && sim.expectedDamage > 0) breaks.push({ level: "warn", text: "One-shot probable → trop punitif." });
    if (ttk > 4) breaks.push({ level: "warn", text: "TTK > 4 → combats trop longs (ennui)." });
    if (!breaks.length) breaks.push({ level: "ok", text: "Pas d’alerte majeure détectée." });

    return { sim, std, stdHp, ttk, vHit, vTTK, vDmg, vExp, breaks };
  }

  function evalOffenseRows(classId, weaponId) {
    const enemies = enemyUnits();
    const rows = [];

    for (const e of enemies) {
      const attacker = tempUnitFromClass(classId, weaponId);
      const sim = simulateAttack(attacker, e, state.ui.duelDefTerrainId);
      if (!sim) continue;
      const hp = unitStats(e)?.hp ?? 1;
      const ttk = TTK(hp, sim.expectedDamage);

      const v = worstVerdict(verdictFromHit(sim.hitChance), verdictFromTTK(ttk), sim.dmg > 0 ? "ok" : "fail");
      rows.push({
        enemy: e,
        hit: sim.hitChance,
        dmg: sim.dmg,
        exp: sim.expectedDamage,
        ttk,
        verdict: v
      });
    }
    return rows;
  }

  function evalDefenseRows(classId, weaponId) {
    // on simule: chaque ennemi attaque un “toi” (temp unit)
    // weaponId ici n’est pas utilisé pour la défense (c’est l’arme de l’ennemi qui compte),
    // mais on le garde pour la cohérence d’API.
    const enemies = enemyUnits();
    const defender = tempUnitFromClass(classId, weaponId);
    const defStats = unitStats(defender);
    if (!defStats) return [];

    const rows = [];
    for (const e of enemies) {
      const sim = simulateAttack(e, defender, state.ui.duelAttTerrainId); // terrain du “toi”
      if (!sim) continue;

      const hp = defStats.hp ?? 1;
      const ttd = TTK(hp, sim.expectedDamage); // turns-to-die (approx)
      const v = worstVerdict(verdictFromHit(sim.hitChance), verdictFromTTD(ttd), sim.dmg > 0 ? "ok" : "warn");
      rows.push({
        enemy: e,
        hit: sim.hitChance,
        dmg: sim.dmg,
        expIn: sim.expectedDamage,
        ttd,
        verdict: v
      });
    }
    return rows;
  }

  function summarizeOffense(rows) {
    const hits = rows.map(r => r.hit);
    const exps = rows.map(r => r.exp);
    const ttks = rows.map(r => r.ttk).filter(Number.isFinite);
    const zeroDmg = rows.filter(r => r.dmg === 0).length;
    const oneshot = rows.filter(r => r.ttk < 1.2 && Number.isFinite(r.ttk)).length;

    const avg = (a) => a.length ? a.reduce((x,y)=>x+y,0)/a.length : 0;
    const min = (a) => a.length ? Math.min(...a) : 0;
    const max = (a) => a.length ? Math.max(...a) : 0;

    return {
      count: rows.length,
      hitAvg: avg(hits), hitMin: min(hits), hitMax: max(hits),
      expAvg: avg(exps), expMin: min(exps), expMax: max(exps),
      ttkAvg: avg(ttks), ttkMin: min(ttks), ttkMax: max(ttks),
      zeroPct: rows.length ? zeroDmg/rows.length : 0,
      oneshotPct: rows.length ? oneshot/rows.length : 0,
      worstTTK: rows.reduce((w,r)=> (r.ttk>w.ttk? r : w), rows[0] || null),
      bestTTK: rows.reduce((b,r)=> (r.ttk<b.ttk? r : b), rows[0] || null),
    };
  }

  function summarizeDefense(rows) {
    const hits = rows.map(r => r.hit);
    const exps = rows.map(r => r.expIn);
    const ttds = rows.map(r => r.ttd).filter(Number.isFinite);

    const avg = (a) => a.length ? a.reduce((x,y)=>x+y,0)/a.length : 0;
    const min = (a) => a.length ? Math.min(...a) : 0;
    const max = (a) => a.length ? Math.max(...a) : 0;

    return {
      count: rows.length,
      hitAvg: avg(hits), hitMin: min(hits), hitMax: max(hits),
      expAvg: avg(exps), expMin: min(exps), expMax: max(exps),
      ttdAvg: avg(ttds), ttdMin: min(ttds), ttdMax: max(ttds),
      worstTTD: rows.reduce((w,r)=> (r.ttd<w.ttd? r : w), rows[0] || null),
      bestTTD: rows.reduce((b,r)=> (r.ttd>b.ttd? r : b), rows[0] || null),
    };
  }

  function globalVerdictFromSummaries(off, def) {
    // simple: vise hitAvg ok-ish + ttkAvg ok-ish + ttdAvg ok-ish
    const vHit = verdictFromHit(off.hitAvg);
    const vTTK = verdictFromTTK(off.ttkAvg);
    const vTTD = verdictFromTTD(def.ttdAvg);
    const vZero = off.zeroPct <= 0.05 ? "ok" : (off.zeroPct <= 0.15 ? "warn" : "fail");
    const vOneShot = off.oneshotPct <= 0.20 ? "ok" : (off.oneshotPct <= 0.35 ? "warn" : "fail");
    return worstVerdict(vHit, vTTK, vTTD, vZero, vOneShot);
  }

  // ---------- tabs ----------
  function setTab(tab) {
    state.ui.tab = tab;
    $$(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
    $$(".tabpane").forEach(p => p.classList.toggle("active", p.id === `tab-${tab}`));
  }

  // ---------- DUELS ----------
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

    root.appendChild(indicatorRow("Hit", pct(sim.hitChance), sim.hitChance < 0.5 ? "warn" : "ok",
      "Fiabilité. Trop bas = frustration."));
    root.appendChild(indicatorRow("Dégâts (si ça touche)", `${sim.dmg}`, sim.dmg === 0 ? "fail" : "ok",
      "Si 0 → tu ne peux pas gagner."));
    root.appendChild(indicatorRow("Dégâts attendus", `${round2(sim.expectedDamage)}`, sim.expectedDamage <= 0 ? "fail" : "ok",
      "Rythme réel: hit × dégâts × attaques."));
    root.appendChild(indicatorRow("TTK", `${Number.isFinite(ttk)? round2(ttk):"∞"}`, ttk>3 ? "warn":"ok",
      "Tempo. Vise ~2–3 sur standard."));

    const list = [];
    if (sim.dmg === 0) list.push({ level:"fail", text:"Baisse DEF/MDEF standard (ou terrain) ou augmente Might/ATK/MATK." });
    if (sim.hitChance < 0.7) list.push({ level:"warn", text:"Augmente Hit arme (+5 à +10) ou baisse Avoid terrain." });
    if (ttk > 3) list.push({ level:"warn", text:"+1 Might ou -1 DEF/MDEF standard." });
    if (!list.length) list.push({ level:"ok", text:"RAS sur ce duel (selon tes seuils)." });

    for (const r of list) {
      const d = document.createElement("div");
      d.className = `badge ${r.level}`;
      d.textContent = (r.level==="fail"?"❌ ":"⚠️ ");
      if (r.level==="ok") d.textContent = "✅ ";
      d.textContent += r.text;
      recos.appendChild(d);
    }
  }

  // ---------- MAIN ----------
  function renderMainList() {
    const root = $("#ally-class-list");
    if (!root) return;

    const ids = allyClassIds();
    if (!ids.length) {
      root.innerHTML = `<div class="badge warn">⚠️ Aucune classe alliée.</div>`;
      return;
    }

    if (!state.ui.mainSelectedClassId || !getClass(state.ui.mainSelectedClassId)) {
      state.ui.mainSelectedClassId = ids[0];
      state.ui.mainWeaponId = getDefaultWeaponForClass(ids[0]);
    }

    root.innerHTML = "";
    for (const id of ids) {
      const c = getClass(id);
      const el = document.createElement("div");
      el.className = "list-item" + (id === state.ui.mainSelectedClassId ? " active" : "");
      const wId = state.ui.classPreferredWeapon[id] || getDefaultWeaponForClass(id);
      const w = getWeapon(wId);
      el.innerHTML = `
        <div class="list-title">${c.name}</div>
        <div class="list-sub">id: ${c.id} · arme: ${w ? w.name : "—"}</div>
      `;
      el.addEventListener("click", () => {
        state.ui.mainSelectedClassId = id;
        state.ui.mainWeaponId = getDefaultWeaponForClass(id);
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

    // weapon clone toggle
    const tClone = $("#toggle-weapon-clone");
    if (tClone) {
      tClone.checked = !!state.ui.weaponCloneOnTune;
      tClone.onchange = (e) => {
        state.ui.weaponCloneOnTune = e.target.checked;
        renderAll();
      };
    }

    // weapon select
    state.ui.mainWeaponId = getDefaultWeaponForClass(c.id);
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
        state.ui.classPreferredWeapon[c.id] = state.ui.mainWeaponId;
        renderAll();
      };
    }

    const w = getWeapon(state.ui.mainWeaponId);

    // dmg type
    const dmgType = $("#main-dmg-type");
    if (dmgType) dmgType.textContent = w ? (w.type === "magic" ? "Magique (MATK vs MDEF)" : "Physique (ATK vs DEF)") : "—";

    // weapon note
    const note = $("#main-weapon-note");
    if (note) {
      const from = state.ui.weaponClonedFrom[state.ui.mainWeaponId];
      note.textContent = from ? `Copie (depuis ${from})` : "Original (global)";
      note.className = "badge " + (from ? "warn" : "ok");
    }

    // class stat sliders
    const statsRoot = $("#main-stats-sliders");
    if (statsRoot) {
      statsRoot.innerHTML = "";
      const bs = c.baseStats;
      const keys = [
        ["HP", "hp", 1, 70],
        ["ATK", "atk", 0, 35],
        ["DEF", "def", 0, 35],
        ["MATK", "matk", 0, 35],
        ["MDEF", "mdef", 0, 35],
        ["SPD", "spd", 0, 35],
      ];
      for (const [label, key, min, max] of keys) {
        statsRoot.appendChild(sliderRow(label, min, max, 1, n(bs[key], 0), (val) => {
          bs[key] = val;
          recomputeAndRender();
        }));
      }
    }

    // weapon sliders (with clone-on-first-change)
    const wRoot = $("#main-weapon-sliders");
    if (wRoot) {
      wRoot.innerHTML = "";
      if (!w) {
        wRoot.innerHTML = `<div class="badge fail">❌ Arme introuvable</div>`;
      } else {
        const onWeaponChange = (mutator) => {
          const newId = cloneWeaponForClassIfNeeded(c.id, state.ui.mainWeaponId);
          if (newId !== state.ui.mainWeaponId) {
            state.ui.mainWeaponId = newId;
            state.ui.classPreferredWeapon[c.id] = newId;
          }
          const weapon = getWeapon(state.ui.mainWeaponId);
          mutator(weapon);
          recomputeAndRender();
        };

        wRoot.appendChild(sliderRow("Might", -2, 14, 1, n(w.might, 0), (val) => onWeaponChange((weapon)=>weapon.might = val)));
        wRoot.appendChild(sliderRow("Hit", 40, 100, 1, n(w.hit, 0), (val) => onWeaponChange((weapon)=>weapon.hit = val)));
        wRoot.appendChild(sliderRow("Crit", 0, 30, 1, n(w.crit, 0), (val) => onWeaponChange((weapon)=>weapon.crit = val)));
      }
    }

    // indicators vs standard
    const indicators = $("#main-indicators");
    const alerts = $("#main-break-alerts");
    const recos = $("#main-recos");
    if (!indicators || !alerts || !recos) return;

    indicators.innerHTML = "";
    alerts.innerHTML = "";
    recos.innerHTML = "";

    const stdRes = evaluateVsStandard(c.id, state.ui.mainWeaponId);
    if (stdRes.error) {
      indicators.innerHTML = `<div class="badge fail">❌ ${stdRes.error}</div>`;
      return;
    }

    indicators.appendChild(indicatorRow("Hit", pct(stdRes.sim.hitChance), verdictFromHit(stdRes.sim.hitChance),
      "Pourquoi: trop bas → tu rates souvent → frustration."));
    indicators.appendChild(indicatorRow("Dégâts attendus", `${round2(stdRes.sim.expectedDamage)}`, stdRes.sim.expectedDamage>0?"ok":"fail",
      "Pourquoi: c’est le vrai rythme (Hit × Dégâts × attaques)."));
    indicators.appendChild(indicatorRow("TTK", `${Number.isFinite(stdRes.ttk)? round2(stdRes.ttk):"∞"}`, verdictFromTTK(stdRes.ttk),
      "Pourquoi: tempo. Trop long=ennui, trop court=trop punitif."));
    indicators.appendChild(indicatorRow("Dégâts (si ça touche)", `${stdRes.sim.dmg}`, stdRes.sim.dmg>0?"ok":"fail",
      "Pourquoi: si 0 → progression bloquée."));

    for (const b of stdRes.breaks) {
      const d = document.createElement("div");
      d.className = `badge ${b.level}`;
      d.textContent = (b.level==="fail"?"❌ ":"⚠️ ");
      if (b.level==="ok") d.textContent = "✅ ";
      d.textContent += b.text;
      alerts.appendChild(d);
    }

    // OFFENSE table + summary
    const offRows = evalOffenseRows(c.id, state.ui.mainWeaponId);
    const offSum = summarizeOffense(offRows);
    renderOffense(offRows, offSum);

    // DEFENSE table + summary
    const defRows = evalDefenseRows(c.id, state.ui.mainWeaponId);
    const defSum = summarizeDefense(defRows);
    renderDefense(defRows, defSum);

    // RECO = based on worst cases
    const vGlobal = globalVerdictFromSummaries(offSum, defSum);

    if (!enemyUnits().length) {
      const d = document.createElement("div");
      d.className = "badge fail";
      d.textContent = "❌ Pas d’ennemis dans units[] → impossible de juger le global.";
      recos.appendChild(d);
      return;
    }

    recos.appendChild(chip(vGlobal, "Verdict global", vGlobal === "ok" ? "Cohérent (selon seuils)." : "À ajuster."));

    // worst offense / defense
    if (offSum.worstTTK) {
      const e = offSum.worstTTK.enemy;
      recos.appendChild(chip("warn", "Pire TTK", `${e.name}: ${Number.isFinite(offSum.worstTTK.ttk)?round2(offSum.worstTTK.ttk):"∞"} (trop long = ennui)`));
    }
    if (defSum.worstTTD) {
      const e = defSum.worstTTD.enemy;
      recos.appendChild(chip("warn", "Plus dangereux", `${e.name}: TTD ${Number.isFinite(defSum.worstTTD.ttd)?round2(defSum.worstTTD.ttd):"∞"} (tu meurs vite)`));
    }

    // actionable suggestions (simple)
    if (offSum.zeroPct > 0.05) recos.appendChild(chip("fail", "Action", "Tu as des cas à 0 dégâts: augmente Might/ATK/MATK ou baisse DEF/MDEF ennemis."));
    if (offSum.hitAvg < 0.7) recos.appendChild(chip("warn", "Action", "Hit moyen trop bas: augmente Hit des armes (+5/+10) ou baisse Avoid terrain."));
    if (offSum.ttkAvg > 3.6) recos.appendChild(chip("warn", "Action", "Tu tues trop lentement: +1 Might (arme) ou +1 ATK/MATK (classe)."));
    if (offSum.ttkAvg < 1.6) recos.appendChild(chip("warn", "Action", "Tu tues trop vite: baisse Might/ATK/MATK ou augmente HP/DEF ennemis."));
    if (defSum.ttdAvg < 2.0) recos.appendChild(chip("warn", "Action", "Tu meurs trop vite: +HP/+DEF/+MDEF ou réduis Might ennemie."));
  }

  function renderOffense(rows, sum) {
    const sumRoot = $("#main-off-summary");
    const table = $("#main-off-table");
    const tbody = table?.querySelector("tbody");
    if (!sumRoot || !tbody) return;

    sumRoot.innerHTML = "";
    if (!rows.length) {
      sumRoot.appendChild(chip("fail", "Aucun ennemi", "Ajoute des unités enemy."));
      tbody.innerHTML = "";
      return;
    }

    const v = verdictFromTTK(sum.ttkAvg);
    const vH = verdictFromHit(sum.hitAvg);
    const vZ = sum.zeroPct <= 0.05 ? "ok" : (sum.zeroPct <= 0.15 ? "warn" : "fail");
    const vO = sum.oneshotPct <= 0.20 ? "ok" : (sum.oneshotPct <= 0.35 ? "warn" : "fail");
    const vGlobal = worstVerdict(v, vH, vZ, vO);

    sumRoot.appendChild(chip(vGlobal, "Verdict", vGlobal === "ok" ? "Global cohérent." : "À surveiller / ajuster."));
    sumRoot.appendChild(chip(vH, "Hit moyen", `${pct(sum.hitAvg)} (min ${pct(sum.hitMin)} / max ${pct(sum.hitMax)})`));
    sumRoot.appendChild(chip(v, "TTK moyen", `${round2(sum.ttkAvg)} (min ${round2(sum.ttkMin)} / max ${round2(sum.ttkMax)})`));
    sumRoot.appendChild(chip("ok", "Dmg attendu moyen", `${round2(sum.expAvg)} (min ${round2(sum.expMin)} / max ${round2(sum.expMax)})`));
    sumRoot.appendChild(chip(vZ, "0 dmg", `${pct(sum.zeroPct)} (cas impossibles)`));
    sumRoot.appendChild(chip(vO, "One-shot", `${pct(sum.oneshotPct)} (trop punitif)`));

    tbody.innerHTML = "";
    for (const r of rows) {
      const vRow = worstVerdict(verdictFromHit(r.hit), verdictFromTTK(r.ttk), r.dmg > 0 ? "ok" : "fail");
      const verdictText = vRow === "ok" ? "OK" : vRow === "warn" ? "Warning" : "Fail";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><b>${r.enemy.name}</b> <span class="hint">(${r.enemy.classId})</span></td>
        <td>${pct(r.hit)}</td>
        <td>${r.dmg}</td>
        <td>${round2(r.exp)}</td>
        <td>${Number.isFinite(r.ttk) ? round2(r.ttk) : "∞"}</td>
        <td>${badge(vRow, verdictText)}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  function renderDefense(rows, sum) {
    const sumRoot = $("#main-def-summary");
    const table = $("#main-def-table");
    const tbody = table?.querySelector("tbody");
    if (!sumRoot || !tbody) return;

    sumRoot.innerHTML = "";
    if (!rows.length) {
      sumRoot.appendChild(chip("fail", "Aucun ennemi", "Ajoute des unités enemy."));
      tbody.innerHTML = "";
      return;
    }

    const vTTD = verdictFromTTD(sum.ttdAvg);
    const vHit = verdictFromHit(sum.hitAvg);
    const vGlobal = worstVerdict(vTTD, vHit);

    sumRoot.appendChild(chip(vGlobal, "Verdict", vGlobal === "ok" ? "Survie cohérente." : "À ajuster."));
    sumRoot.appendChild(chip(vHit, "Hit entrant moyen", `${pct(sum.hitAvg)} (min ${pct(sum.hitMin)} / max ${pct(sum.hitMax)})`));
    sumRoot.appendChild(chip(vTTD, "TTD moyen", `${round2(sum.ttdAvg)} (min ${round2(sum.ttdMin)} / max ${round2(sum.ttdMax)})`));
    sumRoot.appendChild(chip("ok", "Dmg entrant attendu", `${round2(sum.expAvg)} (min ${round2(sum.expMin)} / max ${round2(sum.expMax)})`));

    tbody.innerHTML = "";
    for (const r of rows) {
      const vRow = worstVerdict(verdictFromHit(r.hit), verdictFromTTD(r.ttd));
      const verdictText = vRow === "ok" ? "OK" : vRow === "warn" ? "Warning" : "Fail";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><b>${r.enemy.name}</b> <span class="hint">(${r.enemy.classId})</span></td>
        <td>${pct(r.hit)}</td>
        <td>${r.dmg}</td>
        <td>${round2(r.expIn)}</td>
        <td>${Number.isFinite(r.ttd) ? round2(r.ttd) : "∞"}</td>
        <td>${badge(vRow, verdictText)}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  // ---------- GENERAL ----------
  function renderGeneral() {
    const sumRoot = $("#general-summary");
    const table = $("#general-table");
    const tbody = table?.querySelector("tbody");
    if (!sumRoot || !tbody) return;

    const ids = allyClassIds();
    const enemies = enemyUnits();

    sumRoot.innerHTML = "";
    if (!ids.length) {
      sumRoot.appendChild(chip("fail", "Aucune classe", "Ajoute des unités player."));
      tbody.innerHTML = "";
      return;
    }
    if (!enemies.length) {
      sumRoot.appendChild(chip("fail", "Aucun ennemi", "Ajoute des unités enemy."));
      tbody.innerHTML = "";
      return;
    }

    sumRoot.appendChild(chip("ok", "Classes analysées", `${ids.length}`));
    sumRoot.appendChild(chip("ok", "Ennemis analysés", `${enemies.length}`));
    sumRoot.appendChild(chip("ok", "Terrains", `Ennemi=${state.ui.duelDefTerrainId} / Toi=${state.ui.duelAttTerrainId}`));

    tbody.innerHTML = "";

    for (const classId of ids) {
      const cls = getClass(classId);
      const weaponId = getDefaultWeaponForClass(classId);
      const w = getWeapon(weaponId);

      const offRows = evalOffenseRows(classId, weaponId);
      const defRows = evalDefenseRows(classId, weaponId);
      const offSum = summarizeOffense(offRows);
      const defSum = summarizeDefense(defRows);

      const v = globalVerdictFromSummaries(offSum, defSum);
      const vText = v === "ok" ? "OK" : v === "warn" ? "Warning" : "Fail";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><b>${cls?.name || classId}</b> <span class="hint">(${classId})</span></td>
        <td>${w ? w.name : "—"}</td>
        <td>${pct(offSum.hitAvg)}</td>
        <td>${round2(offSum.ttkAvg)}</td>
        <td>${round2(defSum.ttdAvg)}</td>
        <td>${pct(offSum.zeroPct)}</td>
        <td>${pct(offSum.oneshotPct)}</td>
        <td>${badge(v, vText)}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  // ---------- DATA ----------
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

  // ---------- render loop ----------
  const recomputeAndRender = debounce(() => renderAll(), 120);

  function renderAll() {
    const td = $("#toggle-doubling");
    const tc = $("#toggle-crit");
    if (td) td.checked = !!state.ui.enableDoubling;
    if (tc) tc.checked = !!state.ui.enableCrit;

    renderMainList();
    renderMainPanel();
    renderGeneral();
    renderDuelSelects();
    renderDuels();
    renderData();
  }

  // ---------- events ----------
  function initTabs() {
    $("#tabs")?.addEventListener("click", (e) => {
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
        state.baseline = deepClone(parsed);

        // reset session maps
        state.ui.classPreferredWeapon = {};
        state.ui.weaponClonedFrom = {};

        // best effort defaults
        if (!getUnit(state.ui.duelDefenderId)) {
          const e = state.data.units.find(u => u.side === "enemy") || state.data.units[0];
          if (e) state.ui.duelDefenderId = e.id;
        }
        if (!getUnit(state.ui.duelAttackerId)) {
          const p = state.data.units.find(u => u.side === "player") || state.data.units[0];
          if (p) state.ui.duelAttackerId = p.id;
        }

        // reset main selection
        state.ui.mainSelectedClassId = null;
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
      state.baseline = deepClone(EXAMPLE);

      state.ui.duelAttackerId = "p1";
      state.ui.duelDefenderId = "e1";
      state.ui.duelAttTerrainId = "plain";
      state.ui.duelDefTerrainId = "plain";

      state.ui.mainSelectedClassId = null;
      state.ui.mainWeaponId = "iron_sword";

      state.ui.classPreferredWeapon = {};
      state.ui.weaponClonedFrom = {};

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

  function initResetClassButton() {
    $("#btn-reset-class")?.addEventListener("click", () => {
      const classId = state.ui.mainSelectedClassId;
      if (!classId) return;

      const baseC = state.baseline.classes.find(c => c.id === classId);
      const liveC = state.data.classes.find(c => c.id === classId);
      if (baseC && liveC) liveC.baseStats = deepClone(baseC.baseStats);

      delete state.ui.classPreferredWeapon[classId];
      recomputeAndRender();
    });
  }

  // ---------- boot ----------
  function boot() {
    initTabs();
    initHeaderToggles();
    initDuelsEvents();
    initDataButtons();
    initResetClassButton();

    state.ui.enableDoubling = !!state.data.config.enableDoubling;
    state.ui.enableCrit = !!state.data.config.enableCrit;
    state.ui.weaponCloneOnTune = true;

    renderAll();
  }

  window.addEventListener("DOMContentLoaded", boot);
})();
