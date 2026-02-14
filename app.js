// app.js — FE-like Balance Lab (V2 UI simplifiée + explications simples)
//
// Objectif UI simplifiée:
// - moins d'écrans "chargés"
// - hiérarchie claire: config duel → résultats → recos → tables
// - "Analyse avancée" dans un <details> repliable
// - Données: JSON + édition rapide (accordéons)
//
// Notes:
// - 100% vanilla, offline
// - fonctions pures pour le calcul
// - rendu debounced

(function () {
  "use strict";

  // ----------------------------
  // Utils
  // ----------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const round2 = (n) => Math.round(n * 100) / 100;
  const round0 = (n) => Math.round(n);
  const safeNum = (v, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  function debounce(fn, ms = 120) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        return true;
      } catch {
        return false;
      } finally {
        ta.remove();
      }
    }
  }

  function uid(prefix) {
    return `${prefix}_${Math.random().toString(16).slice(2, 8)}`;
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
  function escapeAttr(s) {
    return escapeHtml(s).replaceAll("\n", " ");
  }

  // ----------------------------
  // Exemple de données internes
  // ----------------------------
  const EXAMPLE_DATA = {
    meta: { version: "2.0", name: "Example Balance Set", createdAt: new Date().toISOString() },
    config: { enableDoubling: false, enableCrit: false, critMultiplier: 3, baseAvoid: 0 },
    designNotes:
      "Notes ici : décisions, TODO, hypothèses…\n\nEx: On vise TTK 2–3 sur l'ennemi standard. Le prêtre doit faire 1–3 dégâts attendus pour rester utile sans voler la vedette.",
    classes: [
      { id: "swordsman", name: "Épéiste", role: "dps", baseStats: { hp: 18, atk: 6, def: 3, matk: 1, mdef: 2, spd: 7 } },
      { id: "lancer", name: "Lancier", role: "bruiser", baseStats: { hp: 20, atk: 6, def: 4, matk: 1, mdef: 2, spd: 5 } },
      { id: "axe", name: "Hache", role: "breaker", baseStats: { hp: 22, atk: 7, def: 4, matk: 0, mdef: 1, spd: 4 } },
      { id: "mage", name: "Mage", role: "magic", baseStats: { hp: 16, atk: 1, def: 1, matk: 7, mdef: 3, spd: 5 } },
      { id: "priest", name: "Prêtre", role: "support", baseStats: { hp: 17, atk: 1, def: 2, matk: 5, mdef: 4, spd: 4 } },
      { id: "archer", name: "Archer", role: "ranged", baseStats: { hp: 18, atk: 6, def: 2, matk: 0, mdef: 2, spd: 6 } },
    ],
    weapons: [
      { id: "iron_sword", name: "Épée fer", type: "physical", might: 4, hit: 85, crit: 0, rangeMin: 1, rangeMax: 1 },
      { id: "iron_lance", name: "Lance fer", type: "physical", might: 4, hit: 80, crit: 0, rangeMin: 1, rangeMax: 1 },
      { id: "iron_axe", name: "Hache fer", type: "physical", might: 5, hit: 75, crit: 0, rangeMin: 1, rangeMax: 1 },
      { id: "fire", name: "Feu", type: "magic", might: 4, hit: 90, crit: 0, rangeMin: 1, rangeMax: 2 },
      { id: "staff_heal", name: "Soin", type: "heal", might: 5, hit: 100, crit: 0, rangeMin: 1, rangeMax: 1 },
      { id: "blowgun", name: "Sarbacane (début)", type: "magic", might: 1, hit: 90, crit: 0, rangeMin: 1, rangeMax: 2, specialRules: ["debuff_lvl1"] },
      { id: "bow", name: "Arc simple", type: "physical", might: 3, hit: 85, crit: 0, rangeMin: 2, rangeMax: 2 },
    ],
    terrain: [
      { id: "plain", name: "Plaine", moveCost: 1, bonus: { def: 0, mdef: 0, avoid: 0 } },
      { id: "forest", name: "Forêt", moveCost: 2, bonus: { def: 1, mdef: 0, avoid: 15 } },
      { id: "fort", name: "Fort", moveCost: 2, bonus: { def: 2, mdef: 2, avoid: 10 } },
    ],
    units: [
      { id: "p1", name: "Hero", classId: "swordsman", weaponId: "iron_sword", side: "player", level: 1, position: { x: 2, y: 4 } },
      { id: "p2", name: "Priest", classId: "priest", weaponId: "blowgun", side: "player", level: 1, position: { x: 3, y: 4 } },
      { id: "p3", name: "Lancier", classId: "lancer", weaponId: "iron_lance", side: "player", level: 1, position: { x: 1, y: 4 } },
      { id: "e1", name: "Bandit A", classId: "axe", weaponId: "iron_axe", side: "enemy", level: 1, position: { x: 6, y: 2 } },
      { id: "e2", name: "Bandit B", classId: "axe", weaponId: "iron_axe", side: "enemy", level: 1, position: { x: 7, y: 2 } },
      { id: "e3", name: "Archer E", classId: "archer", weaponId: "bow", side: "enemy", level: 1, position: { x: 7, y: 3 } },
    ],
    stages: [
      {
        id: "stage1",
        name: "Stage 1 (minimal)",
        width: 10,
        height: 7,
        terrainGrid: [
          "plain","plain","plain","plain","plain","plain","plain","plain","plain","plain",
          "plain","forest","forest","plain","plain","plain","plain","plain","plain","plain",
          "plain","forest","fort","plain","plain","plain","plain","plain","plain","plain",
          "plain","plain","plain","plain","plain","plain","plain","plain","forest","plain",
          "plain","plain","plain","plain","plain","plain","plain","plain","forest","plain",
          "plain","plain","plain","plain","plain","plain","plain","plain","plain","plain",
          "plain","plain","plain","plain","plain","plain","plain","plain","plain","plain",
        ],
        units: ["p1","p2","p3","e1","e2","e3"],
        reinforcements: [],
      }
    ],
    checklist: [
      { id: "ttk_standard", label: "TTK ennemi standard entre 2 et 3 attaques", metric: "ttk_vs_standard_avg", min: 2, max: 3, severity: "core" },
      { id: "hit_avg", label: "Hit chance moyenne entre 70% et 90%", metric: "hit_vs_standard_avg", min: 0.70, max: 0.90, severity: "core" },
      { id: "priest_damage", label: "Prêtre dégâts attendus 1–3 sur MDEF (si arme magic)", metric: "priest_expected_damage", min: 1, max: 3, severity: "core" },
      { id: "mage_damage", label: "Mage dégâts attendus 4–9 mais EHP faible", metric: "mage_expected_damage", min: 4, max: 9, severity: "core", extra: { checkMageEhpMax: 22 } },
      { id: "tank_survive", label: "Tank survit 4–6 attaques standard", metric: "tank_survive_hits", min: 4, max: 6, severity: "core" },
    ]
  };

  // ----------------------------
  // State
  // ----------------------------
  const state = {
    data: deepClone(EXAMPLE_DATA),
    ui: {
      tab: "data",
      duelAttackerId: "p1",
      duelDefenderId: "e1",
      duelAttTerrainId: "plain",
      duelDefTerrainId: "plain",
      stageId: "stage1",
      macroRadius: 6,
      compareScope: "player",
      compareMode: "vsStandard",
      enableDoubling: false,
      enableCrit: false,
      tuning: { weaponType: "all", mightDelta: 0, enemyClassId: "axe", defDelta: 0, mdefDelta: 0, hpDelta: 0, enableDoubling: false, enableCrit: false },
      tuningLog: [],
    },
    derived: { errors: [], gameExport: null, micro: null, checklist: null, macro: null }
  };

  // ----------------------------
  // Phrases simples (pourquoi / action)
  // ----------------------------
  const EXPLAIN = {
    hitAvg: {
      why: "Hit = fiabilité. Si c’est bas, le joueur subit le hasard.",
      good: "70–90% en moyenne = fiable sans être automatique.",
      fix: "Action: +hit sur armes, ou -avoid terrain/cible."
    },
    expDmg: {
      why: "Dégâts attendus = rythme réel (hit × dégâts × attaques).",
      good: "Stable = tu peux calibrer la difficulté facilement.",
      fix: "Action: +/- might, +/- DEF/MDEF, +/- HP."
    },
    ttk: {
      why: "TTK = tempo. Trop court = one-shot. Trop long = répétitif.",
      good: "2–3 sur le standard = bon rythme.",
      fix: "Action: si trop long → +might ou -DEF/MDEF. Si trop court → +HP/+DEF ou -might."
    }
  };

  // ----------------------------
  // Access helpers
  // ----------------------------
  const getClass = (d, id) => d.classes.find(c => c.id === id) || null;
  const getWeapon = (d, id) => d.weapons.find(w => w.id === id) || null;
  const getTerrain = (d, id) => d.terrain.find(t => t.id === id) || null;
  const getUnit = (d, id) => d.units.find(u => u.id === id) || null;
  const getStage = (d, id) => d.stages.find(s => s.id === id) || null;

  // ----------------------------
  // Core: stats & combat (purs)
  // ----------------------------
  function computeUnitStats(data, unit) {
    const cls = getClass(data, unit.classId);
    if (!cls) return null;
    const base = cls.baseStats || {};
    const ovr = unit.statsOverride || {};
    return {
      hp: safeNum(ovr.hp, safeNum(base.hp, 0)),
      atk: safeNum(ovr.atk, safeNum(base.atk, 0)),
      def: safeNum(ovr.def, safeNum(base.def, 0)),
      matk: safeNum(ovr.matk, safeNum(base.matk, 0)),
      mdef: safeNum(ovr.mdef, safeNum(base.mdef, 0)),
      spd: safeNum(ovr.spd, safeNum(base.spd, 0)),
    };
  }

  function applyTerrainToDefender(defStats, terrain) {
    const bonus = terrain?.bonus || { def: 0, mdef: 0, avoid: 0 };
    return {
      ...defStats,
      def: defStats.def + safeNum(bonus.def, 0),
      mdef: defStats.mdef + safeNum(bonus.mdef, 0),
      avoid: safeNum(bonus.avoid, 0),
    };
  }

  function computeHitChance(weapon, defenderStatsWithAvoid) {
    const baseHit = safeNum(weapon.hit, 0);
    const avoid = safeNum(defenderStatsWithAvoid.avoid, 0);
    return clamp01((baseHit - avoid) / 100);
  }

  function computeAttacksCount(attackerStats, defenderStats, enableDoubling) {
    if (!enableDoubling) return 1;
    return attackerStats.spd >= defenderStats.spd + 4 ? 2 : 1;
  }

  function simulateAttack(attackerUnit, defenderUnit, context) {
    const data = context.data;
    const aStats = computeUnitStats(data, attackerUnit);
    const dStatsBase = computeUnitStats(data, defenderUnit);
    const weapon = getWeapon(data, attackerUnit.weaponId);
    if (!aStats || !dStatsBase || !weapon) return null;

    const defTerrain = getTerrain(data, context.defenderTerrainId);
    const dStats = applyTerrainToDefender(dStatsBase, defTerrain);

    const hitChance = computeHitChance(weapon, dStats);
    const attacksCount = computeAttacksCount(aStats, dStatsBase, context.enableDoubling);

    let isMagic = false;
    let isHeal = false;
    let effectiveAtk = 0;
    let effectiveDef = 0;

    if (weapon.type === "physical") {
      effectiveAtk = aStats.atk;
      effectiveDef = dStats.def;
    } else if (weapon.type === "magic") {
      effectiveAtk = aStats.matk;
      effectiveDef = dStats.mdef;
      isMagic = true;
    } else if (weapon.type === "heal") {
      isHeal = true;
    } else {
      effectiveAtk = aStats.atk;
      effectiveDef = dStats.def;
    }

    let damage = 0;
    if (isHeal) {
      damage = -Math.max(0, effectiveAtk + safeNum(weapon.might, 0));
    } else {
      damage = Math.max(0, effectiveAtk + safeNum(weapon.might, 0) - effectiveDef);
    }

    const critChance = context.enableCrit ? clamp01(safeNum(weapon.crit, 0) / 100) : 0;
    const critMult = safeNum(context.critMultiplier, 3);
    const critFactor = 1 + critChance * (critMult - 1);

    const expectedDamage = hitChance * damage * attacksCount * critFactor;

    return {
      hitChance,
      damage,
      attacksCount,
      expectedDamage,
      isMagic,
      isHeal,
      debug: {
        effectiveAtk,
        effectiveDef,
        defenderAvoid: safeNum(dStats.avoid, 0),
        terrain: defTerrain?.name || "—",
      }
    };
  }

  const computeTTK = (hp, expectedDamage) => {
    const H = Math.max(1, safeNum(hp, 1));
    const ed = safeNum(expectedDamage, 0);
    if (ed <= 0) return Infinity;
    return H / ed;
  };

  const computeEHP = (hp, incomingExpectedDamage) => {
    const H = Math.max(1, safeNum(hp, 1));
    const dmg = safeNum(incomingExpectedDamage, 0);
    if (dmg <= 0) return Infinity;
    return H / dmg;
  };

  // ----------------------------
  // Micro computations
  // ----------------------------
  function computeMicro(data, ui) {
    const attacker = getUnit(data, ui.duelAttackerId);
    const defender = getUnit(data, ui.duelDefenderId);
    if (!attacker || !defender) return { error: "Il manque l’attaquant ou le défenseur." };

    const ctx = {
      data,
      defenderTerrainId: ui.duelDefTerrainId,
      enableDoubling: ui.enableDoubling,
      enableCrit: ui.enableCrit,
      critMultiplier: data.config.critMultiplier,
    };

    const res = simulateAttack(attacker, defender, ctx);
    if (!res) return { error: "Simulation impossible (données manquantes)." };

    const aStats = computeUnitStats(data, attacker);
    const dStats = computeUnitStats(data, defender);

    const ttk = computeTTK(dStats.hp, res.expectedDamage);

    const back = simulateAttack(defender, attacker, {
      ...ctx,
      defenderTerrainId: ui.duelAttTerrainId,
    });

    const ehpTurns = back ? computeEHP(aStats.hp, back.expectedDamage) : Infinity;

    return { attacker, defender, res, back, ttk, ehpTurns };
  }

  // ----------------------------
  // Tables: classes vs standard + units vs standard + aggregates
  // ----------------------------
  function computeClassVsStandardTable(data, ui) {
    const standard = getUnit(data, ui.duelDefenderId);
    if (!standard) return [];

    const rows = [];
    for (const cls of data.classes) {
      const bs = cls.baseStats || {};
      const preferMagic = safeNum(bs.matk, 0) >= safeNum(bs.atk, 0);
      let weapon = preferMagic ? data.weapons.find(w => w.type === "magic") : null;
      if (!weapon) weapon = data.weapons.find(w => w.type === "physical") || data.weapons[0];
      if (!weapon) continue;

      const temp = { id: `tmp_${cls.id}`, name: cls.name, classId: cls.id, weaponId: weapon.id, side: "player", level: 1, position: { x: 0, y: 0 } };

      const sim = simulateAttack(temp, standard, {
        data,
        defenderTerrainId: ui.duelDefTerrainId,
        enableDoubling: ui.enableDoubling,
        enableCrit: ui.enableCrit,
        critMultiplier: data.config.critMultiplier,
      });

      const stStats = computeUnitStats(data, standard);
      const ttk = computeTTK(stStats.hp, sim?.expectedDamage ?? 0);

      rows.push({
        className: cls.name,
        weaponName: weapon.name,
        hit: sim?.hitChance ?? 0,
        dmg: sim?.damage ?? 0,
        attacks: sim?.attacksCount ?? 1,
        exp: sim?.expectedDamage ?? 0,
        ttk,
      });
    }

    return rows.sort((a, b) => b.exp - a.exp);
  }

  function computeUnitsVsStandardTable(data, ui) {
    const standard = getUnit(data, ui.duelDefenderId);
    if (!standard) return [];

    const scope = ui.compareScope || "player";
    const candidates = data.units.filter(u => scope === "all" ? true : u.side === scope).filter(u => u.id !== standard.id);

    const rows = [];
    for (const u of candidates) {
      const sim = simulateAttack(u, standard, {
        data,
        defenderTerrainId: ui.duelDefTerrainId,
        enableDoubling: ui.enableDoubling,
        enableCrit: ui.enableCrit,
        critMultiplier: data.config.critMultiplier,
      });

      const stStats = computeUnitStats(data, standard);
      const ttk = computeTTK(stStats?.hp ?? 1, sim?.expectedDamage ?? 0);

      const cls = getClass(data, u.classId);
      const w = getWeapon(data, u.weaponId);

      rows.push({
        unitId: u.id,
        unitName: u.name,
        side: u.side,
        classId: u.classId,
        className: cls?.name || u.classId,
        weaponName: w?.name || u.weaponId,
        hit: sim?.hitChance ?? 0,
        dmg: sim?.damage ?? 0,
        attacks: sim?.attacksCount ?? 1,
        exp: sim?.expectedDamage ?? 0,
        ttk,
        zeroDamage: (sim?.damage ?? 0) === 0,
      });
    }

    return rows.sort((a, b) => (b.exp - a.exp) || (b.hit - a.hit));
  }

  function computeAggregatesByClass(unitRows) {
    const m = new Map();
    for (const r of unitRows) {
      const k = r.classId;
      if (!m.has(k)) {
        m.set(k, {
          classId: r.classId,
          className: r.className,
          count: 0,
          hitSum: 0,
          expSum: 0,
          ttkSum: 0,
          ttkCount: 0,
          zeroDamageCount: 0,
          lowHitCount: 0,
        });
      }
      const a = m.get(k);
      a.count++;
      a.hitSum += r.hit;
      a.expSum += r.exp;
      if (Number.isFinite(r.ttk)) { a.ttkSum += r.ttk; a.ttkCount++; }
      if (r.zeroDamage) a.zeroDamageCount++;
      if (r.hit < 0.5) a.lowHitCount++;
    }

    return Array.from(m.values()).map(a => ({
      classId: a.classId,
      className: a.className,
      count: a.count,
      hitAvg: a.count ? a.hitSum / a.count : 0,
      expAvg: a.count ? a.expSum / a.count : 0,
      ttkAvg: a.ttkCount ? a.ttkSum / a.ttkCount : Infinity,
      zeroDamageCount: a.zeroDamageCount,
      lowHitCount: a.lowHitCount,
    })).sort((x, y) => y.expAvg - x.expAvg);
  }

  function computeGlobalOverview(unitRows) {
    if (!unitRows.length) return { count: 0, hitAvg: 0, expAvg: 0, ttkAvg: Infinity, zeroDamageCount: 0, lowHitCount: 0, oneShotCount: 0, slowCount: 0 };

    let hitSum = 0, expSum = 0, ttkSum = 0, ttkCount = 0;
    let zeroDamageCount = 0, lowHitCount = 0, oneShotCount = 0, slowCount = 0;

    for (const r of unitRows) {
      hitSum += r.hit;
      expSum += r.exp;
      if (r.zeroDamage) zeroDamageCount++;
      if (r.hit < 0.5) lowHitCount++;
      if (Number.isFinite(r.ttk)) {
        ttkSum += r.ttk; ttkCount++;
        if (r.ttk < 1.2 && r.exp > 0) oneShotCount++;
        if (r.ttk > 4) slowCount++;
      }
    }

    return {
      count: unitRows.length,
      hitAvg: hitSum / unitRows.length,
      expAvg: expSum / unitRows.length,
      ttkAvg: ttkCount ? ttkSum / ttkCount : Infinity,
      zeroDamageCount,
      lowHitCount,
      oneShotCount,
      slowCount,
    };
  }

  // ----------------------------
  // Micro recommendations (phrases simples)
  // ----------------------------
  function computeMicroRecommendations(micro) {
    const out = [];
    if (!micro || micro.error) return out;

    const { res, ttk } = micro;
    const hit = res.hitChance;
    const dmg = res.damage;

    if (!Number.isFinite(ttk) || ttk === Infinity || res.expectedDamage <= 0) {
      out.push({ level: "fail", text: "Dégâts attendus = 0 → ce duel ne marche pas. Action: vérifier type (phys/magic), puis -DEF/MDEF cible ou +might." });
    } else if (ttk > 4) {
      out.push({ level: "warn", text: `TTK ~${round2(ttk)} (trop long) → risque d’ennui. Action: +1 might ou -1 DEF/MDEF standard.` });
    } else if (ttk < 1.2 && dmg > 0) {
      out.push({ level: "warn", text: `TTK ~${round2(ttk)} (one-shot) → trop punitif. Action: +HP/+DEF cible ou -might attaquant.` });
    }

    if (hit < 0.5) {
      out.push({ level: "warn", text: `Hit ${round0(hit * 100)}% (trop bas) → frustration. Action: +10 hit arme ou -10 avoid terrain.` });
    }
    if (dmg === 0) {
      out.push({ level: "fail", text: "Dégâts = 0 (après DEF/MDEF + terrain) → unité inutile ici. Action: -DEF/MDEF cible/terrain ou +atk/matk/might." });
    }
    return out;
  }

  // ----------------------------
  // Checklist metrics + evaluation
  // ----------------------------
  function computeChecklistMetrics(data, ui) {
    const standard = getUnit(data, ui.duelDefenderId);
    if (!standard) return { error: "Choisis d’abord un ennemi standard (Duels → Défenseur)." };

    const priestClass = data.classes.find(c => c.id === "priest") || data.classes.find(c => c.role === "support");
    const mageClass = data.classes.find(c => c.id === "mage") || data.classes.find(c => c.role === "magic");
    const tankClass = data.classes.find(c => c.role === "tank") || data.classes.find(c => c.id === "lancer") || data.classes[0];

    const mkTemp = (cls, weaponType) => {
      if (!cls) return null;
      let w = weaponType ? data.weapons.find(x => x.type === weaponType) : null;
      if (!w) w = data.weapons[0] || null;
      if (!w) return null;
      return { id: `tmp_${cls.id}`, name: cls.name, classId: cls.id, weaponId: w.id, side: "player", level: 1, position: { x: 0, y: 0 } };
    };

    // Moyenne TTK/Hit de toutes classes vs standard
    let sumTtk = 0, sumHit = 0, n = 0;
    for (const cls of data.classes) {
      const bs = cls.baseStats || {};
      const preferMagic = safeNum(bs.matk, 0) >= safeNum(bs.atk, 0);
      let w = preferMagic ? data.weapons.find(x => x.type === "magic") : null;
      if (!w) w = data.weapons.find(x => x.type === "physical") || data.weapons[0];
      if (!w) continue;

      const temp = { id: "tmp", name: cls.name, classId: cls.id, weaponId: w.id, side: "player", level: 1, position: { x: 0, y: 0 } };
      const sim = simulateAttack(temp, standard, {
        data,
        defenderTerrainId: ui.duelDefTerrainId,
        enableDoubling: ui.enableDoubling,
        enableCrit: ui.enableCrit,
        critMultiplier: data.config.critMultiplier,
      });

      const stStats = computeUnitStats(data, standard);
      if (!sim || !stStats) continue;

      const ttk = computeTTK(stStats.hp, sim.expectedDamage);
      if (!Number.isFinite(ttk)) continue;

      sumTtk += ttk;
      sumHit += sim.hitChance;
      n++;
    }

    const ttkAvg = n ? sumTtk / n : Infinity;
    const hitAvg = n ? sumHit / n : 0;

    // Priest/Mage specifics
    const priest = mkTemp(priestClass, "magic");
    const mage = mkTemp(mageClass, "magic");

    const priestSim = priest ? simulateAttack(priest, standard, {
      data, defenderTerrainId: ui.duelDefTerrainId, enableDoubling: ui.enableDoubling, enableCrit: ui.enableCrit, critMultiplier: data.config.critMultiplier
    }) : null;

    const mageSim = mage ? simulateAttack(mage, standard, {
      data, defenderTerrainId: ui.duelDefTerrainId, enableDoubling: ui.enableDoubling, enableCrit: ui.enableCrit, critMultiplier: data.config.critMultiplier
    }) : null;

    // Tank survive hits (standard -> tank)
    const tank = mkTemp(tankClass, "physical");
    let tankSurviveHits = Infinity;
    if (tank) {
      const back = simulateAttack(standard, tank, {
        data, defenderTerrainId: ui.duelAttTerrainId, enableDoubling: ui.enableDoubling, enableCrit: ui.enableCrit, critMultiplier: data.config.critMultiplier
      });
      const tStats = computeUnitStats(data, tank);
      if (back && tStats && back.expectedDamage > 0) tankSurviveHits = tStats.hp / back.expectedDamage;
    }

    // Mage EHP
    let mageEhpTurns = Infinity;
    if (mage) {
      const back = simulateAttack(standard, mage, {
        data, defenderTerrainId: ui.duelAttTerrainId, enableDoubling: ui.enableDoubling, enableCrit: ui.enableCrit, critMultiplier: data.config.critMultiplier
      });
      const mStats = computeUnitStats(data, mage);
      if (back && mStats) mageEhpTurns = computeEHP(mStats.hp, back.expectedDamage);
    }

    return {
      ttk_vs_standard_avg: ttkAvg,
      hit_vs_standard_avg: hitAvg,
      priest_expected_damage: priestSim ? priestSim.expectedDamage : 0,
      mage_expected_damage: mageSim ? mageSim.expectedDamage : 0,
      tank_survive_hits: tankSurviveHits,
      mage_ehp_turns: mageEhpTurns,
    };
  }

  function evalChecklistItem(item, metrics) {
    const val = metrics[item.metric];
    const ok = Number.isFinite(val) && val >= item.min && val <= item.max;
    const warn = Number.isFinite(val) && !ok && val >= item.min * 0.9 && val <= item.max * 1.1;

    let verdict = ok ? "ok" : warn ? "warn" : "fail";
    let extraNote = null;

    if (item.extra?.checkMageEhpMax != null && item.metric === "mage_expected_damage") {
      const mageEhpTurns = metrics.mage_ehp_turns;
      if (Number.isFinite(mageEhpTurns) && mageEhpTurns > 3) {
        verdict = verdict === "ok" ? "warn" : verdict;
        extraNote = `Le mage survit trop (~${round2(mageEhpTurns)} tours).`;
      }
    }

    return { verdict, value: val, extraNote };
  }

  function checklistWhy(metric) {
    if (metric.includes("ttk")) return "Pourquoi: fixe le tempo (one-shot vs ennui).";
    if (metric.includes("hit")) return "Pourquoi: fixe la fiabilité (frustration si bas).";
    if (metric.includes("priest")) return "Pourquoi: prêtre utile sans voler la vedette.";
    if (metric.includes("mage")) return "Pourquoi: mage fort mais fragile.";
    if (metric.includes("tank")) return "Pourquoi: tank encaisse → choix tactiques.";
    return "Pourquoi: guide l’équilibrage.";
  }

  function checklistReco(item, val) {
    if (!Number.isFinite(val)) return "Action: non calculable (souvent dégâts 0). Vérifie type + DEF/MDEF + terrain.";
    if (val < item.min) {
      if (item.metric.includes("hit")) return "Action: +10 hit sur armes de base ou -avoid terrain standard.";
      if (item.metric.includes("ttk")) return "Action: +1 might armes de base ou -1 DEF/MDEF standard.";
      if (item.metric.includes("priest")) return "Action: +1 might arme prêtre ou -1 MDEF standard.";
      if (item.metric.includes("mage")) return "Action: +1 might sort ou +1 MATK mage.";
      if (item.metric.includes("tank")) return "Action: +1 HP/+1 DEF tank ou -1 might ennemi.";
      return "Action: augmenter dégâts ou réduire défenses.";
    }
    if (val > item.max) {
      if (item.metric.includes("hit")) return "Action: -5 hit armes ou +avoid terrain standard.";
      if (item.metric.includes("ttk")) return "Action: +HP/+DEF standard ou -1 might armes.";
      if (item.metric.includes("priest")) return "Action: -1 might arme prêtre ou +1 MDEF standard.";
      if (item.metric.includes("mage")) return "Action: -1 might sort ou +1 MDEF standard.";
      if (item.metric.includes("tank")) return "Action: -DEF tank ou +might ennemi.";
      return "Action: réduire dégâts ou augmenter défenses.";
    }
    return "OK: rien à changer.";
  }

  // ----------------------------
  // Export format jeu
  // ----------------------------
  function exportToGameFormat(data) {
    return {
      CLASSES: data.classes.map(c => ({ id: c.id, name: c.name, role: c.role, baseStats: c.baseStats, growth: c.growth || null })),
      WEAPONS: data.weapons.map(w => ({ id: w.id, name: w.name, type: w.type, might: w.might, hit: w.hit, crit: w.crit || 0, rangeMin: w.rangeMin, rangeMax: w.rangeMax, specialRules: w.specialRules || [] })),
      TERRAIN: data.terrain.map(t => ({ id: t.id, name: t.name, moveCost: t.moveCost, bonus: t.bonus || { def: 0, mdef: 0, avoid: 0 } })),
      UNITS: data.units.map(u => ({ id: u.id, name: u.name, classId: u.classId, weaponId: u.weaponId, side: u.side, level: u.level, statsOverride: u.statsOverride || null, position: u.position || { x: 0, y: 0 } })),
      STAGES: data.stages.map(s => ({ id: s.id, name: s.name, width: s.width, height: s.height, terrainGrid: s.terrainGrid, units: s.units, reinforcements: s.reinforcements || [] })),
      CONFIG: deepClone(data.config),
    };
  }

  // ----------------------------
  // Validation (structure + références)
  // ----------------------------
  function validateDataShape(data) {
    const errors = [];
    const mustArr = ["classes", "weapons", "terrain", "units", "stages"];
    for (const k of mustArr) if (!Array.isArray(data[k])) errors.push(`Champ "${k}" doit être un tableau.`);

    const idsUnique = (arr, label) => {
      const seen = new Set();
      for (const it of arr) {
        if (!it || typeof it.id !== "string") { errors.push(`${label}: item sans id string.`); continue; }
        if (seen.has(it.id)) errors.push(`${label}: id dupliqué "${it.id}".`);
        seen.add(it.id);
      }
    };

    if (Array.isArray(data.classes)) idsUnique(data.classes, "classes");
    if (Array.isArray(data.weapons)) idsUnique(data.weapons, "weapons");
    if (Array.isArray(data.terrain)) idsUnique(data.terrain, "terrain");
    if (Array.isArray(data.units)) idsUnique(data.units, "units");
    if (Array.isArray(data.stages)) idsUnique(data.stages, "stages");

    const classIds = new Set((data.classes || []).map(c => c.id));
    const weaponIds = new Set((data.weapons || []).map(w => w.id));
    const terrainIds = new Set((data.terrain || []).map(t => t.id));
    const unitIds = new Set((data.units || []).map(u => u.id));

    for (const u of (data.units || [])) {
      if (!classIds.has(u.classId)) errors.push(`Unit "${u.id}": classId inconnu "${u.classId}".`);
      if (!weaponIds.has(u.weaponId)) errors.push(`Unit "${u.id}": weaponId inconnu "${u.weaponId}".`);
      if (!["player", "enemy"].includes(u.side)) errors.push(`Unit "${u.id}": side doit être player/enemy.`);
      if (!u.position || !Number.isFinite(u.position.x) || !Number.isFinite(u.position.y)) errors.push(`Unit "${u.id}": position manquante/invalide.`);
    }

    for (const s of (data.stages || [])) {
      const w = safeNum(s.width, 0), h = safeNum(s.height, 0);
      if (w <= 0 || h <= 0) errors.push(`Stage "${s.id}": width/height invalides.`);
      const grid = s.terrainGrid || [];
      if (grid.length !== w * h) errors.push(`Stage "${s.id}": terrainGrid longueur ${grid.length} ≠ width*height ${w * h}.`);
      for (const tid of grid) { if (!terrainIds.has(tid)) { errors.push(`Stage "${s.id}": terrain id inconnu "${tid}".`); break; } }
      for (const uid of (s.units || [])) { if (!unitIds.has(uid)) { errors.push(`Stage "${s.id}": unit id inconnu "${uid}".`); break; } }
    }

    if (data.checklist && !Array.isArray(data.checklist)) errors.push(`checklist doit être un tableau si présent.`);
    return errors;
  }

  // ----------------------------
  // UI components
  // ----------------------------
  function badge(level, text) {
    return `<span class="badge ${level}">${escapeHtml(text)}</span>`;
  }

  function kvRow(label, value, level, help) {
    const div = document.createElement("div");
    div.className = "row gap wrap";
    div.style.justifyContent = "space-between";
    div.innerHTML = `
      <div>
        <div class="hint">${escapeHtml(label)}</div>
        ${help ? `<div class="hint" style="opacity:.9">${escapeHtml(help)}</div>` : ""}
      </div>
      <div class="badge ${level}"><b>${escapeHtml(String(value))}</b></div>
    `;
    return div;
  }

  function recoCard(level, text) {
    const d = document.createElement("div");
    d.className = `badge ${level}`;
    d.style.whiteSpace = "normal";
    d.textContent = (level === "fail" ? "❌ " : level === "warn" ? "⚠️ " : "✅ ") + text;
    return d;
  }

  // ----------------------------
  // Render: selects
  // ----------------------------
  function renderSelectOptions() {
    const fill = (el, options, selected) => {
      if (!el) return;
      el.innerHTML = "";
      for (const opt of options) {
        const o = document.createElement("option");
        o.value = opt.value;
        o.textContent = opt.label;
        if (opt.value === selected) o.selected = true;
        el.appendChild(o);
      }
    };

    const units = state.data.units.map(u => ({
      value: u.id,
      label: `${u.side === "enemy" ? "E" : "P"} — ${u.name} (${u.classId}/${u.weaponId})`
    }));

    fill($("#duel-attacker"), units, state.ui.duelAttackerId);
    fill($("#duel-defender"), units, state.ui.duelDefenderId);

    const terrains = state.data.terrain.map(t => ({
      value: t.id,
      label: `${t.name} (+DEF ${t.bonus?.def ?? 0}, +MDEF ${t.bonus?.mdef ?? 0}, AVD ${t.bonus?.avoid ?? 0})`
    }));
    fill($("#duel-attacker-terrain"), terrains, state.ui.duelAttTerrainId);
    fill($("#duel-defender-terrain"), terrains, state.ui.duelDefTerrainId);

    const stageOpts = state.data.stages.map(s => ({ value: s.id, label: s.name }));
    fill($("#stage-select"), stageOpts, state.ui.stageId);

    const classOpts = state.data.classes.map(c => ({ value: c.id, label: `${c.name} (${c.id})` }));
    fill($("#tuning-enemy-class"), classOpts, state.ui.tuning.enemyClassId);
  }

  // ----------------------------
  // Render: JSON areas
  // ----------------------------
  function renderJsonAreas() {
    const editor = $("#json-editor");
    const status = $("#json-status");
    const exportPreview = $("#export-preview");
    const notes = $("#design-notes");

    if (editor && document.activeElement !== editor) editor.value = JSON.stringify(state.data, null, 2);
    if (notes && document.activeElement !== notes) notes.value = state.data.designNotes || "";

    const errs = state.derived.errors || [];
    if (status) {
      if (errs.length) {
        status.textContent = `❌ ${errs.length} erreur(s) : ${errs[0]}${errs.length > 1 ? " …" : ""}`;
        status.style.color = "var(--fail)";
      } else {
        status.textContent = "✅ JSON valide (structure + références).";
        status.style.color = "var(--ok)";
      }
    }

    if (exportPreview) exportPreview.textContent = JSON.stringify(state.derived.gameExport, null, 2);
  }

  // ----------------------------
  // Render: forms (simple)
  // ----------------------------
  function statInput(key, val, bindBase, id) {
    return `<div><label class="label">${key}</label><input class="input" type="number" data-bind="${bindBase}.${key}" data-id="${id}" value="${escapeAttr(val ?? 0)}" /></div>`;
  }
  function numInput(label, val, bind, id) {
    return `<div><label class="label">${label}</label><input class="input" type="number" data-bind="${bind}" data-id="${id}" value="${escapeAttr(val ?? 0)}" /></div>`;
  }
  function opt(current, value) {
    return `<option value="${value}" ${current === value ? "selected" : ""}>${value}</option>`;
  }

  function renderClassesForm() {
    const root = $("#classes-form");
    if (!root) return;
    root.innerHTML = "";

    for (const c of state.data.classes) {
      const el = document.createElement("div");
      el.className = "card";
      el.innerHTML = `
        <div class="row gap wrap" style="justify-content:space-between">
          <div><b>${escapeHtml(c.name)}</b> <span class="hint">(${escapeHtml(c.id)})</span></div>
          <div class="row gap">
            <button class="btn small" data-action="dup-class" data-id="${c.id}">Dupliquer</button>
            <button class="btn small" data-action="del-class" data-id="${c.id}">Supprimer</button>
          </div>
        </div>

        <div class="form-grid mt12">
          <div>
            <label class="label">Nom</label>
            <input class="input" data-bind="class.name" data-id="${c.id}" value="${escapeAttr(c.name)}" />
          </div>
          <div>
            <label class="label">Role</label>
            <input class="input" data-bind="class.role" data-id="${c.id}" value="${escapeAttr(c.role || "")}" placeholder="dps/tank/support..." />
          </div>
        </div>

        <div class="mt12">
          <div class="hint"><b>Base stats</b></div>
          <div class="form-grid mt8">
            ${statInput("hp", c.baseStats?.hp, "class.baseStats", c.id)}
            ${statInput("atk", c.baseStats?.atk, "class.baseStats", c.id)}
            ${statInput("def", c.baseStats?.def, "class.baseStats", c.id)}
            ${statInput("matk", c.baseStats?.matk, "class.baseStats", c.id)}
            ${statInput("mdef", c.baseStats?.mdef, "class.baseStats", c.id)}
            ${statInput("spd", c.baseStats?.spd, "class.baseStats", c.id)}
          </div>
        </div>
      `;
      root.appendChild(el);
    }
  }

  function renderWeaponsForm() {
    const root = $("#weapons-form");
    if (!root) return;
    root.innerHTML = "";

    for (const w of state.data.weapons) {
      const el = document.createElement("div");
      el.className = "card";
      el.innerHTML = `
        <div class="row gap wrap" style="justify-content:space-between">
          <div><b>${escapeHtml(w.name)}</b> <span class="hint">(${escapeHtml(w.id)})</span></div>
          <div class="row gap">
            <button class="btn small" data-action="dup-weapon" data-id="${w.id}">Dupliquer</button>
            <button class="btn small" data-action="del-weapon" data-id="${w.id}">Supprimer</button>
          </div>
        </div>

        <div class="form-grid mt12">
          <div>
            <label class="label">Nom</label>
            <input class="input" data-bind="weapon.name" data-id="${w.id}" value="${escapeAttr(w.name)}" />
          </div>
          <div>
            <label class="label">Type</label>
            <select class="input" data-bind="weapon.type" data-id="${w.id}">
              ${opt(w.type, "physical")}
              ${opt(w.type, "magic")}
              ${opt(w.type, "heal")}
            </select>
          </div>
        </div>

        <div class="form-grid mt12">
          ${numInput("might", w.might, "weapon.might", w.id)}
          ${numInput("hit", w.hit, "weapon.hit", w.id)}
          ${numInput("crit", w.crit || 0, "weapon.crit", w.id)}
          ${numInput("rangeMin", w.rangeMin, "weapon.rangeMin", w.id)}
          ${numInput("rangeMax", w.rangeMax, "weapon.rangeMax", w.id)}
        </div>
      `;
      root.appendChild(el);
    }
  }

  function renderTerrainForm() {
    const root = $("#terrain-form");
    if (!root) return;
    root.innerHTML = "";

    for (const t of state.data.terrain) {
      const el = document.createElement("div");
      el.className = "card";
      el.innerHTML = `
        <div class="row gap wrap" style="justify-content:space-between">
          <div><b>${escapeHtml(t.name)}</b> <span class="hint">(${escapeHtml(t.id)})</span></div>
          <div class="row gap">
            <button class="btn small" data-action="dup-terrain" data-id="${t.id}">Dupliquer</button>
            <button class="btn small" data-action="del-terrain" data-id="${t.id}">Supprimer</button>
          </div>
        </div>

        <div class="form-grid mt12">
          <div>
            <label class="label">Nom</label>
            <input class="input" data-bind="terrain.name" data-id="${t.id}" value="${escapeAttr(t.name)}" />
          </div>
          <div>
            <label class="label">Move cost</label>
            <input class="input" type="number" data-bind="terrain.moveCost" data-id="${t.id}" value="${escapeAttr(t.moveCost)}" />
          </div>
        </div>

        <div class="mt12">
          <div class="hint"><b>Bonus</b></div>
          <div class="form-grid mt8">
            ${numInput("def", t.bonus?.def ?? 0, "terrain.bonus.def", t.id)}
            ${numInput("mdef", t.bonus?.mdef ?? 0, "terrain.bonus.mdef", t.id)}
            ${numInput("avoid", t.bonus?.avoid ?? 0, "terrain.bonus.avoid", t.id)}
          </div>
        </div>
      `;
      root.appendChild(el);
    }
  }

  function renderDataForms() {
    renderClassesForm();
    renderWeaponsForm();
    renderTerrainForm();
  }

  // ----------------------------
  // Render: Duels
  // ----------------------------
  function renderMicro() {
    const root = $("#duel-results");
    if (!root) return;
    root.innerHTML = "";

    const micro = state.derived.micro;
    if (!micro || micro.error) {
      root.innerHTML = `<div class="badge fail">❌ ${escapeHtml(micro?.error || "Erreur micro")}</div>`;
      return;
    }

    const { res, back, ttk, ehpTurns } = micro;
    const hitPct = round0(res.hitChance * 100);
    const exp = round2(res.expectedDamage);
    const dmg = res.damage;
    const attacks = res.attacksCount;
    const typeTxt = res.isHeal ? "Soin" : res.isMagic ? "Magique (MATK vs MDEF)" : "Physique (ATK vs DEF)";
    const terrainTxt = res.debug.terrain;

    const defHp = computeUnitStats(state.data, micro.defender).hp;
    const ttkTxt = Number.isFinite(ttk) ? `${round2(ttk)} tours` : "∞";
    const ehpTxt = Number.isFinite(ehpTurns) ? `${round2(ehpTurns)} tours` : "∞";

    root.appendChild(kvRow("Hit chance", `${hitPct}%`, hitPct < 50 ? "warn" : "ok", "Fiabilité. Trop bas = frustration."));
    root.appendChild(kvRow("Dégâts (si ça touche)", `${dmg}`, dmg === 0 ? "fail" : "ok", "Si 0 → unité inutile sur cette cible."));
    root.appendChild(kvRow("Attaques / tour", `${attacks}`, "ok", "Plus d’attaques = TTK plus court (doubling)."));
    root.appendChild(kvRow("Dégâts attendus / tour", `${exp}`, exp <= 0 ? "fail" : "ok", "Rythme réel: hit × dégâts × attaques."));
    root.appendChild(kvRow("TTK (temps pour tuer)", `${ttkTxt} (HP ${defHp})`, ttk > 3 ? "warn" : "ok", "Tempo. Vise 2–3 sur le standard."));
    root.appendChild(kvRow("EHP (survie)", `${ehpTxt}`, ehpTurns < 1.8 ? "warn" : "ok", "Approx: combien de tours tu survis."));
    root.appendChild(kvRow("Type d’attaque", typeTxt, "ok", "Indique si tu dois regarder DEF ou MDEF."));
    root.appendChild(kvRow("Terrain cible", terrainTxt, "ok", "Le terrain peut casser l’équilibrage."));

    if (back) {
      root.appendChild(document.createElement("div")).className = "hr";
      root.appendChild(kvRow("Retour (cible → toi)", `${round2(back.expectedDamage)} dmg att.`, "ok", "Vérifie si l’échange est trop punitif."));
    }
  }

  function renderMicroRecos() {
    const root = $("#micro-recos");
    if (!root) return;
    root.innerHTML = "";

    const recos = computeMicroRecommendations(state.derived.micro);
    if (!recos.length) {
      root.innerHTML = `<div class="badge ok">✅ Rien d’inquiétant pour ce duel.</div>`;
      return;
    }
    for (const r of recos) root.appendChild(recoCard(r.level, r.text));
  }

  function renderCompareTable() {
    const tbody = $("#table-compare tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    const rows = computeClassVsStandardTable(state.data, state.ui);
    for (const r of rows) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(r.className)}</td>
        <td>${escapeHtml(r.weaponName)}</td>
        <td>${round0(r.hit * 100)}%</td>
        <td>${r.dmg}</td>
        <td>${r.attacks}</td>
        <td>${round2(r.exp)}</td>
        <td>${Number.isFinite(r.ttk) ? round2(r.ttk) : "∞"}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  // ----------------------------
  // Advanced analysis block injected inside <details> (Duels)
  // ----------------------------
  function ensureDuelsAnalysisBlocks() {
    const details = $("#tab-duels details.accordion");
    if (!details) return;

    if ($("#duels-analysis")) return;

    const container = document.createElement("div");
    container.id = "duels-analysis";
    container.className = "card mt12";

    container.innerHTML = `
      <div class="card-head">
        <h3>Analyse (toutes unités → standard)</h3>
        <div class="hint">Utile quand tu as beaucoup d’unités: tu vois vite les cas “cassés”.</div>
      </div>

      <div class="form-grid">
        <div>
          <label class="label">Qui analyser ?</label>
          <select id="compare-scope" class="input">
            <option value="player">Players</option>
            <option value="enemy">Enemies</option>
            <option value="all">All</option>
          </select>
        </div>
        <div>
          <label class="label">Comparé à</label>
          <select id="compare-mode" class="input">
            <option value="vsStandard">Ennemi standard (défenseur)</option>
          </select>
        </div>
      </div>

      <div class="grid two mt12">
        <div class="card">
          <div class="card-head">
            <h3>Résumé global</h3>
          </div>
          <div id="global-overview" class="stack"></div>
          <div class="hr"></div>
          <div class="stack">
            <div class="badge">Hit</div>
            <div class="hint">${escapeHtml(EXPLAIN.hitAvg.why)}<br/>✅ ${escapeHtml(EXPLAIN.hitAvg.good)}<br/>🛠️ ${escapeHtml(EXPLAIN.hitAvg.fix)}</div>
            <div class="badge mt8">Dmg attendus</div>
            <div class="hint">${escapeHtml(EXPLAIN.expDmg.why)}<br/>✅ ${escapeHtml(EXPLAIN.expDmg.good)}<br/>🛠️ ${escapeHtml(EXPLAIN.expDmg.fix)}</div>
            <div class="badge mt8">TTK</div>
            <div class="hint">${escapeHtml(EXPLAIN.ttk.why)}<br/>✅ ${escapeHtml(EXPLAIN.ttk.good)}<br/>🛠️ ${escapeHtml(EXPLAIN.ttk.fix)}</div>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <h3>Alertes</h3>
          </div>
          <div id="global-alerts" class="stack"></div>
        </div>
      </div>

      <div class="card mt12">
        <div class="card-head">
          <h3>Unités vs standard</h3>
        </div>
        <div class="tablewrap">
          <table class="table" id="table-units-vs-standard">
            <thead>
              <tr>
                <th>Side</th>
                <th>Unité</th>
                <th>Classe</th>
                <th>Arme</th>
                <th>Hit%</th>
                <th>Dmg</th>
                <th>Att.</th>
                <th>Dmg att.</th>
                <th>TTK</th>
                <th>Flags</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>

      <div class="card mt12">
        <div class="card-head">
          <h3>Résumé par classe (sur tes unités)</h3>
        </div>
        <div class="tablewrap">
          <table class="table" id="table-class-aggregates">
            <thead>
              <tr>
                <th>Classe</th>
                <th>#</th>
                <th>Hit moyen</th>
                <th>Dmg att. moyen</th>
                <th>TTK moyen</th>
                <th>Alertes</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `;

    details.appendChild(container);

    const scopeSel = $("#compare-scope");
    const modeSel = $("#compare-mode");
    scopeSel.value = state.ui.compareScope || "player";
    modeSel.value = state.ui.compareMode || "vsStandard";

    scopeSel.addEventListener("change", (e) => { state.ui.compareScope = e.target.value; renderDuelsAllUnitsAndAggregates(); });
    modeSel.addEventListener("change", (e) => { state.ui.compareMode = e.target.value; renderDuelsAllUnitsAndAggregates(); });
  }

  function renderDuelsAllUnitsAndAggregates() {
    if (!$("#duels-analysis")) return;

    const unitRows = computeUnitsVsStandardTable(state.data, state.ui);
    const aggs = computeAggregatesByClass(unitRows);
    const global = computeGlobalOverview(unitRows);

    // overview
    const over = $("#global-overview");
    if (over) {
      over.innerHTML = "";
      over.appendChild(kvRow("Unités analysées", `${global.count}`, "ok", ""));
      over.appendChild(kvRow("Hit moyen", `${round0(global.hitAvg * 100)}%`, global.hitAvg < 0.7 ? "warn" : "ok", "70–90% conseillé."));
      over.appendChild(kvRow("Dmg attendus moyen", `${round2(global.expAvg)}`, global.expAvg <= 0 ? "fail" : "ok", "Rythme global."));
      over.appendChild(kvRow("TTK moyen", `${Number.isFinite(global.ttkAvg) ? round2(global.ttkAvg) : "∞"}`, global.ttkAvg > 3.2 ? "warn" : "ok", "2–3 conseillé sur standard."));
    }

    // alerts
    const alerts = $("#global-alerts");
    if (alerts) {
      alerts.innerHTML = "";
      const add = (lvl, text) => alerts.appendChild(recoCard(lvl, text));
      if (global.count === 0) add("warn", "Aucune unité analysée. Change la scope (Players/Enemies/All).");
      else {
        if (global.zeroDamageCount) add("fail", `${global.zeroDamageCount} cas: dégâts = 0 → vérifier type / DEF/MDEF / terrain.`);
        else add("ok", "0 dégâts: OK");
        if (global.lowHitCount) add("warn", `${global.lowHitCount} cas: hit < 50% → +hit ou -avoid.`);
        else add("ok", "Hit extrêmes: OK");
        if (global.oneShotCount) add("warn", `${global.oneShotCount} cas: one-shot probable → +HP/+DEF ou -might.`);
        else add("ok", "One-shot: OK");
        if (global.slowCount) add("warn", `${global.slowCount} cas: TTK > 4 → +might ou -DEF/MDEF.`);
        else add("ok", "Combats trop longs: OK");
      }
    }

    // units table
    const tb = $("#table-units-vs-standard tbody");
    if (tb) {
      tb.innerHTML = "";
      for (const r of unitRows) {
        const flags = [];
        if (r.zeroDamage) flags.push("0 DMG");
        if (r.hit < 0.5) flags.push("LOW HIT");
        if (Number.isFinite(r.ttk) && r.ttk < 1.2 && r.exp > 0) flags.push("ONES");
        if (Number.isFinite(r.ttk) && r.ttk > 4) flags.push("SLOW");

        const level = r.zeroDamage ? "fail" : (r.hit < 0.5 || (Number.isFinite(r.ttk) && (r.ttk < 1.2 || r.ttk > 4))) ? "warn" : "ok";

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${r.side === "player" ? "P" : "E"}</td>
          <td>${escapeHtml(r.unitName)} <span class="hint">(${escapeHtml(r.unitId)})</span></td>
          <td>${escapeHtml(r.className)}</td>
          <td>${escapeHtml(r.weaponName)}</td>
          <td>${round0(r.hit * 100)}%</td>
          <td>${r.dmg}</td>
          <td>${r.attacks}</td>
          <td>${round2(r.exp)}</td>
          <td>${Number.isFinite(r.ttk) ? round2(r.ttk) : "∞"}</td>
          <td>${flags.length ? `<span class="badge ${level}">${escapeHtml(flags.join(" · "))}</span>` : `<span class="badge ok">OK</span>`}</td>
        `;
        tb.appendChild(tr);
      }
    }

    // class aggregates
    const ct = $("#table-class-aggregates tbody");
    if (ct) {
      ct.innerHTML = "";
      for (const a of aggs) {
        const alertsTxt = [];
        if (a.zeroDamageCount) alertsTxt.push(`${a.zeroDamageCount}× 0dmg`);
        if (a.lowHitCount) alertsTxt.push(`${a.lowHitCount}× <50% hit`);

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(a.className)} <span class="hint">(${escapeHtml(a.classId)})</span></td>
          <td>${a.count}</td>
          <td>${round0(a.hitAvg * 100)}%</td>
          <td>${round2(a.expAvg)}</td>
          <td>${Number.isFinite(a.ttkAvg) ? round2(a.ttkAvg) : "∞"}</td>
          <td>${alertsTxt.length ? `<span class="badge warn">${escapeHtml(alertsTxt.join(" · "))}</span>` : `<span class="badge ok">OK</span>`}</td>
        `;
        ct.appendChild(tr);
      }
    }
  }

  // ----------------------------
  // Render: Stage (macro)
  // ----------------------------
  const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

  function weaponThreatRange(weapon) {
    return { min: safeNum(weapon.rangeMin, 1), max: safeNum(weapon.rangeMax, 1) };
  }
  function isInRange(dist, range) {
    return dist >= range.min && dist <= range.max;
  }

  function computeStageSummary(data, stage) {
    const unitObjs = (stage.units || []).map(id => getUnit(data, id)).filter(Boolean);
    const players = unitObjs.filter(u => u.side === "player");
    const enemies = unitObjs.filter(u => u.side === "enemy");

    const countByClass = (arr) => {
      const m = new Map();
      for (const u of arr) {
        const cls = getClass(data, u.classId);
        const key = cls?.name || u.classId;
        m.set(key, (m.get(key) || 0) + 1);
      }
      return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
    };

    const avgStats = (arr) => {
      if (!arr.length) return null;
      const sum = { hp: 0, atk: 0, def: 0, matk: 0, mdef: 0, spd: 0 };
      for (const u of arr) {
        const s = computeUnitStats(data, u);
        if (!s) continue;
        for (const k of Object.keys(sum)) sum[k] += safeNum(s[k], 0);
      }
      const n = arr.length;
      for (const k of Object.keys(sum)) sum[k] = round2(sum[k] / n);
      return sum;
    };

    return {
      playersCount: players.length,
      enemiesCount: enemies.length,
      playersClasses: countByClass(players),
      enemiesClasses: countByClass(enemies),
      playersAvg: avgStats(players),
      enemiesAvg: avgStats(enemies),
    };
  }

  function renderAsciiGrid(stage) {
    const w = stage.width, h = stage.height;
    const grid = stage.terrainGrid || [];
    const units = (stage.units || []).map(id => getUnit(state.data, id)).filter(Boolean);

    const unitAt = new Map();
    for (const u of units) unitAt.set(`${u.position.x},${u.position.y}`, u);

    const terrChar = (tid) => {
      if (tid === "plain") return ".";
      if (tid === "forest") return "F";
      if (tid === "fort") return "T";
      return "?";
    };

    let out = "";
    for (let y = 0; y < h; y++) {
      let row = "";
      for (let x = 0; x < w; x++) {
        const u = unitAt.get(`${x},${y}`);
        row += u ? (u.side === "player" ? "P" : "E") : terrChar(grid[y * w + x]);
      }
      out += row + "\n";
    }
    out += "\nLegend: . plaine · F forêt · T fort · P joueur · E ennemi\n";
    return out;
  }

  function computeMacro(data, stage, radius) {
    const unitObjs = (stage.units || []).map(id => getUnit(data, id)).filter(Boolean);
    const players = unitObjs.filter(u => u.side === "player");
    const enemies = unitObjs.filter(u => u.side === "enemy");

    const perPlayer = [];
    for (const p of players) {
      let threats = 0;
      let expectedIncoming = 0;

      for (const e of enemies) {
        const dist = manhattan(p.position, e.position);
        if (dist > radius) continue;

        const w = getWeapon(data, e.weaponId);
        if (!w) continue;

        const range = weaponThreatRange(w);
        if (!isInRange(dist, range)) continue;

        threats++;
        const sim = simulateAttack(e, p, {
          data,
          defenderTerrainId: "plain",
          enableDoubling: data.config.enableDoubling,
          enableCrit: data.config.enableCrit,
          critMultiplier: data.config.critMultiplier,
        });
        if (sim) expectedIncoming += sim.expectedDamage;
      }

      const pStats = computeUnitStats(data, p);
      const surviveTurns = pStats ? computeEHP(pStats.hp, expectedIncoming) : Infinity;

      perPlayer.push({
        player: p.name,
        threats,
        expectedIncoming: round2(expectedIncoming),
        surviveTurns: Number.isFinite(surviveTurns) ? round2(surviveTurns) : Infinity,
      });
    }

    // TTK moyen : joueurs -> ennemi le plus proche
    let avgTtk = 0, count = 0;
    for (const p of players) {
      let best = null, bestDist = Infinity;
      for (const e of enemies) {
        const d = manhattan(p.position, e.position);
        if (d < bestDist) { bestDist = d; best = e; }
      }
      if (!best) continue;
      const sim = simulateAttack(p, best, {
        data,
        defenderTerrainId: "plain",
        enableDoubling: data.config.enableDoubling,
        enableCrit: data.config.enableCrit,
        critMultiplier: data.config.critMultiplier,
      });
      const eStats = computeUnitStats(data, best);
      if (!sim || !eStats) continue;
      const ttk = computeTTK(eStats.hp, sim.expectedDamage);
      if (!Number.isFinite(ttk)) continue;
      avgTtk += ttk;
      count++;
    }
    avgTtk = count ? round2(avgTtk / count) : Infinity;

    return { perPlayer, avgTtk };
  }

  function renderStage() {
    const stage = getStage(state.data, state.ui.stageId);
    const sumRoot = $("#stage-summary");
    const gridRoot = $("#stage-grid");
    if (!stage || !sumRoot || !gridRoot) return;

    const sum = computeStageSummary(state.data, stage);

    const fmtStats = (s) => `HP ${s.hp} · ATK ${s.atk} · DEF ${s.def} · MATK ${s.matk} · MDEF ${s.mdef} · SPD ${s.spd}`;
    const fmtClasses = (arr) => arr.map(([k, v]) => `${k}:${v}`).join(" · ") || "—";

    sumRoot.innerHTML = "";
    sumRoot.appendChild(kvRow("Unités (joueurs / ennemis)", `${sum.playersCount} / ${sum.enemiesCount}`, "ok", ""));
    sumRoot.appendChild(kvRow("Moyennes joueurs", sum.playersAvg ? fmtStats(sum.playersAvg) : "—", "ok", "Niveau moyen côté joueur."));
    sumRoot.appendChild(kvRow("Moyennes ennemis", sum.enemiesAvg ? fmtStats(sum.enemiesAvg) : "—", "ok", "Niveau moyen côté ennemi."));
    sumRoot.appendChild(kvRow("Répartition classes (P)", fmtClasses(sum.playersClasses), "ok", "Variété = options tactiques."));
    sumRoot.appendChild(kvRow("Répartition classes (E)", fmtClasses(sum.enemiesClasses), "ok", "Variété = menaces différentes."));

    gridRoot.textContent = renderAsciiGrid(stage);
  }

  function renderMacroResults() {
    const root = $("#macro-results");
    if (!root) return;
    root.innerHTML = "";

    const macro = state.derived.macro;
    if (!macro) {
      root.innerHTML = `<div class="badge">Clique <b>Calculer</b> pour générer l’analyse macro.</div>`;
      return;
    }

    root.appendChild(kvRow(
      "TTK moyen (joueurs → ennemi le plus proche)",
      Number.isFinite(macro.avgTtk) ? macro.avgTtk : "∞",
      macro.avgTtk > 3 ? "warn" : "ok",
      "Si c’est haut, le stage semble lent."
    ));

    const table = document.createElement("div");
    table.className = "tablewrap mt12";
    table.innerHTML = `
      <table class="table">
        <thead><tr><th>Joueur</th><th>Menaces</th><th>Dégâts entrants attendus</th><th>Survie (tours)</th></tr></thead>
        <tbody>
          ${macro.perPlayer.map(r => `
            <tr>
              <td>${escapeHtml(r.player)}</td>
              <td>${r.threats}</td>
              <td>${r.expectedIncoming}</td>
              <td>${r.surviveTurns === Infinity ? "∞" : r.surviveTurns}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
    root.appendChild(table);
  }

  // ----------------------------
  // Render: Checklist
  // ----------------------------
  function renderChecklist() {
    const itemsRoot = $("#checklist-items");
    const globalRoot = $("#global-recos");
    const editor = $("#checklist-editor");
    const status = $("#checklist-status");

    if (!itemsRoot || !globalRoot || !editor) return;

    if (document.activeElement !== editor) editor.value = JSON.stringify(state.data.checklist || [], null, 2);

    const metrics = state.derived.checklist;
    if (!metrics || metrics.error) {
      itemsRoot.innerHTML = `<div class="badge fail">❌ ${escapeHtml(metrics?.error || "Erreur checklist")}</div>`;
      globalRoot.innerHTML = "";
      if (status) status.textContent = "";
      return;
    }

    itemsRoot.innerHTML = "";
    globalRoot.innerHTML = "";

    const all = state.data.checklist || [];
    const recos = [];

    for (const item of all) {
      const ev = evalChecklistItem(item, metrics);
      const v = metrics[item.metric];
      const vTxt = Number.isFinite(v) ? round2(v) : "∞";
      const rangeTxt = `[${item.min}..${item.max}]`;

      const row = document.createElement("div");
      row.className = "card";
      row.innerHTML = `
        <div class="row gap wrap" style="justify-content:space-between">
          <div>
            <div><b>${escapeHtml(item.label)}</b></div>
            <div class="hint">${escapeHtml(checklistWhy(item.metric))}</div>
          </div>
          ${badge(ev.verdict, ev.verdict.toUpperCase())}
        </div>
        <div class="hr"></div>
        <div class="row gap wrap">
          <div class="badge">Mesuré: <b>${escapeHtml(String(vTxt))}</b></div>
          <div class="badge">Cible: <b>${escapeHtml(rangeTxt)}</b></div>
          ${ev.extraNote ? `<div class="badge warn">${escapeHtml(ev.extraNote)}</div>` : ""}
        </div>
        <div class="hint mt12"><b>${escapeHtml(checklistReco(item, v))}</b></div>
      `;
      itemsRoot.appendChild(row);

      if (ev.verdict !== "ok") recos.push({ level: ev.verdict, text: `${item.label} → ${checklistReco(item, v)}` });
    }

    if (!recos.length) globalRoot.innerHTML = `<div class="badge ok">✅ Checklist OK (selon tes seuils).</div>`;
    else for (const r of recos) globalRoot.appendChild(recoCard(r.level, r.text));

    if (status) status.textContent = "";
  }

  // ----------------------------
  // Render: Tuning
  // ----------------------------
  function renderTuning() {
    const setVal = (id, v) => { const el = $(id); if (el) el.textContent = String(v); };
    setVal("#tuning-might-val", state.ui.tuning.mightDelta);
    setVal("#tuning-def-val", state.ui.tuning.defDelta);
    setVal("#tuning-mdef-val", state.ui.tuning.mdefDelta);
    setVal("#tuning-hp-val", state.ui.tuning.hpDelta);

    const log = $("#tuning-log");
    if (log) log.textContent = (state.ui.tuningLog || []).slice(-250).join("\n");
  }

  function applyTuning() {
    const t = state.ui.tuning;
    const log = [];

    state.data.config.enableDoubling = !!t.enableDoubling;
    state.data.config.enableCrit = !!t.enableCrit;
    log.push(`CONFIG: doubling=${state.data.config.enableDoubling}, crit=${state.data.config.enableCrit}`);

    const affectedWeapons = state.data.weapons.filter(w => t.weaponType === "all" ? true : w.type === t.weaponType);
    if (t.mightDelta !== 0) {
      for (const w of affectedWeapons) {
        const before = safeNum(w.might, 0);
        w.might = before + t.mightDelta;
        log.push(`WEAPON ${w.id}: might ${before} -> ${w.might}`);
      }
    }

    const enemies = state.data.units.filter(u => u.side === "enemy" && (t.enemyClassId ? u.classId === t.enemyClassId : true));
    for (const u of enemies) {
      u.statsOverride = u.statsOverride || {};
      if (t.defDelta !== 0) {
        const base = computeUnitStats(state.data, u)?.def ?? 0;
        const before = safeNum(u.statsOverride.def, base);
        u.statsOverride.def = before + t.defDelta;
        log.push(`ENEMY ${u.id}: DEF ${before} -> ${u.statsOverride.def}`);
      }
      if (t.mdefDelta !== 0) {
        const base = computeUnitStats(state.data, u)?.mdef ?? 0;
        const before = safeNum(u.statsOverride.mdef, base);
        u.statsOverride.mdef = before + t.mdefDelta;
        log.push(`ENEMY ${u.id}: MDEF ${before} -> ${u.statsOverride.mdef}`);
      }
    }

    const stage = getStage(state.data, state.ui.stageId);
    if (stage && t.hpDelta !== 0) {
      const ids = new Set(stage.units || []);
      for (const u of state.data.units) {
        if (!ids.has(u.id)) continue;
        u.statsOverride = u.statsOverride || {};
        const baseHp = computeUnitStats(state.data, u)?.hp ?? 1;
        const before = safeNum(u.statsOverride.hp, baseHp);
        u.statsOverride.hp = before + t.hpDelta;
        log.push(`STAGE ${stage.id} UNIT ${u.id}: HP ${before} -> ${u.statsOverride.hp}`);
      }
    }

    state.ui.tuningLog.push(`--- APPLY @ ${new Date().toLocaleString()} ---`);
    state.ui.tuningLog.push(...log);
  }

  // ----------------------------
  // Binding helpers
  // ----------------------------
  function applyPath(obj, pathParts, value) {
    const numericKeys = new Set(["hp","atk","def","matk","mdef","spd","might","hit","crit","moveCost","rangeMin","rangeMax"]);
    if (pathParts.length === 1) {
      const k = pathParts[0];
      obj[k] = numericKeys.has(k) ? safeNum(value, obj[k]) : value;
      return;
    }
    if (pathParts[0] === "baseStats" && pathParts.length === 2) {
      const k = pathParts[1];
      obj.baseStats = obj.baseStats || {};
      obj.baseStats[k] = safeNum(value, obj.baseStats[k]);
      return;
    }
    if (pathParts[0] === "bonus" && pathParts.length === 2) {
      const k = pathParts[1];
      obj.bonus = obj.bonus || {};
      obj.bonus[k] = safeNum(value, obj.bonus[k]);
      return;
    }
    let ref = obj;
    for (let i = 0; i < pathParts.length - 1; i++) {
      const p = pathParts[i];
      ref[p] = ref[p] || {};
      ref = ref[p];
    }
    const last = pathParts[pathParts.length - 1];
    ref[last] = numericKeys.has(last) ? safeNum(value, ref[last]) : value;
  }

  function ensureValidSelections() {
    const u0 = state.data.units[0]?.id;
    if (!getUnit(state.data, state.ui.duelAttackerId)) state.ui.duelAttackerId = u0;
    if (!getUnit(state.data, state.ui.duelDefenderId)) state.ui.duelDefenderId = u0;

    const t0 = state.data.terrain[0]?.id;
    if (!getTerrain(state.data, state.ui.duelAttTerrainId)) state.ui.duelAttTerrainId = t0;
    if (!getTerrain(state.data, state.ui.duelDefTerrainId)) state.ui.duelDefTerrainId = t0;

    const s0 = state.data.stages[0]?.id;
    if (!getStage(state.data, state.ui.stageId)) state.ui.stageId = s0;

    const c0 = state.data.classes[0]?.id;
    if (!getClass(state.data, state.ui.tuning.enemyClassId)) state.ui.tuning.enemyClassId = c0;
  }

  // ----------------------------
  // Recompute + Render (debounced)
  // ----------------------------
  const recomputeAndRender = debounce(() => {
    state.derived.errors = validateDataShape(state.data);
    state.derived.gameExport = exportToGameFormat(state.data);

    state.ui.enableDoubling = $("#toggle-doubling")?.checked ?? state.data.config.enableDoubling;
    state.ui.enableCrit = $("#toggle-crit")?.checked ?? state.data.config.enableCrit;

    state.derived.micro = computeMicro(state.data, state.ui);
    state.derived.checklist = computeChecklistMetrics(state.data, state.ui);

    renderAll();
  }, 120);

  function renderAll() {
    renderJsonAreas();
    renderDataForms();
    renderSelectOptions();
    renderMicro();
    renderMicroRecos();
    renderCompareTable();
    ensureDuelsAnalysisBlocks();
    renderDuelsAllUnitsAndAggregates();
    renderStage();
    renderChecklist();
    renderTuning();
    // macro results stays as last computed
    renderMacroResults();
  }

  // ----------------------------
  // Tabs
  // ----------------------------
  function setActiveTab(tab) {
    state.ui.tab = tab;
    $$(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
    $$(".tabpane").forEach(p => p.classList.toggle("active", p.id === `tab-${tab}`));
  }

  // ----------------------------
  // Events
  // ----------------------------
  function initTabs() {
    $("#tabs")?.addEventListener("click", (e) => {
      const btn = e.target.closest(".tab");
      if (!btn) return;
      setActiveTab(btn.dataset.tab);
    });
  }

  function initDataEditor() {
    $("#btn-validate")?.addEventListener("click", () => {
      const raw = $("#json-editor")?.value ?? "";
      try {
        const parsed = JSON.parse(raw);
        const errs = validateDataShape(parsed);
        if (errs.length) {
          state.derived.errors = errs;
          renderJsonAreas();
          return;
        }
        state.data = parsed;
        ensureValidSelections();
        recomputeAndRender();
      } catch (err) {
        state.derived.errors = [`JSON invalide: ${err.message}`];
        renderJsonAreas();
      }
    });

    $("#btn-reset")?.addEventListener("click", () => {
      state.data = deepClone(EXAMPLE_DATA);
      ensureValidSelections();
      recomputeAndRender();
    });

    $("#btn-copy-editor")?.addEventListener("click", async () => {
      await copyToClipboard(JSON.stringify(state.data, null, 2));
    });
    $("#btn-download-editor")?.addEventListener("click", () => {
      downloadText("balance_editor.json", JSON.stringify(state.data, null, 2));
    });

    $("#btn-copy-game")?.addEventListener("click", async () => {
      await copyToClipboard(JSON.stringify(state.derived.gameExport, null, 2));
    });
    $("#btn-download-game")?.addEventListener("click", () => {
      downloadText("balance_game.json", JSON.stringify(state.derived.gameExport, null, 2));
    });

    $("#design-notes")?.addEventListener("input", debounce((e) => {
      state.data.designNotes = e.target.value;
      recomputeAndRender();
    }, 200));
  }

  function initFormsBinding() {
    document.body.addEventListener("input", (e) => {
      const el = e.target;
      const bind = el.dataset.bind;
      const id = el.dataset.id;
      if (!bind || !id) return;

      const [kind, ...pathParts] = bind.split(".");
      if (kind === "class") {
        const obj = state.data.classes.find(x => x.id === id);
        if (!obj) return;
        applyPath(obj, pathParts, el.value);
      } else if (kind === "weapon") {
        const obj = state.data.weapons.find(x => x.id === id);
        if (!obj) return;
        applyPath(obj, pathParts, el.value);
      } else if (kind === "terrain") {
        const obj = state.data.terrain.find(x => x.id === id);
        if (!obj) return;
        applyPath(obj, pathParts, el.value);
      }
      recomputeAndRender();
    });

    document.body.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;

      if (action === "del-class") state.data.classes = state.data.classes.filter(x => x.id !== id);
      else if (action === "dup-class") {
        const src = state.data.classes.find(x => x.id === id);
        if (src) { const copy = deepClone(src); copy.id = uid("class"); copy.name += " (copy)"; state.data.classes.push(copy); }
      } else if (action === "del-weapon") state.data.weapons = state.data.weapons.filter(x => x.id !== id);
      else if (action === "dup-weapon") {
        const src = state.data.weapons.find(x => x.id === id);
        if (src) { const copy = deepClone(src); copy.id = uid("weapon"); copy.name += " (copy)"; state.data.weapons.push(copy); }
      } else if (action === "del-terrain") state.data.terrain = state.data.terrain.filter(x => x.id !== id);
      else if (action === "dup-terrain") {
        const src = state.data.terrain.find(x => x.id === id);
        if (src) { const copy = deepClone(src); copy.id = uid("terrain"); copy.name += " (copy)"; state.data.terrain.push(copy); }
      }
      recomputeAndRender();
    });

    $("#btn-add-class")?.addEventListener("click", () => {
      state.data.classes.push({ id: uid("class"), name: "Nouvelle classe", role: "custom", baseStats: { hp: 18, atk: 5, def: 3, matk: 1, mdef: 2, spd: 5 } });
      recomputeAndRender();
    });

    $("#btn-add-weapon")?.addEventListener("click", () => {
      state.data.weapons.push({ id: uid("weapon"), name: "Nouvelle arme", type: "physical", might: 3, hit: 80, crit: 0, rangeMin: 1, rangeMax: 1 });
      recomputeAndRender();
    });

    $("#btn-add-terrain")?.addEventListener("click", () => {
      state.data.terrain.push({ id: uid("terrain"), name: "Nouveau terrain", moveCost: 1, bonus: { def: 0, mdef: 0, avoid: 0 } });
      recomputeAndRender();
    });
  }

  function initDuelEvents() {
    $("#duel-attacker")?.addEventListener("change", (e) => { state.ui.duelAttackerId = e.target.value; recomputeAndRender(); });
    $("#duel-defender")?.addEventListener("change", (e) => { state.ui.duelDefenderId = e.target.value; recomputeAndRender(); });
    $("#duel-attacker-terrain")?.addEventListener("change", (e) => { state.ui.duelAttTerrainId = e.target.value; recomputeAndRender(); });
    $("#duel-defender-terrain")?.addEventListener("change", (e) => { state.ui.duelDefTerrainId = e.target.value; recomputeAndRender(); });

    $("#toggle-doubling")?.addEventListener("change", (e) => { state.ui.enableDoubling = e.target.checked; recomputeAndRender(); });
    $("#toggle-crit")?.addEventListener("change", (e) => { state.ui.enableCrit = e.target.checked; recomputeAndRender(); });
  }

  function initStageEvents() {
    $("#stage-select")?.addEventListener("change", (e) => { state.ui.stageId = e.target.value; recomputeAndRender(); });
    $("#btn-stage-reload")?.addEventListener("click", () => recomputeAndRender());

    $("#macro-radius")?.addEventListener("change", (e) => { state.ui.macroRadius = safeNum(e.target.value, 6); });

    $("#btn-macro-run")?.addEventListener("click", () => {
      const stage = getStage(state.data, state.ui.stageId);
      if (!stage) return;
      state.derived.macro = computeMacro(state.data, stage, state.ui.macroRadius);
      renderMacroResults();
    });
  }

  function initChecklistEvents() {
    $("#btn-checklist-reset")?.addEventListener("click", () => { state.data.checklist = deepClone(EXAMPLE_DATA.checklist); recomputeAndRender(); });
    $("#btn-checklist-apply")?.addEventListener("click", () => {
      const raw = $("#checklist-editor")?.value ?? "[]";
      const status = $("#checklist-status");
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) throw new Error("Checklist doit être un tableau.");
        state.data.checklist = parsed;
        if (status) status.textContent = "✅ Checklist appliquée.";
        recomputeAndRender();
      } catch (err) {
        if (status) status.textContent = `❌ ${err.message}`;
      }
    });
    $("#btn-checklist-copy")?.addEventListener("click", async () => {
      await copyToClipboard($("#checklist-editor")?.value ?? "");
    });
  }

  function initTuningEvents() {
    const t = state.ui.tuning;

    $("#tuning-weapon-type")?.addEventListener("change", (e) => { t.weaponType = e.target.value; });
    $("#tuning-might")?.addEventListener("input", (e) => { t.mightDelta = safeNum(e.target.value, 0); renderTuning(); });

    $("#tuning-enemy-class")?.addEventListener("change", (e) => { t.enemyClassId = e.target.value; });
    $("#tuning-def")?.addEventListener("input", (e) => { t.defDelta = safeNum(e.target.value, 0); renderTuning(); });
    $("#tuning-mdef")?.addEventListener("input", (e) => { t.mdefDelta = safeNum(e.target.value, 0); renderTuning(); });
    $("#tuning-hp")?.addEventListener("input", (e) => { t.hpDelta = safeNum(e.target.value, 0); renderTuning(); });

    $("#tuning-toggle-doubling")?.addEventListener("change", (e) => { t.enableDoubling = e.target.checked; });
    $("#tuning-toggle-crit")?.addEventListener("change", (e) => { t.enableCrit = e.target.checked; });

    $("#btn-tuning-reset")?.addEventListener("click", () => {
      state.ui.tuning = { weaponType: "all", mightDelta: 0, enemyClassId: state.data.classes[0]?.id || "axe", defDelta: 0, mdefDelta: 0, hpDelta: 0, enableDoubling: false, enableCrit: false };
      $("#tuning-weapon-type").value = state.ui.tuning.weaponType;
      $("#tuning-might").value = 0;
      $("#tuning-def").value = 0;
      $("#tuning-mdef").value = 0;
      $("#tuning-hp").value = 0;
      $("#tuning-toggle-doubling").checked = false;
      $("#tuning-toggle-crit").checked = false;
      renderTuning();
    });

    $("#btn-tuning-apply")?.addEventListener("click", () => {
      applyTuning();
      recomputeAndRender();
    });
  }

  // ----------------------------
  // Boot
  // ----------------------------
  function boot() {
    initTabs();
    initDataEditor();
    initFormsBinding();
    initDuelEvents();
    initStageEvents();
    initChecklistEvents();
    initTuningEvents();

    $("#toggle-doubling").checked = !!state.data.config.enableDoubling;
    $("#toggle-crit").checked = !!state.data.config.enableCrit;

    ensureValidSelections();
    recomputeAndRender();
  }

  boot();
})();
