// Spiellogik für „Turm der Schatten“: rundenbasierte Kämpfe mit Charakteren aus dem Generator.
// Reine Logik ohne DOM, damit sie sich mit node testen lässt (darkfantasy/test.js).
var DF_GAME = (function () {
  var D = typeof DF_DATA !== 'undefined' ? DF_DATA : require('./data.js');
  var G = typeof DF_GEN !== 'undefined' ? DF_GEN : require('./generator.js');

  var RANK_MULT = { 1: 1.4, 2: 1.8, 3: 2.3 };
  // Gegner wachsen exponentiell, damit auch starke Charaktere irgendwann fallen
  var ENRAGE_TURN = 15;
  var HP_BASE = 70, HP_GROWTH = 1.17, ATK_BASE = 10, ATK_GROWTH = 1.13;
  var RANK_CD = { 1: 2, 2: 3, 3: 4 };

  var ENEMIES = [
    ['Ghul', 'claw'], ['Skelettkrieger', 'sword'], ['Schattenwolf', 'claw'], ['Kultist', 'drop'], ['Sumpfhexe', 'leaf'],
    ['Gargoyle', 'claw'], ['Banshee', 'moon'], ['Blutvampir', 'drop'], ['Dämonenritter', 'sword'], ['Irrlicht', 'star'],
    ['Gefallener Paladin', 'sun'], ['Knochenmagier', 'star']
  ];
  var BOSSES = [
    ['Der Knochenkönig', 'sword'], ['Hexenkönigin Morwen', 'moon'], ['Vyrmathra, die Drachin', 'claw'], ['Der Namenlose Hunger', 'drop'],
    ['Lich-Erzmagier Ozrel', 'star'], ['Der Schwarze Ritter', 'sword'], ['Die Bleiche Inquisitorin', 'sun'], ['Der Weltenfresser', 'claw']
  ];
  var INTENTS = {
    attack: { name: 'Angriff', mult: 1 },
    heavy: { name: 'Schwerer Schlag', mult: 2.2 },
    multi: { name: 'Klauenhagel', mult: 0.55, hits: 3 },
    curse: { name: 'Fluch', mult: 0.5 },
    heal: { name: 'Heilt sich', mult: 0 }
  };
  var BLESSINGS = [
    { id: 'atk', name: 'Blutdurst', desc: '+15 % Angriff' },
    { id: 'def', name: 'Eisenhaut', desc: '+30 % Verteidigung' },
    { id: 'hp', name: 'Vitalität', desc: '+20 % max. Leben' },
    { id: 'heal', name: 'Erholung', desc: 'Leben vollständig heilen' },
    { id: 'crit', name: 'Scharfes Auge', desc: '+8 % kritische Treffer' },
    { id: 'focus', name: 'Fokus', desc: 'Abklingzeiten dauernd −1' },
    { id: 'revive', name: 'Zweite Chance', desc: 'Einmal wiederbeleben mit 50 % Leben' }
  ];

  // Ordnet eine Fähigkeit anhand ihrer Beschreibung einer Kampfwirkung zu
  function classify(a) {
    var t = a.name + ' ' + a.desc;
    if (a.type === 'Passiv') return 'passive';
    if (a.type === 'Mythisch') return 'gift';
    if (a.type === 'Ultimativ') return 'ult';
    if (/Stiehlt|Entzieht|heilt sich/.test(t)) return 'drain';
    if (/Sekunden/.test(t) && /friert|Friert|wirft|Boden|Furcht|fliehen|Stein|erstarrt|schläfert|Kontrolle|fessel|Bindet|Verlangsamt|betäubt|Versiegelt|Zeit/.test(t)) return 'stun';
    if (/[Hh]eilt|wieder|Belebt|Regeneration/.test(t) && !/Schaden/.test(t)) return 'heal';
    if (/unverwundbar|Blockt|weniger Schaden|absorb|Pariert|Ausweichen|körperlos|unsichtbar|weicht|Trugbilder|Manaschild/.test(t)) return 'shield';
    if (/Beschwört|Erhebt|[Gg]ift|Seuche|über \d+ Sekunden/.test(t)) return 'dot';
    if (/Angriffskraft|Tempo und Stärke|doppelte|kritisch|mehr Schaden|stärker|\+\d+ %/.test(t)) return 'buff';
    return 'dmg';
  }

  var KIND_NAMES = { dmg: 'Schaden', stun: 'Betäuben', heal: 'Heilung', shield: 'Schild', dot: 'Schaden über Zeit',
    buff: 'Stärkung', drain: 'Lebensraub', ult: 'Ultimativ' };

  function fighter(c) {
    var primary = D.ARCHETYPES[c.archetype].stats[0];
    var f = {
      name: c.name, char: c,
      maxHp: Math.round(80 + c.stats.con * 8 + c.level * 4),
      atk: 6 + c.stats[primary] * 1.2 + c.level * 0.4,
      def: c.stats.con * 0.4 + c.level * 0.15,
      crit: 0.05 + c.stats.dex * 0.01,
      revive: false, cdBonus: 0, skills: [], passives: []
    };
    c.abilities.forEach(function (a) {
      var kind = classify(a);
      if (kind === 'passive') {
        f.atk *= 1 + 0.06 * a.rank;
        f.def *= 1 + 0.04 * a.rank;
        f.passives.push(a.name);
      } else if (kind === 'gift') {
        f.revive = true;
        f.passives.push(a.name);
      } else {
        var rank = a.rank || 1;
        f.skills.push({
          name: a.name, kind: kind, rank: kind === 'ult' ? 3 : rank,
          mult: kind === 'ult' ? 3.2 : RANK_MULT[rank], maxCd: kind === 'ult' ? 5 : RANK_CD[rank], cd: kind === 'ult' ? 2 : 0,
          heals: kind === 'ult' && /[Hh]eil|unsterblich/.test(a.desc)
        });
      }
    });
    f.hp = f.maxHp;
    f.shield = 0; f.buff = 0; f.curse = 0; f.defending = false;
    return f;
  }

  function enemy(floor, r) {
    var boss = floor % 5 === 0;
    var e = boss ? BOSSES[(floor / 5 - 1) % BOSSES.length] : r.pick(ENEMIES);
    var x = {
      name: e[0], icon: e[1], boss: boss, floor: floor,
      maxHp: Math.round(HP_BASE * Math.pow(HP_GROWTH, floor - 1) * (boss ? 2.1 : 1)),
      atk: ATK_BASE * Math.pow(ATK_GROWTH, floor - 1) * (boss ? 1.25 : 1),
      def: floor * 1.5,
      stun: 0, stunImmune: 0, dot: 0, dotTurns: 0, vuln: 0, turns: 0
    };
    x.hp = x.maxHp;
    return x;
  }

  function pickIntent(s) {
    var e = s.enemy, r = s.rng, roll = r();
    if (e.hp < e.maxHp * 0.4 && !e.healed && roll < 0.45) { e.healed = true; return 'heal'; }
    if (roll < 0.22) return 'heavy';
    if (roll < 0.36) return 'multi';
    if (roll < 0.48 && !s.player.curse) return 'curse';
    return 'attack';
  }

  function intentInfo(s) {
    var i = INTENTS[s.intent], e = s.enemy;
    // erwarteter Schaden nach Verteidigung, wie in hit()
    var dmg = Math.max(1, Math.round(e.atk * i.mult - s.player.def * 0.5));
    var text = s.intent === 'heal' ? 'Heilt sich' : s.intent === 'curse' ? 'Fluch (−25 % Angriff) · ' + dmg
      : i.hits ? i.name + ' ' + i.hits + '× ' + dmg : i.name + ' ' + dmg;
    return { id: s.intent, text: e.stun ? 'Betäubt' : text };
  }

  function newRun(c, seed) {
    var s = { rng: G.rng(seed || G.newSeed()), floor: 1, player: fighter(c), log: [], over: false, phase: 'battle', turn: 0 };
    s.enemy = enemy(1, s.rng);
    s.intent = pickIntent(s);
    return s;
  }

  function hit(s, from, to, mult, isPlayer) {
    var r = s.rng;
    var atk = from.atk * mult;
    if (isPlayer) {
      if (from.buff) atk *= 1.4;
      if (from.curse) atk *= 0.75;
      if (to.vuln) atk *= 1.25;
    }
    var dmg = Math.max(1, Math.round(atk * (0.9 + r() * 0.2) - to.def * 0.5));
    var crit = isPlayer && r() < from.crit;
    if (crit) dmg = Math.round(dmg * 1.6);
    if (!isPlayer) {
      if (to.defending) dmg = Math.round(dmg * 0.4);
      if (to.shield) { var absorbed = Math.min(to.shield, dmg); to.shield -= absorbed; dmg -= absorbed; }
    }
    to.hp = Math.max(0, to.hp - dmg);
    return { dmg: dmg, crit: crit };
  }

  function heal(f, amount) {
    var before = f.hp;
    f.hp = Math.min(f.maxHp, f.hp + Math.round(amount));
    return f.hp - before;
  }

  // Aktionen: 'attack', 'defend' oder Index einer Fähigkeit. Gibt Ereignisse für die Animation zurück.
  function act(s, action) {
    if (s.over || s.phase !== 'battle') return [];
    var p = s.player, e = s.enemy, ev = [];
    var log = function (t) { s.log.push(t); ev.push({ type: 'log', text: t }); };
    p.defending = false;
    s.turn++;

    if (action === 'attack') {
      var h = hit(s, p, e, 1, true);
      ev.push({ type: 'dmg', target: 'enemy', value: h.dmg, crit: h.crit });
      log(p.name.split(' ')[0] + ' greift an: ' + h.dmg + (h.crit ? ' (Kritisch!)' : ''));
    } else if (action === 'defend') {
      p.defending = true;
      p.skills.forEach(function (k) { if (k.cd > 0) k.cd--; });
      var hd = heal(p, p.maxHp * 0.05);
      ev.push({ type: 'heal', target: 'player', value: hd });
      log('Verteidigung: −60 % Schaden in dieser Runde' + (hd ? ', +' + hd + ' Leben' : ''));
    } else {
      var k = p.skills[action];
      if (!k || k.cd > 0) return [];
      k.cd = Math.max(1, k.maxCd - p.cdBonus);
      var name = k.name;
      if (k.kind === 'dmg' || k.kind === 'ult' || k.kind === 'stun' || k.kind === 'drain' || k.kind === 'buff') {
        var mult = k.kind === 'stun' ? k.mult * 0.6 : k.kind === 'buff' ? k.mult * 0.5 : k.kind === 'drain' ? k.mult * 0.8 : k.mult;
        var h2 = hit(s, p, e, mult, true);
        ev.push({ type: 'dmg', target: 'enemy', value: h2.dmg, crit: h2.crit, big: k.kind === 'ult' });
        var msg = name + ': ' + h2.dmg + ' Schaden' + (h2.crit ? ' (Kritisch!)' : '');
        if (k.kind === 'stun') {
          if (e.stunImmune) msg += ', Gegner widersteht der Betäubung';
          else { e.stun = 1; e.stunImmune = 2; msg += ', Gegner betäubt'; }
        }
        if (k.kind === 'buff') { p.buff = 3; msg += ', +40 % Angriff für 3 Runden'; }
        if (k.kind === 'drain' || k.heals) {
          var hv = heal(p, h2.dmg * (k.heals ? 0.5 : 0.6));
          ev.push({ type: 'heal', target: 'player', value: hv });
          msg += ', +' + hv + ' Leben';
        }
        log(msg);
      } else if (k.kind === 'heal') {
        var hh = heal(p, p.maxHp * (0.18 + 0.08 * k.rank));
        if (p.curse) { p.curse = 0; }
        ev.push({ type: 'heal', target: 'player', value: hh });
        log(name + ': +' + hh + ' Leben, Flüche gebannt');
      } else if (k.kind === 'shield') {
        // Schilde stapeln nicht: der stärkere zählt
        p.shield = Math.max(p.shield, Math.round(p.maxHp * (0.15 + 0.08 * k.rank)));
        ev.push({ type: 'shield', target: 'player', value: p.shield });
        log(name + ': Schild ' + p.shield);
      } else if (k.kind === 'dot') {
        e.dot = Math.round(p.atk * k.mult * 0.55);
        e.dotTurns = 3;
        e.vuln = 2;
        ev.push({ type: 'dot', target: 'enemy' });
        log(name + ': ' + e.dot + ' Schaden pro Runde für 3 Runden');
      }
    }
    if (checkWin(s, ev)) return ev;

    // Zug des Gegners
    if (e.dotTurns) {
      e.hp = Math.max(0, e.hp - e.dot);
      e.dotTurns--;
      ev.push({ type: 'dmg', target: 'enemy', value: e.dot });
      log('Anhaltender Schaden: ' + e.dot);
      if (checkWin(s, ev)) return ev;
    }
    if (e.stun) {
      e.stun = 0;
      log(e.name + ' ist betäubt und setzt aus');
    } else {
      var it = INTENTS[s.intent];
      // Zu lange Kämpfe: der Gegner wird wütend und stärker
      if (++e.turns > ENRAGE_TURN) {
        e.atk *= 1.15;
        if (e.turns === ENRAGE_TURN + 1) log(e.name + ' wird rasend!');
      }
      if (s.intent === 'heal') {
        var eh = heal(e, e.maxHp * 0.25);
        ev.push({ type: 'heal', target: 'enemy', value: eh });
        log(e.name + ' heilt sich um ' + eh);
      } else {
        var total = 0;
        for (var i = 0; i < (it.hits || 1); i++) total += hit(s, e, p, it.mult, false).dmg;
        if (s.intent === 'curse') p.curse = 2;
        ev.push({ type: 'dmg', target: 'player', value: total, big: s.intent === 'heavy' });
        log(e.name + ': ' + it.name + ' – ' + total + ' Schaden' + (s.intent === 'curse' ? ', verflucht' : '') +
          (p.defending ? ' (abgewehrt)' : ''));
      }
    }
    if (p.hp <= 0) {
      if (p.revive) {
        p.revive = false;
        p.hp = Math.round(p.maxHp * 0.5);
        ev.push({ type: 'revive' });
        log(p.name.split(' ')[0] + ' erhebt sich erneut!');
      } else {
        s.over = true;
        s.phase = 'over';
        ev.push({ type: 'lose' });
        log(p.name.split(' ')[0] + ' ist auf Ebene ' + s.floor + ' gefallen.');
        return ev;
      }
    }
    // Rundenende
    p.skills.forEach(function (k) { if (k.cd > 0) k.cd--; });
    if (p.buff) p.buff--;
    if (p.curse) p.curse--;
    if (e.vuln) e.vuln--;
    if (e.stunImmune) e.stunImmune--;
    s.intent = pickIntent(s);
    return ev;
  }

  function checkWin(s, ev) {
    if (s.enemy.hp > 0) return false;
    s.phase = 'reward';
    ev.push({ type: 'win' });
    s.log.push(s.enemy.name + ' besiegt!');
    s.player.hp = Math.min(s.player.maxHp, s.player.hp + Math.round(s.player.maxHp * 0.3));
    var pool = BLESSINGS.filter(function (b) {
      return !(b.id === 'revive' && s.player.revive) && !(b.id === 'heal' && s.player.hp === s.player.maxHp);
    });
    s.choices = s.rng.shuffle(pool).slice(0, 3);
    return true;
  }

  function bless(s, id) {
    if (s.phase !== 'reward') return;
    var p = s.player;
    if (id === 'atk') p.atk *= 1.15;
    if (id === 'def') p.def = p.def * 1.3 + 1;
    if (id === 'hp') { var add = Math.round(p.maxHp * 0.2); p.maxHp += add; p.hp += add; }
    if (id === 'heal') p.hp = p.maxHp;
    if (id === 'crit') p.crit += 0.08;
    if (id === 'focus') p.cdBonus++;
    if (id === 'revive') p.revive = true;
    s.floor++;
    s.enemy = enemy(s.floor, s.rng);
    p.shield = 0; p.buff = 0; p.curse = 0;
    p.skills.forEach(function (k) { k.cd = k.kind === 'ult' ? Math.max(0, k.cd - 2) : 0; });
    s.choices = null;
    s.phase = 'battle';
    s.log.push('— Ebene ' + s.floor + (s.enemy.boss ? ' · BOSS' : '') + ' —');
    s.intent = pickIntent(s);
  }

  // Einfache KI für Tests und Balancing
  function autoAction(s) {
    var p = s.player;
    if (s.intent === 'heavy' && !s.enemy.stun) {
      var st = p.skills.findIndex(function (k) { return k.cd === 0 && (k.kind === 'stun' || k.kind === 'shield'); });
      return st >= 0 ? st : 'defend';
    }
    if (p.hp < p.maxHp * 0.35) {
      var hl = p.skills.findIndex(function (k) { return k.cd === 0 && (k.kind === 'heal' || k.kind === 'drain'); });
      if (hl >= 0) return hl;
    }
    var best = -1;
    p.skills.forEach(function (k, i) { if (k.cd === 0 && k.kind !== 'heal' && (best < 0 || k.mult > p.skills[best].mult)) best = i; });
    return best >= 0 ? best : 'attack';
  }

  return {
    newRun: newRun, act: act, bless: bless, intentInfo: intentInfo, fighter: fighter, classify: classify, autoAction: autoAction,
    KIND_NAMES: KIND_NAMES, BLESSINGS: BLESSINGS
  };
})();

if (typeof module !== 'undefined') module.exports = DF_GAME;
