// app.js
// FE-like Balance Lab — Vanilla, offline
// Architecture:
// - state.data : JSON interne (éditeur) = source de vérité
// - pure functions (logic) : computeEffectiveStats, simulateAttack, computeTTK/EHP, metrics, checklist eval
// - UI : renderTabs/renderForms/renderMicro/renderStage/renderChecklist/renderTuning
// - every change triggers debounced recompute+render

(function () {
  "use strict";

  // ----------------------------
  // 0) Utils
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

  // ----------------------------
  // 1) Exemple data interne (éditeur)
  // ----------------------------
  const EXAMPLE_DATA = {
    meta: {
      version: "1.0",
      name: "Example Balance Set",
      createdAt: new Date().toISOString(),
    },
    config: {
      enableDoubling: false,
      enableCrit: false,
      critMultiplier: 3,
      baseAvoid: 0,
    },
    designNotes: "Notes ici : décisions, TODO, hypothèses…",
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
  // 2) State
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
      tuning: {
        weaponType: "all",
        mightDelta: 0,
        enemyClassId: "axe",
        defDelta: 0,
        mdefDelta: 0,
        hpDelta: 0,
        enableDoubling: false,
        enableCrit: false,
      },
      tuningLog: [],
    },
    derived: {
      errors: [],
      gameExport: null,
      micro: null,
      checklist: null,
      macro: null,
    }
  };

  // ----------------------------
  // 3) Index maps (helpers)
  // ----------------------------
  function indexById(arr) {
    const m = new Map();
    for (const it of arr) m.set(it.id, it);
    return m;
  }

  function getClass(data, id) { return data.classes.find(c => c.id === id) || null; }
  function getWeapon(data, id) { return data.weapons.find(w => w.id === id) || null; }
  function getTerrain(data, id) { return data.terrain.find(t => t.id === id) || null; }
  function getUnit(data, id) { return data.units.find(u => u.id === id) || null; }
  function getStage(data, id) { return data.stages.find(s => s.id === id) || null; }

  // ----------------------------
  // 4) Pure logic: stats & combat
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

  function computeHitChance(attackerStats, weapon, defenderStatsWithAvoid, context) {
    const baseHit = safeNum(weapon.hit, 0);
    const avoid = safeNum(defenderStatsWithAvoid.avoid, 0);
    const pct = (baseHit - avoid) / 100;
    return clamp01(pct);
  }

  function computeAttacksCount(attackerStats, defenderStats, context) {
    if (!context.enableDoubling) return 1;
    return attackerStats.spd >= defenderStats.spd + 4 ? 2 : 1;
  }

  function simulateAttack(attackerUnit, defenderUnit, context) {
    const data = context.data;

    const aStats = computeUnitStats(data, attackerUnit);
    const dStatsBase = computeUnitStats(data, defenderUnit);
    const weapon = getWeapon(data, attackerUnit.weaponId);
    const defWeapon = getWeapon(data, defenderUnit.weaponId);
    if (!aStats || !dStatsBase || !weapon) return null;

    const defTerrain = getTerrain(data, context.defenderTerrainId);
    const dStats = applyTerrainToDefender(dStatsBase, defTerrain);

    const hitChance = computeHitChance(aStats, weapon, dStats, context);
    const attacksCount = computeAttacksCount(aStats, dStatsBase, context);

    let isMagic = false;
    let isHeal = false;

    let effectiveAtk = 0;
    let effectiveDef = 0;

    if (weapon.type === "physical") {
      effectiveAtk = aStats.atk;
      effectiveDef = dStats.def;
      isMagic = false;
    } else if (weapon.type === "magic") {
      effectiveAtk = aStats.matk;
      effectiveDef = dStats.mdef;
      isMagic = true;
    } else if (weapon.type === "heal") {
      isHeal = true;
      isMagic = false;
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
      isMagic,
      isHeal,
      attacksCount,
      expectedDamage,
      attacker: { id: attackerUnit.id, name: attackerUnit.name, weapon: weapon.name, weaponType: weapon.type },
      defender: { id: defenderUnit.id, name: defenderUnit.name, weapon: defWeapon?.name || "(none)" },
      debug: {
        effectiveAtk,
        effectiveDef,
        defenderAvoid: safeNum(dStats.avoid, 0),
        terrain: defTerrain?.name || "—",
      }
    };
  }

  function computeTTK(targetHp, expectedDamage) {
    const hp = Math.max(1, safeNum(targetHp, 1));
    const ed = safeNum(expectedDamage, 0);
    if (ed <= 0) return Infinity;
    return hp / ed;
  }

  function computeEHP(hp, incomingExpectedDamage) {
    const h = Math.max(1, safeNum(hp, 1));
    const dmg = safeNum(incomingExpectedDamage, 0);
    if (dmg <= 0) return Infinity;
    return h / dmg;
  }

  // ----------------------------
  // 5) Metrics for Micro
  // ----------------------------
  function computeMicro(data, ui) {
    const attacker = getUnit(data, ui.duelAttackerId);
    const defender = getUnit(data, ui.duelDefenderId);
    if (!attacker || !defender) return { error: "Missing attacker/defender." };

    const context = {
      data,
      attackerTerrainId: ui.duelAttTerrainId,
      defenderTerrainId: ui.duelDefTerrainId,
      enableDoubling: ui.enableDoubling,
      enableCrit: ui.enableCrit,
      critMultiplier: data.config.critMultiplier,
      baseAvoid: data.config.baseAvoid,
    };

    const res = simulateAttack(attacker, defender, context);
    if (!res) return { error: "Simulation failed." };

    const aStats = computeUnitStats(data, attacker);
    const dStats = computeUnitStats(data, defender);

    const ttk = computeTTK(dStats.hp, res.expectedDamage);
    const back = simulateAttack(defender, attacker, {
      ...context,
      attackerTerrainId: ui.duelDefTerrainId,
      defenderTerrainId: ui.duelAttTerrainId,
    });

    const ehpTurns = back ? computeEHP(aStats.hp, back.expectedDamage) : Infinity;

    return { attacker, defender, res, back, ttk, ehpTurns };
  }

  function computeClassVsStandardTable(data, ui) {
    const standard = getUnit(data, ui.duelDefenderId);
    if (!standard) return [];

    const standardTerrainId = ui.duelDefTerrainId;
    const rows = [];

    for (const cls of data.classes) {
      const baseStats = cls.baseStats || {};
      const preferMagic = safeNum(baseStats.matk, 0) >= safeNum(baseStats.atk, 0);

      let weapon = null;
      if (preferMagic) weapon = data.weapons.find(w => w.type === "magic") || null;
      if (!weapon) weapon = data.weapons.find(w => w.type === "physical") || null;
      if (!weapon) weapon = data.weapons[0] || null;
      if (!weapon) continue;

      const temp = { id: `tmp_${cls.id}`, name: cls.name, classId: cls.id, weaponId: weapon.id, side: "player", level: 1, position: { x: 0, y: 0 } };

      const sim = simulateAttack(temp, standard, {
        data,
        attackerTerrainId: "plain",
        defenderTerrainId: standardTerrainId,
        enableDoubling: ui.enableDoubling,
        enableCrit: ui.enableCrit,
        critMultiplier: data.config.critMultiplier,
        baseAvoid: data.config.baseAvoid,
      });

      const dStats = computeUnitStats(data, standard);
      const ttk = computeTTK(dStats.hp, sim?.expectedDamage ?? 0);

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

  function computeMicroRecommendations(micro) {
    const out = [];
    if (!micro || micro.error) return out;

    const { res, ttk } = micro;
    const hit = res.hitChance;
    const dmg = res.damage;

    if (!Number.isFinite(ttk) || ttk === Infinity) {
      out.push({ level: "fail", text: "Dégâts attendus = 0 → augmente might, baisse DEF/MDEF cible, ou change le type (ATK vs DEF / MATK vs MDEF)." });
    } else if (ttk > 4) {
      out.push({ level: "warn", text: `TTK élevé (${round2(ttk)}). Reco: +1 might sur l’arme de l’attaquant, ou -1 DEF/MDEF sur la cible.` });
    } else if (ttk < 1.2 && dmg > 0) {
      out.push({ level: "warn", text: `One-shot probable (TTK ${round2(ttk)}). Reco: +2 HP cible ou -1 might.` });
    }

    if (hit < 0.5) out.push({ level: "warn", text: `Hit faible (${round0(hit * 100)}%). Reco: +10 hit arme ou -10 avoid terrain/cible.` });
    if (res.damage === 0) out.push({ level: "fail", text: "Dégâts = 0 (après DEF/MDEF + terrain). Reco: baisser DEF/MDEF terrain/cible ou augmenter le scaling/stat de l’attaquant." });

    return out;
  }

  // ----------------------------
  // 6) Stage macro (simple, sans pathfinding)
  // ----------------------------
  function manhattan(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  function weaponThreatRange(weapon) {
    const min = safeNum(weapon.rangeMin, 1);
    const max = safeNum(weapon.rangeMax, 1);
    return { min, max };
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

  function computeMacro(data, stage, opts) {
    const unitObjs = (stage.units || []).map(id => getUnit(data, id)).filter(Boolean);
    const players = unitObjs.filter(u => u.side === "player");
    const enemies = unitObjs.filter(u => u.side === "enemy");
    const radius = safeNum(opts.radius, 6);

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

        threats += 1;

        const sim = simulateAttack(e, p, {
          data,
          attackerTerrainId: "plain",
          defenderTerrainId: "plain",
          enableDoubling: data.config.enableDoubling,
          enableCrit: data.config.enableCrit,
          critMultiplier: data.config.critMultiplier,
          baseAvoid: data.config.baseAvoid,
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

    let avgTtk = 0;
    let count = 0;
    for (const p of players) {
      let best = null;
      let bestDist = Infinity;
      for (const e of enemies) {
        const d = manhattan(p.position, e.position);
        if (d < bestDist) { bestDist = d; best = e; }
      }
      if (!best) continue;
      const sim = simulateAttack(p, best, {
        data,
        attackerTerrainId: "plain",
        defenderTerrainId: "plain",
        enableDoubling: data.config.enableDoubling,
        enableCrit: data.config.enableCrit,
        critMultiplier: data.config.critMultiplier,
        baseAvoid: data.config.baseAvoid,
      });
      const eStats = computeUnitStats(data, best);
      if (!sim || !eStats) continue;
      const ttk = computeTTK(eStats.hp, sim.expectedDamage);
      if (!Number.isFinite(ttk)) continue;
      avgTtk += ttk;
      count += 1;
    }
    avgTtk = count ? avgTtk / count : Infinity;

    return { perPlayer, avgTtk: Number.isFinite(avgTtk) ? round2(avgTtk) : Infinity };
  }

  // ----------------------------
  // 7) Checklist evaluation (pure)
  // ----------------------------
  function computeChecklistMetrics(data, ui) {
    const standard = getUnit(data, ui.duelDefenderId);
    if (!standard) return { error: "No standard enemy selected." };

    const priestClass = data.classes.find(c => c.id === "priest") || data.classes.find(c => c.role === "support");
    const mageClass = data.classes.find(c => c.id === "mage") || data.classes.find(c => c.role === "magic");
    const tankClass = data.classes.find(c => c.role === "tank") || data.classes.find(c => c.id === "lancer") || data.classes[0];

    const mkTemp = (cls, weaponTypePref) => {
      if (!cls) return null;
      let w = null;
      if (weaponTypePref) w = data.weapons.find(x => x.type === weaponTypePref) || null;
      if (!w) w = data.weapons[0] || null;
      return { id: `tmp_${cls.id}`, name: cls.name, classId: cls.id, weaponId: w.id, side: "player", level: 1, position: { x: 0, y: 0 } };
    };

    const defTerrainId = ui.duelDefTerrainId;

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
        attackerTerrainId: "plain",
        defenderTerrainId: defTerrainId,
        enableDoubling: ui.enableDoubling,
        enableCrit: ui.enableCrit,
        critMultiplier: data.config.critMultiplier,
        baseAvoid: data.config.baseAvoid,
      });
      const stStats = computeUnitStats(data, standard);
      if (!sim || !stStats) continue;

      const ttk = computeTTK(stStats.hp, sim.expectedDamage);
      if (!Number.isFinite(ttk)) continue;

      sumTtk += ttk;
      sumHit += sim.hitChance;
      n += 1;
    }

    const ttkAvg = n ? sumTtk / n : Infinity;
    const hitAvg = n ? sumHit / n : 0;

    const priest = priestClass ? mkTemp(priestClass, "magic") : null;
    const mage = mageClass ? mkTemp(mageClass, "magic") : null;

    const priestSim = priest ? simulateAttack(priest, standard, {
      data, attackerTerrainId: "plain", defenderTerrainId: defTerrainId,
      enableDoubling: ui.enableDoubling, enableCrit: ui.enableCrit, critMultiplier: data.config.critMultiplier, baseAvoid: data.config.baseAvoid
    }) : null;

    const mageSim = mage ? simulateAttack(mage, standard, {
      data, attackerTerrainId: "plain", defenderTerrainId: defTerrainId,
      enableDoubling: ui.enableDoubling, enableCrit: ui.enableCrit, critMultiplier: data.config.critMultiplier, baseAvoid: data.config.baseAvoid
    }) : null;

    const tank = tankClass ? mkTemp(tankClass, "physical") : null;
    let tankSurviveHits = Infinity;
    if (tank) {
      const back = simulateAttack(standard, tank, {
        data, attackerTerrainId: defTerrainId, defenderTerrainId: "plain",
        enableDoubling: ui.enableDoubling, enableCrit: ui.enableCrit, critMultiplier: data.config.critMultiplier, baseAvoid: data.config.baseAvoid
      });
      const tStats = computeUnitStats(data, tank);
      if (back && tStats && back.expectedDamage > 0) tankSurviveHits = tStats.hp / back.expectedDamage;
    }

    let mageEhpTurns = Infinity;
    if (mage) {
      const back = simulateAttack(standard, mage, {
        data, attackerTerrainId: defTerrainId, defenderTerrainId: "plain",
        enableDoubling: ui.enableDoubling, enableCrit: ui.enableCrit, critMultiplier: data.config.critMultiplier, baseAvoid: data.config.baseAvoid
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
    const min = item.min;
    const max = item.max;

    const ok = Number.isFinite(val) && val >= min && val <= max;
    const warn = Number.isFinite(val) && (val < min * 0.8 || val > max * 1.2) === false && !ok;

    let verdict = "fail";
    if (ok) verdict = "ok";
    else if (warn) verdict = "warn";

    let extraNote = null;
    if (item.extra?.checkMageEhpMax != null && item.metric === "mage_expected_damage") {
      const mageEhpTurns = metrics.mage_ehp_turns;
      if (Number.isFinite(mageEhpTurns) && mageEhpTurns > 3) {
        verdict = verdict === "ok" ? "warn" : verdict;
        extraNote = `Mage EHP trop élevé (survit ~${round2(mageEhpTurns)} tours).`;
      }
    }

    return { verdict, value: val, extraNote };
  }

  function checklistReco(item, metrics) {
    const v = metrics[item.metric];
    if (!Number.isFinite(v)) return "Valeur non calculable (dégâts 0 / données manquantes).";

    if (v < item.min) {
      if (item.metric.includes("hit")) return "Reco: +10 hit sur armes de base, ou -10 avoid terrain standard.";
      if (item.metric.includes("ttk")) return "Reco: +1 might sur armes de base, ou -1 DEF/MDEF ennemi standard.";
      if (item.metric.includes("priest")) return "Reco: utiliser arme magic (MATK vs MDEF) + ajuster might de la sarbacane (+1) ou baisser MDEF standard (-1).";
      if (item.metric.includes("mage")) return "Reco: +1 might sur sort de base OU +1 MATK mage (baseStats).";
      if (item.metric.includes("tank")) return "Reco: +1 HP/+1 DEF tank OU -1 might arme standard ennemie.";
      return "Reco: augmenter puissance attaquants (might/stat) ou réduire défenses cible.";
    }
    if (v > item.max) {
      if (item.metric.includes("hit")) return "Reco: baisser hit sur armes de base (-5) ou augmenter avoid terrain standard.";
      if (item.metric.includes("ttk")) return "Reco: +1 HP ou +1 DEF/MDEF ennemi standard, ou -1 might sur armes de base.";
      if (item.metric.includes("priest")) return "Reco: réduire might de l’arme du prêtre (-1) ou augmenter MDEF standard (+1).";
      if (item.metric.includes("mage")) return "Reco: réduire might sort de base (-1) OU augmenter MDEF standard (+1).";
      if (item.metric.includes("tank")) return "Reco: baisser DEF/HP tank (-1) ou augmenter might arme standard ennemie (+1).";
      return "Reco: réduire puissance attaquants ou augmenter défenses/HP cible.";
    }
    return "OK (dans la plage).";
  }

  // ----------------------------
  // 8) Export format jeu
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
  // 9) Validation / parsing
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
    }

    for (const s of (data.stages || [])) {
      const w = safeNum(s.width, 0), h = safeNum(s.height, 0);
      if (w <= 0 || h <= 0) errors.push(`Stage "${s.id}": width/height invalides.`);
      const grid = s.terrainGrid || [];
      if (grid.length !== w * h) errors.push(`Stage "${s.id}": terrainGrid longueur ${grid.length} ≠ width*height ${w * h}.`);
      for (const tid of grid) if (!terrainIds.has(tid)) { errors.push(`Stage "${s.id}": terrain id inconnu "${tid}".`); break; }
      for (const uid of (s.units || [])) if (!unitIds.has(uid)) { errors.push(`Stage "${s.id}": unit id inconnu "${uid}".`); break; }
    }

    if (data.checklist && !Array.isArray(data.checklist)) errors.push(`checklist doit être un tableau si présent.`);
    return errors;
  }

  // ----------------------------
  // 10) Compute derived + render
  // ----------------------------
  const recomputeAndRender = debounce(() => {
    state.derived.errors = validateDataShape(state.data);
    state.derived.gameExport = exportToGameFormat(state.data);

    state.ui.enableDoubling = $("#toggle-doubling")?.checked ?? state.data.config.enableDoubling;
    state.ui.enableCrit = $("#toggle-crit")?.checked ?? state.data.config.enableCrit;

    state.derived.micro = computeMicro(state.data, state.ui);
    state.derived.macro = null;
    state.derived.checklist = computeChecklistMetrics(state.data, state.ui);

    renderAll();
  }, 120);

  // ----------------------------
  // 11) UI rendering helpers
  // ----------------------------
  function renderAll() {
    renderJsonAreas();
    renderDataForms();
    renderSelectOptions();
    renderMicro();
    renderCompareTable();
    renderMicroRecos();
    renderStage();
    renderChecklist();
    renderTuning();
  }

  function renderJsonAreas() {
    const editor = $("#json-editor");
    const status = $("#json-status");
    const exportPreview = $("#export-preview");
    const notes = $("#design-notes");

    if (document.activeElement !== editor) editor.value = JSON.stringify(state.data, null, 2);
    if (notes && document.activeElement !== notes) notes.value = state.data.designNotes || "";

    const errs = state.derived.errors || [];
    if (errs.length) {
      status.textContent = `❌ ${errs.length} erreur(s) : ${errs[0]}${errs.length > 1 ? " …" : ""}`;
      status.style.color = "var(--fail)";
    } else {
      status.textContent = "✅ JSON valide (structure + références).";
      status.style.color = "var(--ok)";
    }

    exportPreview.textContent = JSON.stringify(state.derived.gameExport, null, 2);
  }

  function renderSelectOptions() {
    const attackerSel = $("#duel-attacker");
    const defenderSel = $("#duel-defender");
    const terrA = $("#duel-attacker-terrain");
    const terrD = $("#duel-defender-terrain");

    const fillSelect = (el, options, selected) => {
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

    fillSelect(attackerSel, units, state.ui.duelAttackerId);
    fillSelect(defenderSel, units, state.ui.duelDefenderId);

    const terrains = state.data.terrain.map(t => ({
      value: t.id,
      label: `${t.name} (+DEF ${t.bonus?.def ?? 0}, +MDEF ${t.bonus?.mdef ?? 0}, AVD ${t.bonus?.avoid ?? 0})`
    }));
    fillSelect(terrA, terrains, state.ui.duelAttTerrainId);
    fillSelect(terrD, terrains, state.ui.duelDefTerrainId);

    const stageSel = $("#stage-select");
    const stageOpts = state.data.stages.map(s => ({ value: s.id, label: s.name }));
    fillSelect(stageSel, stageOpts, state.ui.stageId);

    const enemyClassSel = $("#tuning-enemy-class");
    const classOpts = state.data.classes.map(c => ({ value: c.id, label: `${c.name} (${c.id})` }));
    fillSelect(enemyClassSel, classOpts, state.ui.tuning.enemyClassId);
  }

  function renderDataForms() {
    renderClassesForm();
    renderWeaponsForm();
    renderTerrainForm();
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
          <div class="badge"><b>${c.name}</b> <span class="hint">(${c.id})</span></div>
          <div class="row gap">
            <button class="btn small" data-action="dup-class" data-id="${c.id}">Dupliquer</button>
            <button class="btn small" data-action="del-class" data-id="${c.id}">Supprimer</button>
          </div>
        </div>

        <div class="form-row mt8">
          <div>
            <label class="label">Nom</label>
            <input class="input" data-bind="class.name" data-id="${c.id}" value="${escapeAttr(c.name)}" />
          </div>
          <div>
            <label class="label">Role</label>
            <input class="input" data-bind="class.role" data-id="${c.id}" value="${escapeAttr(c.role || "")}" placeholder="dps/tank/support..." />
          </div>
        </div>

        <div class="mt8">
          <label class="label">Base stats</label>
          <div class="form-row">
            <div class="mini">
              ${statInput("hp", c.baseStats?.hp, "class.baseStats", c.id)}
              ${statInput("atk", c.baseStats?.atk, "class.baseStats", c.id)}
              ${statInput("def", c.baseStats?.def, "class.baseStats", c.id)}
              ${statInput("matk", c.baseStats?.matk, "class.baseStats", c.id)}
              ${statInput("mdef", c.baseStats?.mdef, "class.baseStats", c.id)}
              ${statInput("spd", c.baseStats?.spd, "class.baseStats", c.id)}
            </div>
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
          <div class="badge"><b>${w.name}</b> <span class="hint">(${w.id})</span></div>
          <div class="row gap">
            <button class="btn small" data-action="dup-weapon" data-id="${w.id}">Dupliquer</button>
            <button class="btn small" data-action="del-weapon" data-id="${w.id}">Supprimer</button>
          </div>
        </div>

        <div class="form-row mt8">
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

        <div class="form-row mt8">
          <div class="mini">
            ${numInput("might", w.might, "weapon.might", w.id)}
            ${numInput("hit", w.hit, "weapon.hit", w.id)}
            ${numInput("crit", w.crit || 0, "weapon.crit", w.id)}
            ${numInput("rMin", w.rangeMin, "weapon.rangeMin", w.id)}
            ${numInput("rMax", w.rangeMax, "weapon.rangeMax", w.id)}
            <div></div>
          </div>
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
          <div class="badge"><b>${t.name}</b> <span class="hint">(${t.id})</span></div>
          <div class="row gap">
            <button class="btn small" data-action="dup-terrain" data-id="${t.id}">Dupliquer</button>
            <button class="btn small" data-action="del-terrain" data-id="${t.id}">Supprimer</button>
          </div>
        </div>

        <div class="form-row mt8">
          <div>
            <label class="label">Nom</label>
            <input class="input" data-bind="terrain.name" data-id="${t.id}" value="${escapeAttr(t.name)}" />
          </div>
          <div>
            <label class="label">Move cost</label>
            <input class="input" type="number" data-bind="terrain.moveCost" data-id="${t.id}" value="${escapeAttr(t.moveCost)}" />
          </div>
        </div>

        <div class="mt8">
          <label class="label">Bonus</label>
          <div class="form-row">
            <div class="mini">
              ${numInput("def", t.bonus?.def ?? 0, "terrain.bonus.def", t.id)}
              ${numInput("mdef", t.bonus?.mdef ?? 0, "terrain.bonus.mdef", t.id)}
              ${numInput("avoid", t.bonus?.avoid ?? 0, "terrain.bonus.avoid", t.id)}
              <div></div><div></div><div></div>
            </div>
          </div>
        </div>
      `;
      root.appendChild(el);
    }
  }

  function renderMicro() {
    const root = $("#duel-results");
    if (!root) return;
    root.innerHTML = "";

    const micro = state.derived.micro;
    if (!micro || micro.error) {
      root.innerHTML = `<div class="badge fail">❌ ${micro?.error || "Erreur micro"}</div>`;
      return;
    }

    const { res, back, ttk, ehpTurns } = micro;

    const hitPct = round0(res.hitChance * 100);
    const exp = round2(res.expectedDamage);
    const dmg = res.damage;
    const attacks = res.attacksCount;
    const isMagic = res.isMagic ? "Magic" : "Physical";
    const terrain = res.debug.terrain;

    const targetHp = computeUnitStats(state.data, micro.defender).hp;
    const ehpTxt = Number.isFinite(ehpTurns) ? `${round2(ehpTurns)} tours` : "∞";
    const ttkTxt = Number.isFinite(ttk) ? `${round2(ttk)} tours` : "∞";

    root.appendChild(kvCard("Hit chance", `${hitPct}%`, hitPct < 50 ? "warn" : "ok"));
    root.appendChild(kvCard("Damage (par hit)", `${dmg}`, dmg === 0 ? "fail" : "ok"));
    root.appendChild(kvCard("Type", `${isMagic}`, "ok"));
    root.appendChild(kvCard("Attaques / tour", `${attacks}`, "ok"));
    root.appendChild(kvCard("Expected damage / tour", `${exp}`, exp <= 0 ? "fail" : "ok"));
    root.appendChild(kvCard("TTK (cible)", `${ttkTxt} (HP ${targetHp})`, ttk > 3 ? "warn" : "ok"));
    root.appendChild(kvCard("EHP (attaquant)", `${ehpTxt}`, ehpTurns < 1.8 ? "warn" : "ok"));
    root.appendChild(kvCard("Terrain (cible)", `${terrain}`, "ok"));

    if (back) {
      const backHit = round0(back.hitChance * 100);
      root.appendChild(divHr());
      root.appendChild(kvCard("Retour (cible → attaquant) expected", `${round2(back.expectedDamage)} (Hit ${backHit}%)`, "ok"));
    }
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

  function renderMicroRecos() {
    const root = $("#micro-recos");
    if (!root) return;
    root.innerHTML = "";
    const recos = computeMicroRecommendations(state.derived.micro);
    if (!recos.length) {
      root.innerHTML = `<div class="badge ok">✅ Rien à signaler (dans ce duel).</div>`;
      return;
    }
    for (const r of recos) root.appendChild(recoCard(r.level, r.text));
  }

  function renderStage() {
    const stage = getStage(state.data, state.ui.stageId);
    const sumRoot = $("#stage-summary");
    const gridRoot = $("#stage-grid");
    if (!stage || !sumRoot || !gridRoot) return;

    const sum = computeStageSummary(state.data, stage);

    sumRoot.innerHTML = "";
    sumRoot.appendChild(kvCard("Unités (player/enemy)", `${sum.playersCount} / ${sum.enemiesCount}`, "ok"));
    sumRoot.appendChild(kvCard("Moyennes joueurs", sum.playersAvg ? fmtStats(sum.playersAvg) : "—", "ok"));
    sumRoot.appendChild(kvCard("Moyennes ennemis", sum.enemiesAvg ? fmtStats(sum.enemiesAvg) : "—", "ok"));

    const pc = sum.playersClasses.map(([k, v]) => `${k}:${v}`).join(" · ") || "—";
    const ec = sum.enemiesClasses.map(([k, v]) => `${k}:${v}`).join(" · ") || "—";
    sumRoot.appendChild(kvCard("Répartition classes (P)", pc, "ok"));
    sumRoot.appendChild(kvCard("Répartition classes (E)", ec, "ok"));

    gridRoot.textContent = renderAsciiGrid(stage);
  }

  function renderChecklist() {
    const itemsRoot = $("#checklist-items");
    const globalRoot = $("#global-recos");
    const editor = $("#checklist-editor");
    const status = $("#checklist-status");

    if (!itemsRoot || !globalRoot || !editor) return;

    if (document.activeElement !== editor) editor.value = JSON.stringify(state.data.checklist || [], null, 2);

    const metrics = state.derived.checklist;
    if (!metrics || metrics.error) {
      itemsRoot.innerHTML = `<div class="badge fail">❌ ${metrics?.error || "Checklist metrics error"}</div>`;
      globalRoot.innerHTML = "";
      if (status) { status.textContent = "Erreur checklist."; status.style.color = "var(--fail)"; }
      return;
    }

    itemsRoot.innerHTML = "";
    globalRoot.innerHTML = "";

    const all = state.data.checklist || [];
    const recos = [];

    for (const item of all) {
      const ev = evalChecklistItem(item, metrics);
      const badge = ev.verdict;
      const v = metrics[item.metric];
      const vTxt = Number.isFinite(v) ? round2(v) : "∞";
      const rangeTxt = `[${item.min}..${item.max}]`;

      const row = document.createElement("div");
      row.className = "card";
      row.innerHTML = `
        <div class="row gap wrap" style="justify-content:space-between">
          <div>
            <div><b>${escapeHtml(item.label)}</b></div>
            <div class="hint">metric: <code>${escapeHtml(item.metric)}</code> · seuil: ${escapeHtml(rangeTxt)}</div>
          </div>
          ${badgeEl(badge, badge.toUpperCase())}
        </div>
        <div class="hr"></div>
        <div class="row gap wrap">
          <div class="badge">Mesuré: <b>${escapeHtml(String(vTxt))}</b></div>
          <div class="badge">Seuil: <b>${escapeHtml(rangeTxt)}</b></div>
          ${ev.extraNote ? `<div class="badge warn">${escapeHtml(ev.extraNote)}</div>` : ""}
        </div>
        <div class="hint mt8">${escapeHtml(checklistReco(item, metrics))}</div>
      `;
      itemsRoot.appendChild(row);

      if (badge !== "ok") recos.push({ level: badge, text: `${item.label} → ${checklistReco(item, metrics)}` });
    }

    if (!recos.length) globalRoot.innerHTML = `<div class="badge ok">✅ Checklist OK (selon les seuils actuels).</div>`;
    else for (const r of recos) globalRoot.appendChild(recoCard(r.level, r.text));

    if (status) { status.textContent = "Checklist appliquée/évaluée."; status.style.color = "var(--muted)"; }
  }

  function renderTuning() {
    const setVal = (id, v) => { const el = $(id); if (el) el.textContent = String(v); };
    setVal("#tuning-might-val", state.ui.tuning.mightDelta);
    setVal("#tuning-def-val", state.ui.tuning.defDelta);
    setVal("#tuning-mdef-val", state.ui.tuning.mdefDelta);
    setVal("#tuning-hp-val", state.ui.tuning.hpDelta);

    const log = $("#tuning-log");
    if (log) log.textContent = (state.ui.tuningLog || []).slice(-200).join("\n");
  }

  // ----------------------------
  // 12) UI components
  // ----------------------------
  function kvCard(k, v, level = "ok") {
    const div = document.createElement("div");
    div.className = "row gap wrap";
    div.style.justifyContent = "space-between";
    div.innerHTML = `<div class="hint">${escapeHtml(k)}</div><div class="badge ${level}"><b>${escapeHtml(String(v))}</b></div>`;
    return div;
  }

  function recoCard(level, text) {
    const div = document.createElement("div");
    div.className = `badge ${level}`;
    div.style.whiteSpace = "normal";
    div.textContent = (level === "fail" ? "❌ " : level === "warn" ? "⚠️ " : "✅ ") + text;
    return div;
  }

  function divHr() { const d = document.createElement("div"); d.className = "hr"; return d; }
  function badgeEl(level, text) { return `<div class="badge ${level}">${escapeHtml(text)}</div>`; }

  function opt(current, value) { return `<option value="${value}" ${current === value ? "selected" : ""}>${value}</option>`; }

  function escapeHtml(s) {
    return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  }
  function escapeAttr(s) { return escapeHtml(s).replaceAll("\n", " "); }

  function statInput(key, val, bindBase, id) {
    return `<div><label class="label">${key}</label><input class="input" type="number" data-bind="${bindBase}.${key}" data-id="${id}" value="${escapeAttr(val ?? 0)}" /></div>`;
  }
  function numInput(label, val, bind, id) {
    return `<div><label class="label">${label}</label><input class="input" type="number" data-bind="${bind}" data-id="${id}" value="${escapeAttr(val ?? 0)}" /></div>`;
  }

  function fmtStats(s) { return `HP ${s.hp} · ATK ${s.atk} · DEF ${s.def} · MATK ${s.matk} · MDEF ${s.mdef} · SPD ${s.spd}`; }

  function renderAsciiGrid(stage) {
    const w = stage.width, h = stage.height;
    const grid = stage.terrainGrid || [];
    const unitIds = stage.units || [];
    const units = unitIds.map(id => getUnit(state.data, id)).filter(Boolean);

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
        if (u) row += u.side === "player" ? "P" : "E";
        else row += terrChar(grid[y * w + x]);
      }
      out += row + "\n";
    }
    out += "\nLegend: . plain · F forest · T fort · P player · E enemy\n";
    return out;
  }

  // ----------------------------
  // 13) Events
  // ----------------------------
  function initTabs() {
    const tabs = $("#tabs");
    tabs.addEventListener("click", (e) => {
      const btn = e.target.closest(".tab");
      if (!btn) return;
      setActiveTab(btn.dataset.tab);
    });
  }

  function setActiveTab(tab) {
    state.ui.tab = tab;
    $$(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
    $$(".tabpane").forEach(p => p.classList.toggle("active", p.id === `tab-${tab}`));
  }

  function initDataEditor() {
    $("#btn-validate").addEventListener("click", () => {
      const raw = $("#json-editor").value;
      try {
        const parsed = JSON.parse(raw);
        const errs = validateDataShape(parsed);
        if (errs.length) {
          state.derived.errors = errs;
          renderJsonAreas();
          return;
        }
        state.data = parsed;
        $("#design-notes").value = state.data.designNotes || "";
        ensureValidSelections();
        recomputeAndRender();
      } catch (err) {
        state.derived.errors = [`JSON invalide: ${err.message}`];
        renderJsonAreas();
      }
    });

    $("#btn-reset").addEventListener("click", () => {
      state.data = deepClone(EXAMPLE_DATA);
      ensureValidSelections();
      recomputeAndRender();
    });

    $("#btn-copy-editor").addEventListener("click", async () => {
      await copyToClipboard(JSON.stringify(state.data, null, 2));
    });
    $("#btn-download-editor").addEventListener("click", () => {
      downloadText("balance_editor.json", JSON.stringify(state.data, null, 2));
    });

    $("#btn-copy-game").addEventListener("click", async () => {
      await copyToClipboard(JSON.stringify(state.derived.gameExport, null, 2));
    });
    $("#btn-download-game").addEventListener("click", () => {
      downloadText("balance_game.json", JSON.stringify(state.derived.gameExport, null, 2));
    });

    $("#design-notes").addEventListener("input", debounce((e) => {
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

    $("#btn-add-class").addEventListener("click", () => {
      state.data.classes.push({ id: uid("class"), name: "Nouvelle classe", role: "custom", baseStats: { hp: 18, atk: 5, def: 3, matk: 1, mdef: 2, spd: 5 } });
      recomputeAndRender();
    });

    $("#btn-add-weapon").addEventListener("click", () => {
      state.data.weapons.push({ id: uid("weapon"), name: "Nouvelle arme", type: "physical", might: 3, hit: 80, crit: 0, rangeMin: 1, rangeMax: 1 });
      recomputeAndRender();
    });

    $("#btn-add-terrain").addEventListener("click", () => {
      state.data.terrain.push({ id: uid("terrain"), name: "Nouveau terrain", moveCost: 1, bonus: { def: 0, mdef: 0, avoid: 0 } });
      recomputeAndRender();
    });
  }

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

  function initDuelEvents() {
    $("#duel-attacker").addEventListener("change", (e) => { state.ui.duelAttackerId = e.target.value; recomputeAndRender(); });
    $("#duel-defender").addEventListener("change", (e) => { state.ui.duelDefenderId = e.target.value; recomputeAndRender(); });
    $("#duel-attacker-terrain").addEventListener("change", (e) => { state.ui.duelAttTerrainId = e.target.value; recomputeAndRender(); });
    $("#duel-defender-terrain").addEventListener("change", (e) => { state.ui.duelDefTerrainId = e.target.value; recomputeAndRender(); });

    $("#toggle-doubling").addEventListener("change", (e) => { state.ui.enableDoubling = e.target.checked; recomputeAndRender(); });
    $("#toggle-crit").addEventListener("change", (e) => { state.ui.enableCrit = e.target.checked; recomputeAndRender(); });
  }

  function initStageEvents() {
    $("#stage-select").addEventListener("change", (e) => { state.ui.stageId = e.target.value; recomputeAndRender(); });
    $("#btn-stage-reload").addEventListener("click", () => recomputeAndRender());

    $("#macro-radius").addEventListener("change", (e) => { state.ui.macroRadius = safeNum(e.target.value, 6); });

    $("#btn-macro-run").addEventListener("click", () => {
      const stage = getStage(state.data, state.ui.stageId);
      if (!stage) return;
      state.derived.macro = computeMacro(state.data, stage, { radius: state.ui.macroRadius });
      renderMacroResults();
    });
  }

  function renderMacroResults() {
    const root = $("#macro-results");
    if (!root) return;
    root.innerHTML = "";
    const macro = state.derived.macro;
    if (!macro) { root.innerHTML = `<div class="badge">Clique <b>Calculer</b> pour produire l’analyse macro.</div>`; return; }

    root.appendChild(kvCard("TTK moyen (joueurs → ennemi le plus proche)", Number.isFinite(macro.avgTtk) ? macro.avgTtk : "∞", macro.avgTtk > 3 ? "warn" : "ok"));

    const table = document.createElement("div");
    table.className = "tablewrap mt8";
    table.innerHTML = `
      <table class="table">
        <thead><tr><th>Joueur</th><th>Menaces</th><th>Expected incoming</th><th>Survie (tours)</th></tr></thead>
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

  function initChecklistEvents() {
    $("#btn-checklist-reset").addEventListener("click", () => { state.data.checklist = deepClone(EXAMPLE_DATA.checklist); recomputeAndRender(); });
    $("#btn-checklist-apply").addEventListener("click", () => {
      const raw = $("#checklist-editor").value;
      const status = $("#checklist-status");
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) throw new Error("Checklist doit être un tableau.");
        state.data.checklist = parsed;
        if (status) { status.textContent = "✅ Checklist appliquée."; status.style.color = "var(--ok)"; }
        recomputeAndRender();
      } catch (err) {
        if (status) { status.textContent = `❌ ${err.message}`; status.style.color = "var(--fail)"; }
      }
    });
    $("#btn-checklist-copy").addEventListener("click", async () => { await copyToClipboard($("#checklist-editor").value); });
  }

  function initTuningEvents() {
    const t = state.ui.tuning;

    $("#tuning-weapon-type").addEventListener("change", (e) => { t.weaponType = e.target.value; });
    $("#tuning-might").addEventListener("input", (e) => { t.mightDelta = safeNum(e.target.value, 0); renderTuning(); });

    $("#tuning-enemy-class").addEventListener("change", (e) => { t.enemyClassId = e.target.value; });
    $("#tuning-def").addEventListener("input", (e) => { t.defDelta = safeNum(e.target.value, 0); renderTuning(); });
    $("#tuning-mdef").addEventListener("input", (e) => { t.mdefDelta = safeNum(e.target.value, 0); renderTuning(); });
    $("#tuning-hp").addEventListener("input", (e) => { t.hpDelta = safeNum(e.target.value, 0); renderTuning(); });

    $("#tuning-toggle-doubling").addEventListener("change", (e) => { t.enableDoubling = e.target.checked; });
    $("#tuning-toggle-crit").addEventListener("change", (e) => { t.enableCrit = e.target.checked; });

    $("#btn-tuning-reset").addEventListener("click", () => {
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

    $("#btn-tuning-apply").addEventListener("click", () => { applyTuning(); recomputeAndRender(); });
  }

  function applyTuning() {
    const t = state.ui.tuning;
    const log = [];

    state.data.config.enableDoubling = !!t.enableDoubling;
    state.data.config.enableCrit = !!t.enableCrit;
    log.push(`CONFIG: enableDoubling=${state.data.config.enableDoubling}, enableCrit=${state.data.config.enableCrit}`);

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
        log.push(`ENEMY ${u.id}: DEF override ${before} -> ${u.statsOverride.def}`);
      }
      if (t.mdefDelta !== 0) {
        const base = computeUnitStats(state.data, u)?.mdef ?? 0;
        const before = safeNum(u.statsOverride.mdef, base);
        u.statsOverride.mdef = before + t.mdefDelta;
        log.push(`ENEMY ${u.id}: MDEF override ${before} -> ${u.statsOverride.mdef}`);
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
        log.push(`STAGE ${stage.id} UNIT ${u.id}: HP override ${before} -> ${u.statsOverride.hp}`);
      }
    }

    state.ui.tuningLog.push(`--- APPLY @ ${new Date().toLocaleString()} ---`);
    state.ui.tuningLog.push(...log);
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
  // 14) Boot
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

    $("#tuning-toggle-doubling").checked = false;
    $("#tuning-toggle-crit").checked = false;

    renderMacroResults();
    recomputeAndRender();
  }

  boot();
})();