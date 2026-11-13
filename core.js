/* Fairway — moteur de calcul golf (index FFG / WHS, net, Stableford, match play)
   Utilisable dans le navigateur (window.GolfCore) et sous Node (module.exports). */
(function (root) {
  'use strict';

  // Trous joués selon le mode
  function holesFor(mode, n) {
    n = n || 18;
    if (mode === 'front') return range(1, Math.min(9, n));
    if (mode === 'back') return n >= 18 ? range(10, 18) : range(1, n);
    return range(1, n);
  }
  function range(a, b) { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; }

  // Partie sans handicap (option décochée à la création) : tout le monde à 0
  const noHcp = game => !!(game && (game.noHcp || (game.course && game.course._hcp === false)));

  // Valeur d'une croix (balle ramassée) en stroke play : par + N (+ coups reçus). Anciennes parties : +2
  const xcapOf = game => game && game.course && game.course._xcap != null ? Number(game.course._xcap) : 2;

  // Index d'un joueur (champ idx en base, index dans le profil)
  function idxOf(p) { const v = p.idx != null && p.idx !== '' ? p.idx : p.index; return v == null || v === '' ? null : Number(v); }

  // Handicap de jeu WHS / FFG : index × slope/113 + (SSS − par), arrondi.
  // Sur 9 trous : demi-index, SSS et par des 9 trous (SSS 9 trous ≈ SSS/2 si non connu).
  function playingHandicap(index, tee, course, mode) {
    if (index == null || isNaN(index)) return 0;
    const holes = holesFor(mode, course.holes.length);
    const par = holes.reduce((s, h) => s + course.holes[h - 1].par, 0);
    const parFull = course.holes.reduce((s, h) => s + h.par, 0);
    const slope = tee && tee.slope ? tee.slope : 113;
    let sss = tee && tee.sss ? tee.sss : parFull; // à défaut, SSS = par
    const nine = holes.length <= 9;
    const idx = nine ? index / 2 : index;
    if (nine) sss = sss / 2;
    return Math.round(idx * slope / 113 + (sss - (nine ? par : parFull)));
  }

  // Répartition des coups reçus par trou selon le handicap (SI). Gère + handicaps et > 18 coups.
  function strokesPerHole(ph, course, mode) {
    const holes = holesFor(mode, course.holes.length);
    // classement des trous joués par SI croissant
    const order = holes.slice().sort((a, b) => course.holes[a - 1].si - course.holes[b - 1].si);
    const res = {}; holes.forEach(h => (res[h] = 0));
    const n = holes.length;
    if (ph >= 0) {
      for (let k = 0; k < ph; k++) res[order[k % n]] += 1;
    } else {
      // handicap "plus" : on rend des coups sur les trous les plus faciles
      for (let k = 0; k < -ph; k++) res[order[n - 1 - (k % n)]] -= 1;
    }
    return res;
  }

  // Score retenu pour un trou : null si non joué, sinon {gross, pickup}
  // Balle ramassée (croix) => brut ajusté = par + 2 + coups reçus (double bogey net)
  function adjustedGross(score, par, recv, xcap) {
    if (!score) return null;
    if (score.pickup) return par + (xcap != null ? xcap : 2) + recv;
    if (score.strokes == null) return null;
    return score.strokes;
  }

  function stablefordPoints(gross, par, recv, pickup) {
    if (pickup) return 0;
    if (gross == null) return null;
    const net = gross - recv;
    return Math.max(0, 2 + par - net);
  }

  // Résumé complet d'un joueur sur la partie
  // scores: { [hole]: {strokes, putts, pickup} }
  function playerSummary(player, game, course, scores) {
    const tee = (course.tees || []).find(t => t.id === (player.tee || game.tee)) || (course.tees || [])[0];
    const ph = noHcp(game) ? 0 : player.fixedPh != null ? player.fixedPh : playingHandicap(idxOf(player), tee, course, game.mode);
    const recv = strokesPerHole(ph, course, game.mode);
    const holes = holesFor(game.mode, course.holes.length);
    let gross = 0, net = 0, pts = 0, parPlayed = 0, played = 0, putts = 0, puttsN = 0;
    const perHole = {};
    holes.forEach(h => {
      const ch = course.holes[h - 1];
      const s = scores && scores[h];
      const g = adjustedGross(s, ch.par, recv[h], xcapOf(game));
      const p = s ? stablefordPoints(g, ch.par, recv[h], s.pickup) : null;
      perHole[h] = { gross: g, raw: s ? s.strokes : null, pickup: !!(s && s.pickup), recv: recv[h], points: p, par: ch.par, putts: s ? s.putts : null };
      if (g != null) {
        gross += g; net += g - recv[h]; pts += p || 0; parPlayed += ch.par; played++;
        if (s.putts != null) { putts += s.putts; puttsN++; }
      }
    });
    return {
      playerId: player.id, name: player.name, ph, recv, perHole,
      gross, net, points: pts, played, holes: holes.length,
      toPar: gross - parPlayed, netToPar: net - parPlayed,
      putts: puttsN ? putts : null, finished: played === holes.length
    };
  }

  // Match play net entre 2 joueurs : différence de handicaps de jeu, coups rendus selon SI.
  function matchPlay(pA, pB, game, course, scoresA, scoresB) {
    const tee = id => (course.tees || []).find(t => t.id === id) || (course.tees || [])[0];
    const phA = noHcp(game) ? 0 : playingHandicap(idxOf(pA), tee(pA.tee || game.tee), course, game.mode);
    const phB = noHcp(game) ? 0 : playingHandicap(idxOf(pB), tee(pB.tee || game.tee), course, game.mode);
    const diff = Math.abs(phA - phB);
    const getter = phA > phB ? 'A' : 'B';
    const recv = strokesPerHole(diff, course, game.mode);
    const holes = holesFor(game.mode, course.holes.length);
    let up = 0, played = 0; const results = {};
    let decided = null;
    for (let i = 0; i < holes.length; i++) {
      const h = holes[i];
      const sa = scoresA && scoresA[h], sb = scoresB && scoresB[h];
      const ga = sa ? (sa.pickup ? Infinity : sa.strokes) : null;
      const gb = sb ? (sb.pickup ? Infinity : sb.strokes) : null;
      if (ga == null || gb == null) break; // match joué dans l'ordre
      const na = ga - (getter === 'A' ? recv[h] : 0);
      const nb = gb - (getter === 'B' ? recv[h] : 0);
      let r = 0;
      if (na < nb) r = 1; else if (nb < na) r = -1;
      if (ga === Infinity && gb === Infinity) r = 0;
      up += r; played++; results[h] = r;
      const left = holes.length - played;
      if (Math.abs(up) > left) { decided = { up: Math.abs(up), left }; break; }
    }
    const left = holes.length - played;
    let label;
    if (played === 0) label = 'Pas commencé';
    else if (decided) label = (up > 0 ? pA.name : pB.name) + ' gagne ' + decided.up + (decided.left ? '&' + decided.left : ' UP');
    else if (left === 0) label = up === 0 ? 'Match nul (AS)' : (up > 0 ? pA.name : pB.name) + ' gagne ' + Math.abs(up) + ' UP';
    else if (up === 0) label = 'All Square après ' + played;
    else label = (up > 0 ? pA.name : pB.name) + ' ' + Math.abs(up) + ' UP' + (Math.abs(up) === left ? ' (dormie)' : '') + ' — ' + left + ' à jouer';
    return { up, played, left, results, label, strokes: diff, receiver: diff ? (getter === 'A' ? pA.name : pB.name) : null, recv, getter };
  }

  // Classement selon le format
  function leaderboard(players, game, course, scoresByPlayer) {
    const rows = players.map(p => playerSummary(p, game, course, scoresByPlayer[p.id] || {}));
    const f = game.format;
    rows.sort((a, b) => {
      if (f === 'stableford') return b.points - a.points || a.gross - b.gross;
      if (f === 'brut') return a.toPar - b.toPar || b.played - a.played;
      return a.netToPar - b.netToPar || b.played - a.played; // net
    });
    return rows;
  }

  // Distance en mètres entre deux points GPS (haversine)
  function distance(a, b) {
    if (!a || !b) return null;
    const R = 6371000, toR = x => x * Math.PI / 180;
    const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(s)));
  }

  // Suggestion de club selon la distance et les distances perso
  function suggestClub(dist, bag) {
    if (dist == null || !bag || !bag.length) return null;
    const sorted = bag.filter(c => c.dist > 0).sort((a, b) => a.dist - b.dist);
    if (!sorted.length) return null;
    for (const c of sorted) if (c.dist >= dist - 5) return c;
    return sorted[sorted.length - 1];
  }

  // Libellé du score sur un trou par rapport au par
  function scoreName(gross, par, pickup) {
    if (pickup) return 'X';
    if (gross == null) return '';
    const d = gross - par;
    if (gross === 1) return 'Trou en 1';
    return ({ '-3': 'Albatros', '-2': 'Eagle', '-1': 'Birdie', '0': 'Par', '1': 'Bogey', '2': 'Double', '3': 'Triple' })[d] || (d > 0 ? '+' + d : String(d));
  }

  // Qui paie sa tournée : le(s) dernier(s) du classement + chaque « pas passé les rouges »
  function payers(players, game, course, scoresByPlayer, events) {
    const g = game.format === 'match' ? { ...game, format: 'net' } : game;
    const rows = leaderboard(players, g, course, scoresByPlayer).filter(r => r.played > 0);
    let last = [];
    if (rows.length >= 2) {
      const key = r => g.format === 'stableford' ? -r.points : (g.format === 'brut' ? r.toPar : r.netToPar);
      const worst = Math.max(...rows.map(key));
      last = rows.filter(r => key(r) === worst).map(r => ({ playerId: r.playerId, name: r.name }));
      if (last.length === rows.length) last = []; // tous à égalité : personne ne paie
    }
    const rouges = {};
    (events || []).filter(e => e.type === 'rouge').forEach(e => {
      const p = players.find(x => x.id === e.player_id); if (!p) return;
      (rouges[p.id] = rouges[p.id] || { playerId: p.id, name: p.name, holes: [] }).holes.push(e.hole);
    });
    Object.values(rouges).forEach(r => r.holes.sort((a, b) => a - b));
    return { last, rouges: Object.values(rouges) };
  }

  // ---- Drapeaux automatiques depuis OpenStreetMap (réponse Overpass « out geom ») ----
  function toXY(p, o) { const k = 111320; return { x: (p.lng - o.lng) * k * Math.cos(o.lat * Math.PI / 180), y: (p.lat - o.lat) * k }; }
  function fromXY(v, o) { const k = 111320; return { lat: +(o.lat + v.y / k).toFixed(7), lng: +(o.lng + v.x / (k * Math.cos(o.lat * Math.PI / 180))).toFixed(7) }; }
  function centroid(pts) { const n = pts.length; return { lat: pts.reduce((s, p) => s + p.lat, 0) / n, lng: pts.reduce((s, p) => s + p.lng, 0) / n }; }
  function inPoly(p, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.lat > p.lat) !== (b.lat > p.lat) && p.lng < (b.lng - a.lng) * (p.lat - a.lat) / (b.lat - a.lat) + a.lng) c = !c;
    }
    return c;
  }
  function lineLength(pts) { let d = 0; for (let i = 1; i < pts.length; i++) d += distance(pts[i - 1], pts[i]); return d; }

  function flagsFromOSM(osm, course) {
    const els = (osm && osm.elements) || [];
    const geo = e => (e.geometry || []).map(g => ({ lat: g.lat, lng: g.lon }));
    const holes = els.filter(e => e.type === 'way' && e.tags && e.tags.golf === 'hole' && e.geometry && e.geometry.length >= 2);
    const greens = els.filter(e => e.type === 'way' && e.tags && e.tags.golf === 'green' && e.geometry).map(e => { const g = geo(e); return { poly: g, c: centroid(g) }; });
    const pins = els.filter(e => e.type === 'node' && e.tags && e.tags.golf === 'pin').map(e => ({ lat: e.lat, lng: e.lon }));
    const result = {};
    course.holes.forEach((h, i) => {
      const n = h.n || i + 1;
      const target = Object.values(h.dist || {}).filter(Boolean);
      const ref = target.length ? target.reduce((a, b) => a + b, 0) / target.length : null;
      const cands = holes.filter(w => parseInt(w.tags.ref, 10) === n).map(w => {
        const line = geo(w); const len = lineLength(line);
        let score = ref ? Math.abs(len - ref) : 0;
        if (w.tags.par && parseInt(w.tags.par, 10) !== h.par) score += 500;
        return { line, score };
      }).sort((a, b) => a.score - b.score);
      if (!cands.length || (ref && cands[0].score > 250)) return;
      const line = cands[0].line, end = line[line.length - 1], tee = line[0];
      let green = greens.find(g => inPoly(end, g.poly));
      if (!green) { const near = greens.map(g => ({ g, d: distance(end, g.c) })).sort((a, b) => a.d - b.d)[0]; if (near && near.d < 45) green = near.g; }
      let center = green ? green.c : end;
      const pin = pins.find(p => (green ? inPoly(p, green.poly) : distance(p, end) < 25));
      if (pin) center = pin;
      const out = { tee: { lat: +tee.lat.toFixed(7), lng: +tee.lng.toFixed(7) }, center: { lat: +center.lat.toFixed(7), lng: +center.lng.toFixed(7) } };
      if (green) {
        // avant / arrière : extrémités du green dans l'axe d'arrivée
        const from = line.length > 2 ? line[line.length - 2] : tee;
        const o = center, a = toXY(from, o), dl = Math.hypot(a.x, a.y) || 1;
        const dir = { x: -a.x / dl, y: -a.y / dl };
        const proj = green.poly.map(p => { const v = toXY(p, o); return v.x * dir.x + v.y * dir.y; });
        const mn = Math.min(...proj), mx = Math.max(...proj);
        out.front = fromXY({ x: dir.x * mn, y: dir.y * mn }, o);
        out.back = fromXY({ x: dir.x * mx, y: dir.y * mx }, o);
      }
      result[n] = out;
    });
    return result;
  }
  function overpassQuery(center, radius) {
    const a = '(around:' + (radius || 2500) + ',' + center.lat + ',' + center.lng + ')';
    return '[out:json][timeout:25];(way["golf"="hole"]' + a + ';way["golf"="green"]' + a + ';node["golf"="pin"]' + a + ';);out geom;';
  }

  // Handicap d'équipe scramble (recommandations WHS) : à 2 → 35 % / 15 %, à 4 → 25/20/15/10 %
  function teamHandicap(members, game, course) {
    if (noHcp(game)) return 0;
    const tee = id => (course.tees || []).find(t => t.id === id) || (course.tees || [])[0];
    const phs = members.map(p => playingHandicap(idxOf(p), tee(p.tee || game.tee), course, game.mode)).sort((a, b) => a - b);
    const w = phs.length >= 4 ? [0.25, 0.20, 0.15, 0.10] : phs.length === 3 ? [0.30, 0.20, 0.10] : phs.length === 2 ? [0.35, 0.15] : [1];
    return Math.round(phs.reduce((s, ph, i) => s + ph * (w[i] || 0), 0));
  }

  const api = { xcapOf, noHcp, teamHandicap, payers, flagsFromOSM, overpassQuery, holesFor, playingHandicap, strokesPerHole, stablefordPoints, adjustedGross, playerSummary, matchPlay, leaderboard, distance, suggestClub, scoreName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GolfCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
