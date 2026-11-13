/* Fairway — golf entre potes : scores, calculs, GPS, parcours, parties partagées */
(function () {
  'use strict';
  const C = window.GolfCore;
  const $app = document.getElementById('app');
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  };
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
  const code6 = () => { const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)]; return s; };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtPar = n => n === 0 ? 'E' : (n > 0 ? '+' + n : String(n));
  const today = () => new Date().toISOString().slice(0, 10);
  const frDate = d => { if (!d) return ''; const [y, m, j] = d.split('-'); return j + '/' + m + '/' + y; };
  const FORMATS = { stableford: 'Stableford', net: 'Stroke play net', brut: 'Stroke play brut', match: 'Match play' };
  const MODES = { '18': '18 trous', front: 'Aller (1-9)', back: 'Retour (10-18)' };
  const SHOTS = [['birdie', '🐦', 'Birdie'], ['eagle', '🦅', 'Eagle'], ['hio', '💥', 'Trou en 1'], ['drive', '🚀', 'Gros drive'], ['approche', '🎯', 'Belle approche'], ['putt', '⛳', 'Putt de fou'], ['chip', '🪄', 'Chip-in'], ['bunker', '🏖️', 'Sortie de bunker'], ['sauvetage', '🦸', 'Sauvetage'], ['par', '💪', 'Par arraché'], ['autre', '👏', 'Autre…']];
  const shotOf = t => SHOTS.find(s => s[0] === t) || ['autre', '👏', 'Beau coup'];

  /* ---------- État ---------- */
  const S = {
    me: LS.get('fw_me', null),
    customCourses: LS.get('fw_courses', {}),
    games: LS.get('fw_games', {}),      // id -> {game, players, scores:{pid:{hole:{...}}}}
    queue: LS.get('fw_queue', []),
    cfg: LS.get('fw_cfg', null) || window.FAIRWAY_CONFIG || {},
    pos: null, watchId: null,
    hole: {}, tab: 'trou', mapEdit: null, measure: null,
    online: navigator.onLine
  };
  if (!S.me) {
    S.me = { deviceId: uid(), name: '', index: '', tee: 'jaune', bag: (window.DEFAULT_BAG || []).map(x => ({ ...x })) };
  }
  if (!S.me.code) S.me.code = code6();
  if (!S.me.partners) S.me.partners = [];
  if (S.me.follow == null) S.me.follow = true;
  S.hidden = new Set(LS.get('fw_hidden', []));
  LS.set('fw_me', S.me);
  S.seen = new Set();
  const saveGames = () => { LS.set('fw_games', S.games); scheduleBackup(); };
  const saveMe = () => { LS.set('fw_me', S.me); scheduleBackup(); };
  const saveCourses = () => { LS.set('fw_courses', S.customCourses); scheduleBackup(); };
  const saveQueue = () => LS.set('fw_queue', S.queue);

  function allCourses() {
    const m = {};
    (window.BUILTIN_COURSES || []).forEach(c => (m[c.id] = c));
    Object.values(S.customCourses).forEach(c => (m[c.id] = c));
    return m;
  }
  const getCourse = id => allCourses()[id];

  // Parcours d'une partie : par/SI/repères figés à la création, GPS et notes à jour
  function gameCourse(g) {
    const snap = g.game.course;
    const live = getCourse(g.game.course_id);
    if (!live) return snap;
    return { ...snap, center: live.center || snap.center, holes: snap.holes.map((h, i) => { const l = live.holes[i] || {}; return { ...h, gps: l.gps || h.gps, note: l.note != null ? l.note : h.note, difficulty: l.difficulty || h.difficulty }; }) };
  }

  /* ---------- Serveur (Supabase) ---------- */
  let sb = null, channel = null;
  function initRemote() {
    sb = null;
    if (!S.cfg.supabaseUrl || !S.cfg.supabaseAnonKey || !window.supabase) return;
    try { sb = window.supabase.createClient(S.cfg.supabaseUrl, S.cfg.supabaseAnonKey, { auth: { persistSession: false } }); } catch (e) { sb = null; }
  }
  const remoteOn = () => !!sb;

  async function push(op) {
    if (!remoteOn()) return;
    S.queue.push(op); saveQueue(); await flush();
  }
  let flushing = false;
  async function flush() {
    if (!remoteOn() || flushing || !S.queue.length) return;
    flushing = true;
    try {
      while (S.queue.length) {
        const op = S.queue[0];
        let res;
        if (op.t === 'upsert') res = await sb.from(op.table).upsert(op.row, op.onConflict ? { onConflict: op.onConflict } : undefined);
        else if (op.t === 'delete') res = await sb.from(op.table).delete().match(op.match);
        if (res && res.error) {
          // erreur réseau : on garde ; erreur de données : on jette
          if (/fetch|network|Failed/i.test(res.error.message || '')) break;
          console.warn('Sync refusée', res.error); S.queue.shift();
        } else S.queue.shift();
        saveQueue();
      }
    } catch (e) { /* hors ligne */ }
    flushing = false; updateSyncBadge();
  }
  setInterval(flush, 15000);
  window.addEventListener('online', () => { S.online = true; flush(); updateSyncBadge(); });
  window.addEventListener('offline', () => { S.online = false; updateSyncBadge(); });

  async function fetchGameRemote(where) {
    if (!remoteOn()) throw new Error('Serveur non configuré (Profil > Serveur).');
    let q = sb.from('games').select('*');
    q = where.code ? q.eq('code', where.code.toUpperCase()) : q.eq('id', where.id);
    const { data: gs, error } = await q.limit(1);
    if (error) throw error;
    if (!gs || !gs.length) throw new Error('Partie introuvable.');
    const game = gs[0];
    const [{ data: players }, { data: scores }, { data: events }] = await Promise.all([
      sb.from('players').select('*').eq('game_id', game.id).order('created_at'),
      sb.from('scores').select('*').eq('game_id', game.id),
      sb.from('events').select('*').eq('game_id', game.id).order('created_at')
    ]);
    const g = { game, players: players || [], scores: {}, events: events || [] };
    (events || []).forEach(e => S.seen.add(e.id));
    (scores || []).forEach(r => { (g.scores[r.player_id] = g.scores[r.player_id] || {})[r.hole] = { strokes: r.strokes, putts: r.putts, pickup: r.pickup }; });
    return g;
  }
  async function refreshGame(id) {
    try {
      const g = await fetchGameRemote({ id });
      const local = S.games[id];
      // on garde les scores locaux encore en file d'attente
      if (local) S.queue.filter(o => o.table === 'scores' && o.row.game_id === id).forEach(o => { (g.scores[o.row.player_id] = g.scores[o.row.player_id] || {})[o.row.hole] = { strokes: o.row.strokes, putts: o.row.putts, pickup: o.row.pickup }; });
      const wasDone = local && local.game.status === 'done';
      S.games[id] = { ...g, mine: local ? local.mine : true, follow: local ? !!local.follow : false }; saveGames();
      rememberPartners(S.games[id]);
      if (local && !wasDone && g.game.status === 'done') celebrate(id);
      return true;
    } catch (e) { return false; }
  }
  function subscribe(gameId) {
    unsubscribe();
    if (!remoteOn()) return;
    channel = sb.channel('game-' + gameId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores', filter: 'game_id=eq.' + gameId }, p => {
        const g = S.games[gameId]; if (!g) return;
        const r = p.new && p.new.player_id ? p.new : p.old;
        if (p.eventType === 'DELETE') { if (g.scores[r.player_id]) delete g.scores[r.player_id][r.hole]; }
        else (g.scores[r.player_id] = g.scores[r.player_id] || {})[r.hole] = { strokes: r.strokes, putts: r.putts, pickup: r.pickup };
        saveGames(); liveRender();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: 'game_id=eq.' + gameId }, p => {
        const g = S.games[gameId]; if (!g) return;
        if (p.eventType === 'DELETE') g.players = g.players.filter(x => x.id !== p.old.id);
        else { const i = g.players.findIndex(x => x.id === p.new.id); if (i >= 0) g.players[i] = p.new; else g.players.push(p.new); }
        saveGames(); liveRender();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: 'id=eq.' + gameId }, p => onGameUpdate(p.new))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: 'game_id=eq.' + gameId }, p => onEvent(p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'courses' }, p => {
        if (p.new && p.new.data) { S.customCourses[p.new.id] = p.new.data; saveCourses(); liveRender(); }
      })
      .subscribe(st => { S.live = st === 'SUBSCRIBED'; updateSyncBadge(); });
  }
  function unsubscribe() { if (channel && sb) { sb.removeChannel(channel); channel = null; S.live = false; } }

  /* ---------- Canal perso : invitations reçues, moments forts, fins de partie ---------- */
  let meChannel = null, meKey = '';
  function subscribeMe() {
    if (!remoteOn()) return;
    const open = Object.values(S.games).filter(g => g.game.status !== 'done' || Date.now() - new Date(g.game.created_at).getTime() < 864e5).map(g => g.game.id).sort();
    const key = open.join(',');
    const fk = key + '|' + followIds().join(',');
    if (meChannel && fk === meKey) return;
    if (meChannel) sb.removeChannel(meChannel);
    meKey = fk;
    let ch = sb.channel('me-' + S.me.deviceId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: 'device_id=eq.' + S.me.deviceId }, async p => {
        const gid = p.new && p.new.game_id; if (!gid) return;
        if (S.games[gid] && S.games[gid].players.some(x => x.id === p.new.id && x.device_id === S.me.deviceId)) return;
        if (S.hidden.has(gid)) return;
        const fresh = !S.games[gid];
        if (await refreshGame(gid)) {
          S.games[gid].mine = true; S.games[gid].follow = false; saveGames(); subscribeMe();
          if (fresh) invitePopup(S.games[gid]);
          if (location.hash === '' || location.hash === '#/') viewHome();
        }
      });
    if (open.length) {
      const f = 'in.(' + open.join(',') + ')';
      ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: 'game_id=' + f }, p => onEvent(p))
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: 'id=' + f }, p => onGameUpdate(p.new));
    }
    const pids = followIds();
    if (pids.length) ch = ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'players', filter: 'device_id=in.(' + pids.join(',') + ')' }, p => { if (p.new && !S.games[p.new.game_id]) followGame(p.new.game_id); });
    meChannel = ch.subscribe();
  }
  async function pullMyGames() {
    if (!remoteOn()) return;
    try {
      const { data } = await sb.from('players').select('game_id').eq('device_id', S.me.deviceId);
      const ids = [...new Set((data || []).map(r => r.game_id))].filter(id => !S.hidden.has(id) && (!S.games[id] || S.games[id].game.status !== 'done'));
      for (const id of ids) { if (await refreshGame(id)) { S.games[id].mine = true; S.games[id].follow = false; } }
      saveGames(); subscribeMe();
      if (location.hash === '' || location.hash === '#/') viewHome();
    } catch (e) { }
  }
  function onGameUpdate(row) {
    const g = S.games[row.id]; if (!g) return;
    const was = g.game.status; g.game = { ...g.game, ...row }; saveGames();
    if (was !== 'done' && row.status === 'done') celebrate(row.id);
    liveRender();
  }
  function onEvent(p) {
    const e = p.eventType === 'DELETE' ? p.old : p.new; if (!e) return;
    const g = S.games[e.game_id]; if (!g) return;
    g.events = g.events || [];
    if (p.eventType === 'DELETE') { g.events = g.events.filter(x => x.id !== e.id); saveGames(); liveRender(); return; }
    if (!g.events.some(x => x.id === e.id)) g.events.push(e);
    saveGames(); liveRender();
    if (!S.seen.has(e.id)) { S.seen.add(e.id); eventPopup(g, e); }
  }

  /* ---------- Sauvegarde automatique (serveur) ---------- */
  var backupTimer = null;
  function scheduleBackup() { clearTimeout(backupTimer); backupTimer = setTimeout(doBackup, 15000); }
  async function doBackup() {
    if (!sb || !navigator.onLine || !S.me || !S.me.name) return;
    const games = {}; Object.values(S.games).forEach(g => { if (!g.follow) games[g.game.id] = g; });
    const data = { v: 1, me: S.me, courses: S.customCourses, games, queue: S.queue };
    try {
      const { error } = await sb.from('backups').upsert({ device_id: S.me.deviceId, data, updated_at: new Date().toISOString() });
      if (!error) { S.lastBackup = new Date().toISOString(); LS.set('fw_lastbackup', S.lastBackup); const el = document.getElementById('p-bk'); if (el) el.textContent = backupLabel(); }
    } catch (e) { }
  }
  function backupLabel() {
    const t = S.lastBackup || LS.get('fw_lastbackup', null);
    if (!sb) return 'Sauvegarde auto : serveur non configuré';
    if (!t) return 'Sauvegarde auto : pas encore faite';
    const m = Math.round((Date.now() - new Date(t).getTime()) / 60000);
    return '☁️ Sauvegarde auto : ' + (m < 1 ? "à l'instant" : m < 60 ? 'il y a ' + m + ' min' : m < 1440 ? 'il y a ' + Math.round(m / 60) + ' h' : 'le ' + new Date(t).toLocaleDateString('fr-FR'));
  }
  async function restoreBackup(deviceId) {
    const { data, error } = await sb.from('backups').select('*').eq('device_id', deviceId).limit(1);
    if (error || !data || !data.length) return false;
    const d = data[0].data || {};
    Object.entries(d.games || {}).forEach(([id, g]) => { if (!S.games[id]) S.games[id] = g; });
    Object.entries(d.courses || {}).forEach(([id, c]) => { const loc = S.customCourses[id]; if (!loc || (c._updated || '') > (loc._updated || '')) S.customCourses[id] = c; });
    if (d.me && d.me.bag) S.me.bag = d.me.bag;
    LS.set('fw_games', S.games); LS.set('fw_courses', S.customCourses); LS.set('fw_me', S.me);
    return true;
  }

  /* ---------- Suivre mes potes ---------- */
  function followIds() { return S.me.follow ? S.me.partners.filter(p => p.device_id).map(p => p.device_id).slice(0, 40) : []; }
  async function followGame(gid) {
    if (!S.me.follow || S.games[gid]) return;
    try {
      const g = await fetchGameRemote({ id: gid });
      if (g.players.some(p => p.device_id === S.me.deviceId)) { S.games[gid] = { ...g, mine: true }; }
      else S.games[gid] = { ...g, mine: false, follow: true };
      saveGames(); subscribeMe();
      if (location.hash === '' || location.hash === '#/') viewHome();
    } catch (e) { }
  }
  async function pullFollowGames() {
    // nettoyage : parties suivies terminées depuis plus de 2 jours
    Object.values(S.games).forEach(g => { if (g.follow && (!S.me.follow || (g.game.status === 'done' && Date.now() - new Date(g.game.play_date + 'T23:59').getTime() > 2 * 864e5))) delete S.games[g.game.id]; });
    saveGames();
    const ids = followIds();
    if (!remoteOn() || !ids.length) { subscribeMe(); return; }
    try {
      const since = new Date(Date.now() - 2 * 864e5).toISOString();
      const { data } = await sb.from('players').select('game_id, created_at').in('device_id', ids).gte('created_at', since);
      const gids = [...new Set((data || []).map(r => r.game_id))].filter(id => !S.games[id] && !S.hidden.has(id));
      for (const id of gids) await followGame(id);
    } catch (e) { }
    subscribeMe();
  }

  /* ---------- Profil serveur & partenaires ---------- */
  function syncProfile() {
    saveMe();
    push({ t: 'upsert', table: 'profiles', row: { device_id: S.me.deviceId, code: S.me.code, name: S.me.name, idx: S.me.index === '' || S.me.index == null ? null : Number(S.me.index), tee: S.me.tee, bag: S.me.bag, partners: S.me.partners, updated_at: new Date().toISOString() } });
  }
  async function restoreProfile(code) {
    if (!remoteOn()) throw new Error('Serveur non configuré.');
    const { data, error } = await sb.from('profiles').select('*').eq('code', code.trim().toUpperCase()).limit(1);
    if (error) throw error;
    if (!data || !data.length) throw new Error('Aucun profil avec ce code.');
    const r = data[0];
    S.me = { deviceId: r.device_id, code: r.code, name: r.name || '', index: r.idx == null ? '' : String(r.idx), tee: r.tee || 'jaune', bag: r.bag || S.me.bag, partners: r.partners || [] };
    saveMe(); try { await restoreBackup(S.me.deviceId); } catch (e) { } await pullMyGames();
  }
  function rememberPartners(g) {
    if (!g || !myPlayer(g)) return;
    let changed = false;
    g.players.forEach(p => {
      if (p.device_id === S.me.deviceId) return;
      const k = p.device_id ? 'd:' + p.device_id : 'n:' + p.name.toLowerCase();
      let m = S.me.partners.find(x => x.key === k || (p.device_id && !x.device_id && x.name.toLowerCase() === p.name.toLowerCase()));
      if (!m) { m = { key: k, device_id: p.device_id || null, name: p.name, idx: p.idx, games: [] }; S.me.partners.push(m); changed = true; }
      if (p.device_id && !m.device_id) { m.device_id = p.device_id; m.key = k; changed = true; }
      if (p.idx != null && m.idx !== p.idx) { m.idx = p.idx; changed = true; }
      if (!m.games.includes(g.game.id)) { m.games.push(g.game.id); m.games = m.games.slice(-30); changed = true; }
    });
    if (changed) syncProfile();
  }

  /* ---------- Moments forts ---------- */
  function addEvent(gid, ev) {
    const g = S.games[gid];
    const row = { id: uid(), game_id: gid, by_name: S.me.name || '?', created_at: new Date().toISOString(), ...ev };
    g.events = g.events || []; g.events.push(row); saveGames();
    S.seen.add(row.id);
    push({ t: 'upsert', table: 'events', row });
    eventPopup(g, row);
  }
  function removeEvent(gid, id) {
    const g = S.games[gid]; g.events = (g.events || []).filter(e => e.id !== id); saveGames();
    push({ t: 'delete', table: 'events', match: { id } });
  }
  const popQueue = []; let popBusy = false;
  function eventPopup(g, e) { popQueue.push({ g, e }); if (!popBusy) nextPopup(); }
  function nextPopup() {
    const it = popQueue.shift(); if (!it) { popBusy = false; return; }
    popBusy = true;
    const { g, e } = it;
    const p = g.players.find(x => x.id === e.player_id); const name = p ? p.name : '?';
    let emoji, title, sub;
    if (e.type === 'rouge') { emoji = '🍺'; title = name + " n'a pas passé les rouges !"; sub = 'Trou ' + e.hole + ' · une tournée de plus pour ' + name; }
    else { const s = shotOf(e.type); emoji = s[1]; title = (e.type === 'autre' && e.label ? e.label : s[2]) + ' de ' + name + ' !'; sub = (e.hole ? 'Trou ' + e.hole + ' · ' : '') + 'signalé par ' + (e.by_name || '?'); }
    const el = document.createElement('div'); el.className = 'pop' + (e.type === 'rouge' ? ' rouge' : '');
    const conf = Array.from({ length: 36 }, (_, i) => `<i style="left:${Math.random() * 100}%;animation-delay:${Math.random() * .6}s;background:${['#e8272b', '#ffd400', '#22a052', '#2f6fd6', '#ff7ab6', '#fff'][i % 6]};transform:rotate(${Math.random() * 360}deg)"></i>`).join('');
    el.innerHTML = `<div class="conf">${e.type === 'rouge' ? '' : conf}</div><div class="popcard"><div class="popemoji">${emoji}</div><div class="poptitle">${esc(title)}</div><div class="popsub">${esc(sub)}</div><small>${esc(g.game.course.name)}</small></div>`;
    document.body.appendChild(el); vibrate([40, 60, 40]);
    const close = () => { if (!el.parentNode) return; el.classList.add('out'); setTimeout(() => { el.remove(); nextPopup(); }, 300); };
    el.onclick = close; setTimeout(close, 4500);
  }
  function invitePopup(g) {
    const host = g.game.created_by || 'Un pote';
    const el = document.createElement('div'); el.className = 'modal';
    el.innerHTML = `<div class="sheet"><div class="popemoji">⛳</div><h2 style="text-align:center">${esc(host)} t'a ajouté à une partie</h2><p style="text-align:center"><b>${esc(g.game.course.name)}</b><br>${frDate(g.game.play_date)}${g.game.tee_time ? ' à ' + esc(g.game.tee_time) : ''} · ${FORMATS[g.game.format]}<br><small>${g.players.map(p => esc(p.name)).join(', ')}</small></p><a class="btn big full" href="#/game/${g.game.id}">Ouvrir la partie</a><button class="btn ghost full">Plus tard</button></div>`;
    document.body.appendChild(el);
    el.querySelector('a').onclick = () => el.remove(); el.querySelector('button').onclick = () => el.remove();
  }
  function shotSheet(g, hole) {
    const st = { pid: (myPlayer(g) || g.players[0] || {}).id, type: null };
    const el = document.createElement('div'); el.className = 'modal';
    const draw = () => {
      el.innerHTML = `<div class="sheet"><h2>👏 Signaler un beau coup</h2>
        <div class="pick">${g.players.map(p => `<button data-p="${p.id}" class="${p.id === st.pid ? 'on' : ''}">${esc(p.name)}</button>`).join('')}</div>
        <div class="pick shots">${SHOTS.map(s => `<button data-t="${s[0]}" class="${s[0] === st.type ? 'on' : ''}"><span>${s[1]}</span>${s[2]}</button>`).join('')}</div>
        <button class="btn big full" id="sh-go" ${st.pid && st.type ? '' : 'disabled'}>Envoyer à tout le monde</button>
        <button class="btn ghost full" id="sh-x">Annuler</button></div>`;
      el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { st.pid = b.dataset.p; draw(); });
      el.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { st.type = b.dataset.t; draw(); });
      el.querySelector('#sh-x').onclick = () => el.remove();
      el.querySelector('#sh-go').onclick = () => {
        let label = null;
        if (st.type === 'autre') { label = prompt('Quel coup ?', 'Coup de génie'); if (!label) return; }
        el.remove(); addEvent(g.game.id, { player_id: st.pid, type: st.type, label, hole });
      };
    };
    draw(); document.body.appendChild(el);
    el.onclick = e => { if (e.target === el) el.remove(); };
  }

  /* ---------- Fin de partie : la tournée ---------- */
  function celebrate(gid) {
    const g = S.games[gid]; if (!g) return;
    const course = gameCourse(g);
    const pay = C.payers(g.players, g.game, course, scoresOf(g), g.events);
    const names = pay.last.map(x => x.name);
    const title = names.length ? 'Merci ' + names.join(' et ') + ' !' : 'Égalité parfaite !';
    const sub = names.length ? (names.length > 1 ? 'Derniers ex aequo : tournée partagée 🍻' : 'Dernier de la partie : c\'est ta tournée 🍻') : 'Personne ne paie… cette fois.';
    const extra = pay.rouges.map(r => `<li>🍺 <b>${esc(r.name)}</b> — pas passé les rouges au ${r.holes.join(', ')} → ${r.holes.length} tournée${r.holes.length > 1 ? 's' : ''}</li>`).join('');
    const bubbles = Array.from({ length: 14 }, () => `<circle cx="${45 + Math.random() * 70}" cy="200" r="${2 + Math.random() * 3}" style="animation-delay:${1 + Math.random() * 2.5}s;animation-duration:${1.6 + Math.random() * 1.6}s"/>`).join('');
    const el = document.createElement('div'); el.className = 'beer';
    el.innerHTML = `<div class="beerin">
      <svg viewBox="0 0 160 230" class="glass" aria-hidden="true">
        <defs><clipPath id="gclip"><path d="M30 30 L130 30 L120 215 Q80 222 40 215 Z"/></clipPath>
        <linearGradient id="beerg" x1="0" x2="1"><stop offset="0" stop-color="#f2a900"/><stop offset=".5" stop-color="#ffc83d"/><stop offset="1" stop-color="#e59400"/></linearGradient></defs>
        <g clip-path="url(#gclip)"><rect class="liquid" x="20" y="30" width="120" height="200" fill="url(#beerg)"/><g class="bubbles" fill="#fff8">${bubbles}</g>
        <g class="foam"><circle cx="40" cy="40" r="16"/><circle cx="62" cy="34" r="18"/><circle cx="86" cy="36" r="17"/><circle cx="108" cy="33" r="18"/><circle cx="126" cy="40" r="15"/><rect x="25" y="38" width="110" height="16"/></g></g>
        <path d="M30 30 L130 30 L120 215 Q80 222 40 215 Z" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round" opacity=".9"/>
        <path d="M130 70 Q160 72 158 115 Q156 155 124 158" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" opacity=".9"/>
        <path d="M42 50 L50 200" stroke="#fff" stroke-width="4" opacity=".35" stroke-linecap="round"/>
      </svg>
      <div class="beertitle">${esc(title)}</div><div class="beersub">${esc(sub)}</div>
      ${extra ? `<ul class="beerlist">${extra}</ul>` : ''}
      <button class="btn big" id="cheers">Santé ! 🍻</button></div>`;
    document.body.appendChild(el); vibrate([80, 80, 80, 80, 200]);
    el.querySelector('#cheers').onclick = () => { el.classList.add('out'); setTimeout(() => el.remove(), 350); };
  }

  /* ---------- Drapeaux automatiques (OpenStreetMap) ---------- */
  async function autoFlags(courseId, silent) {
    const course = getCourse(courseId); if (!course) return 0;
    if (!silent) toast('Recherche des drapeaux…');
    let center = course.center;
    try {
      if (!center) {
        // on cherche le golf par son nom, sinon on prend ma position
        const q = encodeURIComponent((/golf/i.test(course.name) ? '' : 'golf ') + course.name + ' ' + (course.city || ''));
        const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + q).then(x => x.json()).catch(() => []);
        center = r && r[0] ? { lat: +r[0].lat, lng: +r[0].lon } : S.pos;
        if (!center) { if (!silent) alert('Golf introuvable par son nom : lance la recherche depuis le parcours, GPS activé.'); return 0; }
        const cc = JSON.parse(JSON.stringify(getCourse(courseId))); cc.center = { lat: +center.lat.toFixed(6), lng: +center.lng.toFixed(6) }; saveCourse(cc);
      }
      const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(C.overpassQuery(center, 2500)), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      const found = C.flagsFromOSM(await res.json(), course);
      const n = Object.keys(found).length;
      const copy = JSON.parse(JSON.stringify(getCourse(courseId)));
      copy._osm = new Date().toISOString();
      Object.entries(found).forEach(([hole, pts]) => { const h = copy.holes[hole - 1]; h.gps = { ...(h.gps || {}), ...pts }; });
      saveCourse(copy);
      if (!silent || n) toast(n ? `🛰️ ${n}/${course.holes.length} trous placés automatiquement` : 'Ce golf n\'est pas cartographié sur OpenStreetMap : place les greens à la main.');
      renderGameBody();
      return n;
    } catch (e) { if (!silent) alert('Recherche impossible (connexion ?)'); return 0; }
  }

  async function pullCourses() {
    if (!remoteOn()) return;
    try {
      const { data } = await sb.from('courses').select('*');
      (data || []).forEach(r => { const loc = S.customCourses[r.id]; if (!loc || !loc._updated || new Date(r.updated_at) >= new Date(loc._updated)) S.customCourses[r.id] = { ...r.data, _updated: r.updated_at }; });
      saveCourses();
    } catch (e) { }
  }
  function saveCourse(course) {
    course._updated = new Date().toISOString();
    S.customCourses[course.id] = course; saveCourses();
    const data = { ...course }; delete data._updated;
    push({ t: 'upsert', table: 'courses', row: { id: course.id, name: course.name, data, updated_at: course._updated } });
  }

  function updateSyncBadge() {
    const el = document.getElementById('sync'); if (!el) return;
    let txt, cls;
    if (!remoteOn()) { txt = 'Local'; cls = 'off'; }
    else if (!navigator.onLine) { txt = 'Hors ligne' + (S.queue.length ? ' · ' + S.queue.length : ''); cls = 'warn'; }
    else if (S.queue.length) { txt = 'Envoi…'; cls = 'warn'; }
    else { txt = S.live ? 'En direct' : 'Synchro'; cls = 'ok'; }
    el.textContent = txt; el.className = 'sync ' + cls;
  }

  /* ---------- Parties ---------- */
  function createGame(opts) {
    const course = getCourse(opts.courseId);
    const snap = JSON.parse(JSON.stringify(course)); delete snap._updated;
    const game = { id: uid(), code: code6(), course_id: course.id, course: snap, tee: opts.tee, mode: opts.mode, format: opts.format, play_date: opts.date || today(), tee_time: opts.time || null, status: 'open', created_by: S.me.name, created_at: new Date().toISOString() };
    const players = opts.players.map((p, i) => ({ id: uid(), game_id: game.id, device_id: i === 0 ? S.me.deviceId : (p.device_id || null), name: p.name, idx: p.idx === '' ? null : Number(p.idx), tee: p.tee || opts.tee, created_at: new Date(Date.now() + i).toISOString() }));
    S.games[game.id] = { game, players, scores: {}, events: [], mine: true }; saveGames();
    push({ t: 'upsert', table: 'games', row: game });
    players.forEach(p => push({ t: 'upsert', table: 'players', row: p }));
    rememberPartners(S.games[game.id]); setTimeout(subscribeMe, 1500);
    return game.id;
  }
  function setScore(gid, pid, hole, patch) {
    const g = S.games[gid];
    const cur = (g.scores[pid] = g.scores[pid] || {})[hole] || { strokes: null, putts: null, pickup: false };
    const s = { ...cur, ...patch };
    const empty = s.strokes == null && !s.pickup && s.putts == null;
    if (empty) delete g.scores[pid][hole]; else g.scores[pid][hole] = s;
    saveGames();
    if (empty) push({ t: 'delete', table: 'scores', match: { player_id: pid, hole } });
    else push({ t: 'upsert', table: 'scores', onConflict: 'player_id,hole', row: { game_id: gid, player_id: pid, hole, strokes: s.strokes, putts: s.putts, pickup: s.pickup, updated_at: new Date().toISOString() } });
  }
  function addPlayer(gid, p) {
    const g = S.games[gid];
    const row = { id: uid(), game_id: gid, device_id: p.device_id || null, name: p.name, idx: p.idx === '' || p.idx == null ? null : Number(p.idx), tee: p.tee || g.game.tee, created_at: new Date().toISOString() };
    g.players.push(row); saveGames(); push({ t: 'upsert', table: 'players', row });
    return row;
  }
  function updateGame(gid, patch) {
    const g = S.games[gid]; g.game = { ...g.game, ...patch }; saveGames();
    push({ t: 'upsert', table: 'games', row: g.game });
  }
  const scoresOf = g => g.scores || {};
  const myPlayer = g => g.players.find(p => p.device_id === S.me.deviceId) || null;

  function inviteText(g) {
    const link = location.origin + location.pathname + '#/join/' + g.game.code;
    const c = g.game.course;
    const when = frDate(g.game.play_date) + (g.game.tee_time ? ' à ' + g.game.tee_time : '');
    return { link, text: '⛳ Partie de golf — ' + c.name + '\n📅 ' + when + '\n🏌️ ' + FORMATS[g.game.format] + ' · ' + MODES[g.game.mode] + ' · repère ' + teeName(c, g.game.tee) + '\nRejoins la partie : ' + link + '\n(code ' + g.game.code + ')' };
  }
  const teeName = (c, id) => ((c.tees || []).find(t => t.id === id) || {}).name || id;

  /* ---------- GPS ---------- */
  function startGPS() {
    if (S.watchId != null || !navigator.geolocation) return;
    S.watchId = navigator.geolocation.watchPosition(p => {
      S.pos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) };
      updateGPSView();
    }, err => { S.gpsErr = err.message; updateGPSView(); }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 });
  }
  function stopGPS() { if (S.watchId != null) { navigator.geolocation.clearWatch(S.watchId); S.watchId = null; } }

  /* ---------- Rendu ---------- */
  function topbar(title, back, extra) {
    return `<header class="top">${back ? `<a class="back" href="${back}" aria-label="Retour">‹</a>` : '<span class="logo">⛳</span>'}<h1>${esc(title)}${title === 'Fairway' ? ' <span class="beta">En beta et pour les copains</span>' : ''}</h1><span id="sync" class="sync"></span>${extra || ''}</header>`;
  }
  function route() {
    const h = location.hash.replace(/^#\/?/, '');
    const [r, a, b] = h.split('/');
    if (r !== 'game') { stopGPS(); unsubscribe(); }
    if (!S.me.name && r !== 'join' && r !== 'profile') return viewWelcome();
    if (r === 'new') return viewNew();
    if (r === 'game' && a) return viewGame(a);
    if (r === 'join' && a) return viewJoin(a);
    if (r === 'courses') return viewCourses();
    if (r === 'course' && a) return viewCourseEdit(a);
    if (r === 'profile') return viewProfile();
    if (r === 'stats') return viewStats();
    return viewHome();
  }
  window.addEventListener('hashchange', route);
  let liveTimer = null;
  function liveRender() { clearTimeout(liveTimer); liveTimer = setTimeout(() => { if (location.hash.startsWith('#/game/')) renderGameBody(); }, 150); }

  /* --- Accueil --- */
  function myRoundStats() {
    const rounds = [];
    Object.values(S.games).forEach(g => {
      const p = myPlayer(g); if (!p) return;
      const course = gameCourse(g);
      const s = C.playerSummary(p, g.game, course, scoresOf(g)[p.id] || {});
      rounds.push({ g, p, s, course });
    });
    rounds.sort((a, b) => (b.g.game.play_date || '').localeCompare(a.g.game.play_date || '') || (b.g.game.created_at || '').localeCompare(a.g.game.created_at || ''));
    return rounds;
  }
  function viewHome() {
    const rounds = myRoundStats();
    const potes = Object.values(S.games).filter(g => g.follow).sort((a, b) => (b.game.created_at || '').localeCompare(a.game.created_at || ''));
    const open = Object.values(S.games).filter(g => !g.follow && g.game.status !== 'done').sort((a, b) => (b.game.created_at || '').localeCompare(a.game.created_at || ''));
    const done = Object.values(S.games).filter(g => !g.follow && g.game.status === 'done').sort((a, b) => (b.game.play_date || '').localeCompare(a.game.play_date || ''));
    const card = g => {
      const p = myPlayer(g) || g.players[0];
      const s = p ? C.playerSummary(p, g.game, gameCourse(g), scoresOf(g)[p.id] || {}) : null;
      const sc = s && s.played ? (g.game.format === 'stableford' ? s.points + ' pts' : s.gross + ' (' + fmtPar(s.toPar) + ')') : '—';
      return `<a class="gcard" href="#/game/${g.game.id}"><div><b>${esc(g.game.course.name)}</b><small>${frDate(g.game.play_date)}${g.game.tee_time ? ' · ' + esc(g.game.tee_time) : ''} · ${FORMATS[g.game.format]} · ${MODES[g.game.mode]}</small><small>${g.players.map(x => esc(x.name)).join(', ')}</small></div><div class="gscore">${sc}<small>${s ? s.played + '/' + s.holes : ''}</small></div></a>`;
    };
    const potesCard = g => {
      const rows = C.leaderboard(g.players, g.game, gameCourse(g), scoresOf(g));
      const lead = rows[0];
      const holesDone = Math.max(0, ...rows.map(r => r.played));
      return `<a class="gcard pote" href="#/game/${g.game.id}"><div><b>${esc(g.players.map(x => x.name).join(', '))}</b><small>${esc(g.game.course.name)} · ${FORMATS[g.game.format]}${g.game.status === 'done' ? ' · terminée' : ''}</small><small>${lead && lead.played ? 'En tête : ' + esc(lead.name) + (g.game.format === 'stableford' ? ' (' + lead.points + ' pts)' : ' (' + fmtPar(g.game.format === 'brut' ? lead.toPar : lead.netToPar) + ')') : 'Pas encore commencé'}</small></div><div class="gscore">${g.game.status === 'done' ? '🍺' : holesDone + '/' + C.holesFor(g.game.mode, g.game.course.holes.length).length}</div></a>`;
    };
    $app.innerHTML = topbar('Fairway') + `<main>
      <section class="hello"><div><b>${esc(S.me.name || 'Golfeur')}</b><small>Index ${S.me.index !== '' && S.me.index != null ? esc(S.me.index) : '—'}</small></div><a class="btn ghost sm" href="#/profile">Profil</a></section>
      ${!S.me.name ? '<p class="hint">👋 Commence par renseigner ton nom et ton index dans <a href="#/profile">Profil</a>.</p>' : ''}
      <div class="row2"><a class="btn big" href="#/new">＋ Nouvelle partie</a><button class="btn big ghost" data-act="join">Rejoindre</button></div>
      ${open.length ? '<h2>En cours</h2>' + open.map(card).join('') : ''}
      ${potes.length ? '<h2>🔭 Mes potes jouent</h2>' + potes.map(potesCard).join('') : ''}
      <h2>Historique</h2>${done.length ? done.slice(0, 15).map(card).join('') : '<p class="muted">Aucune partie terminée.</p>'}
      <div class="row3"><a class="btn ghost" href="#/stats">📊 Stats</a><a class="btn ghost" href="#/courses">🗺️ Parcours</a><a class="btn ghost" href="#/profile">⚙️ Réglages</a></div>
    </main>`;
    updateSyncBadge();
    $app.querySelector('[data-act=join]').onclick = () => { const c = prompt('Code de la partie (6 caractères) :'); if (c) location.hash = '#/join/' + c.trim().toUpperCase(); };
  }

  /* --- Nouvelle partie --- */
  function viewNew() {
    const courses = Object.values(allCourses());
    const st = { courseId: courses[0] && courses[0].id, tee: S.me.tee || 'jaune', mode: '18', format: 'stableford', date: today(), time: '', players: [{ name: S.me.name || 'Moi', idx: S.me.index == null ? '' : S.me.index, me: true }] };
    const partners = S.me.partners.slice().sort((a, b) => (b.games || []).length - (a.games || []).length).slice(0, 16);
    const draw = () => {
      const c = getCourse(st.courseId);
      if (c && !c.tees.find(t => t.id === st.tee)) st.tee = c.tees[0].id;
      $app.innerHTML = topbar('Nouvelle partie', '#/') + `<main class="form">
        <label>Parcours<select id="n-course">${courses.map(x => `<option value="${esc(x.id)}" ${x.id === st.courseId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
        <div class="row2"><label>Repère<select id="n-tee">${c.tees.map(t => `<option value="${esc(t.id)}" ${t.id === st.tee ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
        <label>Trous<select id="n-mode">${Object.entries(MODES).filter(([k]) => c.holes.length >= 18 || k !== 'back').map(([k, v]) => `<option value="${k}" ${k === st.mode ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>
        <label>Formule<select id="n-format">${Object.entries(FORMATS).map(([k, v]) => `<option value="${k}" ${k === st.format ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <div class="row2"><label>Date<input type="date" id="n-date" value="${st.date}"></label><label>Départ<input type="time" id="n-time" value="${st.time}"></label></div>
        <h2>Joueurs</h2>
        <div id="n-players">${st.players.map((p, i) => `<div class="prow"><input placeholder="Nom" data-i="${i}" data-f="name" value="${esc(p.name)}"><input placeholder="Index" inputmode="decimal" data-i="${i}" data-f="idx" value="${esc(p.idx)}">${i ? `<button class="x" data-del="${i}">✕</button>` : '<span class="me">moi</span>'}</div>`).join('')}</div>
        ${partners.length ? `<h2>Mes partenaires</h2><div class="pick">${partners.map(m => `<button data-pk="${esc(m.key)}" class="${st.players.some(p => p.key === m.key) ? 'on' : ''}">${esc(m.name)}${m.device_id ? ' 📱' : ''}</button>`).join('')}</div><p class="hint">📱 = a l'appli : la partie apparaîtra directement sur son téléphone.</p>` : ''}
        <button class="btn ghost" id="n-add">＋ Ajouter un joueur</button>
        <p class="hint">Tes potes peuvent aussi se rajouter eux-mêmes avec le lien d'invitation, une fois la partie créée.</p>
        ${st.format === 'match' ? '<p class="hint">Match play : chaque duel 1 contre 1 est calculé, coups rendus = différence des handicaps de jeu.</p>' : ''}
        <button class="btn big" id="n-go">Créer la partie</button>
      </main>`;
      updateSyncBadge();
      const bind = (id, k) => { $app.querySelector(id).onchange = e => { st[k] = e.target.value; draw(); }; };
      bind('#n-course', 'courseId'); bind('#n-tee', 'tee'); bind('#n-mode', 'mode'); bind('#n-format', 'format');
      $app.querySelector('#n-date').onchange = e => (st.date = e.target.value);
      $app.querySelector('#n-time').onchange = e => (st.time = e.target.value);
      $app.querySelectorAll('#n-players input').forEach(inp => inp.oninput = e => { st.players[+e.target.dataset.i][e.target.dataset.f] = e.target.value; });
      $app.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { st.players.splice(+b.dataset.del, 1); draw(); });
      $app.querySelectorAll('[data-pk]').forEach(b => b.onclick = () => {
        const m = partners.find(x => x.key === b.dataset.pk); const i = st.players.findIndex(p => p.key === m.key);
        if (i >= 0) st.players.splice(i, 1); else if (st.players.length < 8) st.players.push({ name: m.name, idx: m.idx == null ? '' : m.idx, device_id: m.device_id, key: m.key });
        draw();
      });
      $app.querySelector('#n-add').onclick = () => { if (st.players.length >= 8) return; st.players.push({ name: '', idx: '' }); draw(); };
      $app.querySelector('#n-go').onclick = () => {
        const players = st.players.filter(p => String(p.name).trim()).map(p => ({ name: String(p.name).trim(), idx: String(p.idx == null ? '' : p.idx).replace(',', '.'), device_id: p.device_id || null }));
        if (!players.length) return alert('Ajoute au moins un joueur.');
        const id = createGame({ ...st, players });
        location.hash = '#/game/' + id;
      };
    };
    draw();
  }

  /* --- Rejoindre --- */
  async function viewJoin(code) {
    $app.innerHTML = topbar('Rejoindre', '#/') + `<main><p class="muted">Recherche de la partie ${esc(code)}…</p></main>`;
    updateSyncBadge();
    const existing = Object.values(S.games).find(g => g.game.code === code.toUpperCase());
    if (existing && myPlayer(existing)) { location.hash = '#/game/' + existing.game.id; return; }
    let g;
    try { g = await fetchGameRemote({ code }); }
    catch (e) { $app.querySelector('main').innerHTML = `<p class="err">${esc(e.message)}</p>${!remoteOn() ? '<a class="btn" href="#/profile">Configurer le serveur</a>' : ''}`; return; }
    S.games[g.game.id] = { ...g, mine: false }; saveGames();
    const free = g.players.filter(p => !p.device_id);
    $app.querySelector('main').innerHTML = `
      <section class="card"><b>${esc(g.game.course.name)}</b><small>${frDate(g.game.play_date)}${g.game.tee_time ? ' à ' + esc(g.game.tee_time) : ''} · ${FORMATS[g.game.format]} · ${MODES[g.game.mode]} · repère ${esc(teeName(g.game.course, g.game.tee))}</small><small>Joueurs : ${g.players.map(p => esc(p.name)).join(', ') || '—'}</small></section>
      ${free.length ? `<h2>C'est toi ?</h2>${free.map(p => `<button class="btn ghost full" data-claim="${p.id}">Je suis ${esc(p.name)}</button>`).join('')}<h2>Ou</h2>` : ''}
      <div class="form"><div class="row2"><label>Nom<input id="j-name" value="${esc(S.me.name)}"></label><label>Index<input id="j-idx" inputmode="decimal" value="${esc(S.me.index)}"></label></div>
      <button class="btn big" id="j-go">M'ajouter à la partie</button>
      <button class="btn ghost full" id="j-view">Juste suivre les scores</button></div>`;
    $app.querySelectorAll('[data-claim]').forEach(b => b.onclick = () => {
      const p = g.players.find(x => x.id === b.dataset.claim); p.device_id = S.me.deviceId; S.games[g.game.id].mine = true; saveGames();
      push({ t: 'upsert', table: 'players', row: p }); if (!S.me.name) { S.me.name = p.name; S.me.index = p.idx == null ? '' : String(p.idx); syncProfile(); } subscribeMe(); location.hash = '#/game/' + g.game.id;
    });
    $app.querySelector('#j-go').onclick = () => {
      const name = $app.querySelector('#j-name').value.trim(); if (!name) return alert('Ton nom ?');
      const idx = $app.querySelector('#j-idx').value.replace(',', '.');
      if (!S.me.name) { S.me.name = name; S.me.index = idx; syncProfile(); }
      addPlayer(g.game.id, { name, idx, device_id: S.me.deviceId }); S.games[g.game.id].mine = true; saveGames(); subscribeMe();
      location.hash = '#/game/' + g.game.id;
    };
    $app.querySelector('#j-view').onclick = () => (location.hash = '#/game/' + g.game.id);
  }

  /* --- Partie --- */
  let curGid = null;
  function viewGame(gid) {
    curGid = gid;
    const g = S.games[gid];
    if (!g) {
      $app.innerHTML = topbar('Partie', '#/') + '<main><p class="muted">Chargement…</p></main>'; updateSyncBadge();
      refreshGame(gid).then(ok => ok ? viewGame(gid) : ($app.querySelector('main').innerHTML = '<p class="err">Partie introuvable.</p>'));
      return;
    }
    const holes = C.holesFor(g.game.mode, g.game.course.holes.length);
    if (!S.hole[gid] || !holes.includes(S.hole[gid])) {
      // reprendre au premier trou non saisi pour moi
      const me = myPlayer(g); const sc = me ? (scoresOf(g)[me.id] || {}) : {};
      S.hole[gid] = holes.find(h => !sc[h]) || holes[0];
    }
    $app.innerHTML = topbar(g.game.course.name, '#/', `<button class="icon" id="g-invite" aria-label="Inviter">📨</button>`) +
      `<nav class="tabs">${[['trou', 'Trou'], ['carte', 'Carte'], ['classement', 'Classement'], ['score', 'Carte de score']].map(([k, v]) => `<button data-tab="${k}" class="${S.tab === k ? 'on' : ''}">${v}</button>`).join('')}</nav><main id="gbody"></main>`;
    updateSyncBadge();
    $app.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { S.tab = b.dataset.tab; $app.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('on', x === b)); renderGameBody(); });
    $app.querySelector('#g-invite').onclick = () => showInvite(g);
    startGPS();
    subscribe(gid);
    rememberPartners(g);
    const lc = getCourse(g.game.course_id);
    if (lc && !lc._osm && !lc.holes.some(h => h.gps && h.gps.center) && navigator.onLine) autoFlags(lc.id, false);
    if (remoteOn()) refreshGame(gid).then(ok => ok && liveRender());
    renderGameBody();
  }

  function renderGameBody() {
    const body = document.getElementById('gbody'); if (!body || !curGid) return;
    const g = S.games[curGid]; if (!g) return;
    if (S.tab !== 'carte') destroyMap();
    if (S.tab === 'trou') return renderHole(body, g);
    if (S.tab === 'carte') return renderMap(body, g);
    if (S.tab === 'classement') return renderBoard(body, g);
    return renderCard(body, g);
  }

  function holeChips(g, cur) {
    const holes = C.holesFor(g.game.mode, g.game.course.holes.length);
    const me = myPlayer(g) || g.players[0];
    const sc = me ? (scoresOf(g)[me.id] || {}) : {};
    return `<div class="chips" id="chips">${holes.map(h => `<button data-h="${h}" class="${h === cur ? 'on' : ''} ${sc[h] ? 'done' : ''}">${h}</button>`).join('')}</div>`;
  }

  function renderHole(body, g) {
    const course = gameCourse(g);
    const h = S.hole[g.game.id];
    const ch = course.holes[h - 1];
    const holes = C.holesFor(g.game.mode, course.holes.length);
    const dist = ch.dist ? ch.dist[g.game.tee] : null;
    const players = g.players.slice().sort((a, b) => (b.device_id === S.me.deviceId) - (a.device_id === S.me.deviceId));
    const stars = ch.difficulty ? '★'.repeat(ch.difficulty) + '☆'.repeat(5 - ch.difficulty) : '';
    const sumRows = players.map(p => {
      const s = C.playerSummary(p, g.game, course, scoresOf(g)[p.id] || {});
      const cur = (scoresOf(g)[p.id] || {})[h] || {};
      const recv = s.recv[h] || 0;
      const shown = cur.pickup ? 'X' : (cur.strokes != null ? cur.strokes : '–');
      const ph = s.perHole[h];
      const cls = cur.pickup ? 'pick' : (cur.strokes != null ? scoreCls(cur.strokes - ch.par) : '');
      return `<div class="player" data-pid="${p.id}">
        <div class="pname"><b>${esc(p.name)}${p.device_id === S.me.deviceId ? ' <span class="tag">moi</span>' : ''}</b><small>HCP jeu ${s.ph} · ${recv > 0 ? '●'.repeat(recv) + ' reçoit ' + recv : (recv < 0 ? 'rend ' + (-recv) : 'pas de coup')} · ${g.game.format === 'stableford' ? s.points + ' pts' : 'net ' + fmtPar(s.netToPar)}</small></div>
        <div class="stepper"><button data-s="-1">−</button><span class="val ${cls}">${shown}</span><button data-s="1">＋</button></div>
        <div class="sub"><span>Putts</span><button data-pt="-1">−</button><span class="pv">${cur.putts != null ? cur.putts : '–'}</span><button data-pt="1">＋</button>
          <button class="pickbtn ${cur.pickup ? 'on' : ''}" data-pick="1" title="Balle ramassée">X</button>
          ${(p.tee || g.game.tee) !== 'rouge' ? `<button class="pickbtn rougebtn ${rougeEv(g, p.id, h) ? 'on' : ''}" data-rouge="1" title="Pas passé les rouges">🍺 Rouges</button>` : ''}
          <span class="res">${ph && ph.gross != null ? C.scoreName(cur.strokes, ch.par, cur.pickup) + (g.game.format === 'stableford' ? ' · ' + ph.points + ' pt' + (ph.points > 1 ? 's' : '') : '') : ''}</span></div>
      </div>`;
    }).join('');
    const idx = holes.indexOf(h);
    body.innerHTML = holeChips(g, h) + `
      <section class="holehead"><div class="hn">${h}</div><div><b>Par ${ch.par}</b> · HCP ${ch.si}${dist ? ' · ' + dist + ' m' : ''}<small>${stars ? `<span class="stars">${stars}</span> ` : ''}${ch.note ? esc(ch.note) : '<i class="muted">Pas de note sur ce trou</i>'}</small></div><button class="icon" id="h-note" aria-label="Modifier la note">✏️</button></section>
      <section class="gps" id="gps"></section>
      <button class="btn shotbtn full" id="h-shot">👏 Signaler un beau coup</button>
      <section class="players">${sumRows}</section>
      ${g.players.length < 8 ? '<button class="btn ghost full" id="h-addp">＋ Ajouter un joueur</button>' : ''}
      <div class="holenav"><button class="btn ghost" id="h-prev" ${idx <= 0 ? 'disabled' : ''}>‹ Trou ${holes[idx - 1] || ''}</button>${idx < holes.length - 1 ? `<button class="btn" id="h-next">Trou ${holes[idx + 1]} ›</button>` : (g.game.status !== 'done' ? '<button class="btn" id="h-end">Terminer la partie</button>' : '<button class="btn ghost" id="h-reopen">Rouvrir la partie</button>')}</div>`;
    updateGPSView();
    const chips = body.querySelector('#chips'); const on = chips.querySelector('.on'); if (on) chips.scrollLeft = on.offsetLeft - chips.clientWidth / 2 + 20;
    chips.querySelectorAll('[data-h]').forEach(b => b.onclick = () => { S.hole[g.game.id] = +b.dataset.h; S.measure = null; renderGameBody(); });
    body.querySelectorAll('.player').forEach(row => {
      const pid = row.dataset.pid;
      const cur = () => (scoresOf(g)[pid] || {})[h] || {};
      row.querySelectorAll('[data-s]').forEach(b => b.onclick = () => {
        const c = cur(); let v = c.strokes != null ? c.strokes + (+b.dataset.s) : ch.par + (+b.dataset.s > 0 ? 0 : -1);
        if (c.strokes == null && +b.dataset.s > 0) v = ch.par;
        if (v < 1) { setScore(g.game.id, pid, h, { strokes: null, pickup: false }); }
        else setScore(g.game.id, pid, h, { strokes: Math.min(v, 20), pickup: false });
        vibrate(); renderGameBody();
      });
      row.querySelectorAll('[data-pt]').forEach(b => b.onclick = () => {
        const c = cur(); let v = c.putts != null ? c.putts + (+b.dataset.pt) : (+b.dataset.pt > 0 ? 2 : 0);
        setScore(g.game.id, pid, h, { putts: v < 0 ? null : Math.min(v, 10) }); renderGameBody();
      });
      const rb = row.querySelector('[data-rouge]');
      if (rb) rb.onclick = () => { const ev = rougeEv(g, pid, h); if (ev) removeEvent(g.game.id, ev.id); else addEvent(g.game.id, { player_id: pid, type: 'rouge', hole: h }); renderGameBody(); };
      row.querySelector('[data-pick]').onclick = () => { const c = cur(); setScore(g.game.id, pid, h, { pickup: !c.pickup, strokes: c.pickup ? c.strokes : null }); renderGameBody(); };
    });
    body.querySelector('#h-note').onclick = () => editNote(g, h);
    body.querySelector('#h-shot').onclick = () => shotSheet(g, h);
    const add = body.querySelector('#h-addp'); if (add) add.onclick = () => { const n = prompt('Nom du joueur :'); if (!n) return; const i = prompt('Index de ' + n + ' :', ''); addPlayer(g.game.id, { name: n.trim(), idx: (i || '').replace(',', '.') }); renderGameBody(); };
    const go = d => { S.hole[g.game.id] = holes[idx + d]; S.measure = null; renderGameBody(); window.scrollTo(0, 0); };
    const p = body.querySelector('#h-prev'); if (p) p.onclick = () => go(-1);
    const n = body.querySelector('#h-next'); if (n) n.onclick = () => go(1);
    const e = body.querySelector('#h-end'); if (e) e.onclick = () => { if (confirm('Terminer la partie ?')) { updateGame(g.game.id, { status: 'done' }); S.tab = 'classement'; viewGame(g.game.id); celebrate(g.game.id); } };
    const r = body.querySelector('#h-reopen'); if (r) r.onclick = () => { updateGame(g.game.id, { status: 'open' }); renderGameBody(); };
  }
  const rougeEv = (g, pid, h) => (g.events || []).find(e => e.type === 'rouge' && e.player_id === pid && e.hole === h);
  const scoreCls = d => d <= -2 ? 'eagle' : d === -1 ? 'birdie' : d === 0 ? 'par' : d === 1 ? 'bogey' : 'dbl';
  const vibrate = pat => { try { navigator.vibrate && navigator.vibrate(pat || 15); } catch (e) { } };

  function editNote(g, h) {
    const course = getCourse(g.game.course_id); if (!course) return;
    const ch = course.holes[h - 1];
    const note = prompt('Note / difficultés du trou ' + h + ' (partagée avec tes potes) :', ch.note || '');
    if (note === null) return;
    const d = prompt('Difficulté de 1 (facile) à 5 (piège) — vide pour aucune :', ch.difficulty || '');
    const copy = JSON.parse(JSON.stringify(course));
    copy.holes[h - 1].note = note.trim();
    const dn = parseInt(d, 10); copy.holes[h - 1].difficulty = dn >= 1 && dn <= 5 ? dn : null;
    saveCourse(copy); renderGameBody();
  }

  function updateGPSView() {
    const el = document.getElementById('gps'); if (!el || !curGid) return;
    const g = S.games[curGid]; if (!g) return;
    const course = gameCourse(g); const h = S.hole[curGid]; const gps = (course.holes[h - 1] || {}).gps || {};
    const P = S.pos;
    let html = '';
    if (!P) html = `<div class="gpsmsg">📡 ${S.gpsErr ? 'GPS indisponible : ' + esc(S.gpsErr) : 'Recherche GPS…'}</div>`;
    else if (!gps.center) html = `<div class="gpsmsg">Green pas encore placé pour ce trou.</div><div class="row2"><button class="btn ghost sm" data-gp="center">📍 Je suis au centre du green</button><button class="btn ghost sm" data-goto="carte">🗺️ Placer sur la carte</button></div>`;
    else {
      const dc = C.distance(P, gps.center), df = C.distance(P, gps.front), db = C.distance(P, gps.back);
      const club = C.suggestClub(dc, S.me.bag);
      html = `<div class="dist"><div><small>Avant</small><b>${df != null ? df : '–'}</b></div><div class="mid"><small>Centre</small><b>${dc}</b><small>m</small></div><div><small>Arrière</small><b>${db != null ? db : '–'}</b></div></div>
        ${club && dc < 300 ? `<div class="club">➜ ${esc(club.club)} <small>(${club.dist} m carry)</small></div>` : ''}`;
    }
    if (P) {
      const m = S.measure;
      html += `<div class="measure">${m ? `Coup mesuré : <b>${C.distance(m, P)} m</b> <button class="btn sm" data-ms="stop">OK</button>` : '<button class="btn ghost sm" data-ms="start">📏 Mesurer mon coup</button>'}<small class="acc">précision ±${P.acc} m</small></div>`;
    }
    el.innerHTML = html;
    el.querySelectorAll('[data-gp]').forEach(b => b.onclick = () => setGreenPoint(g, h, b.dataset.gp, S.pos));
    el.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => { S.tab = 'carte'; S.mapEdit = 'center'; viewGame(curGid); });
    el.querySelectorAll('[data-ms]').forEach(b => b.onclick = () => { if (b.dataset.ms === 'start') { S.measure = { lat: S.pos.lat, lng: S.pos.lng }; } else { const d = C.distance(S.measure, S.pos); S.measure = null; if (d) alert('Distance du coup : ' + d + ' m'); } updateGPSView(); });
  }

  function setGreenPoint(g, h, key, pt) {
    const course = getCourse(g.game.course_id); if (!course || !pt) return;
    const copy = JSON.parse(JSON.stringify(course));
    const hh = copy.holes[h - 1]; hh.gps = hh.gps || {};
    hh.gps[key] = { lat: +pt.lat.toFixed(7), lng: +pt.lng.toFixed(7) };
    if (key === 'center' && !copy.center) copy.center = { ...hh.gps.center };
    saveCourse(copy);
    if (S.tab === 'trou') renderGameBody(); else drawMapLayers();
  }

  /* --- Carte (Leaflet, satellite) --- */
  let map = null, layers = null, target = null;
  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    return new Promise((res, rej) => {
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(css);
      const s = document.createElement('script'); s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s);
    });
  }
  function destroyMap() { if (map) { map.remove(); map = null; layers = null; target = null; } }
  function renderMap(body, g) {
    const h = S.hole[g.game.id];
    body.innerHTML = holeChips(g, h) + `<div class="maptools">${[['tee', 'Départ'], ['front', 'Avant green'], ['center', 'Centre green'], ['back', 'Arrière green']].map(([k, v]) => `<button data-me="${k}" class="${S.mapEdit === k ? 'on' : ''}">${v}</button>`).join('')}</div>
      <button class="btn ghost sm full" id="m-auto">🛰️ Trouver les drapeaux automatiquement</button><p class="hint" id="maphint">${S.mapEdit ? 'Touche la carte pour placer : <b>' + ({ tee: 'départ', front: 'avant du green', center: 'centre du green', back: 'arrière du green' })[S.mapEdit] + '</b>' : 'Touche la carte pour mesurer une distance. Choisis un repère ci-dessus pour placer les points du trou.'}</p>
      <div id="map"></div><div id="mapinfo" class="mapinfo"></div>`;
    body.querySelectorAll('[data-h]').forEach(b => b.onclick = () => { S.hole[g.game.id] = +b.dataset.h; destroyMap(); renderGameBody(); });
    body.querySelector('#m-auto').onclick = () => autoFlags(g.game.course_id).then(() => { destroyMap(); renderGameBody(); });
    body.querySelectorAll('[data-me]').forEach(b => b.onclick = () => { S.mapEdit = S.mapEdit === b.dataset.me ? null : b.dataset.me; renderGameBody(); });
    loadLeaflet().then(() => {
      destroyMap();
      const course = gameCourse(g); const gps = course.holes[h - 1].gps || {};
      const c = gps.center || gps.tee || (S.pos && C.distance(S.pos, course.center || S.pos) < 5000 ? S.pos : null) || course.center || { lat: 46.6, lng: 2.4 };
      map = L.map('map', { zoomControl: true, attributionControl: true }).setView([c.lat, c.lng], gps.center ? 17 : 16);
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 20, maxNativeZoom: 19, attribution: 'Esri, Maxar' }).addTo(map);
      layers = L.layerGroup().addTo(map);
      map.on('click', e => {
        const pt = { lat: e.latlng.lat, lng: e.latlng.lng };
        if (S.mapEdit) { setGreenPoint(g, h, S.mapEdit, pt); const order = ['tee', 'front', 'center', 'back']; const nx = order[order.indexOf(S.mapEdit) + 1]; S.mapEdit = nx || null; body.querySelectorAll('[data-me]').forEach(b => b.classList.toggle('on', b.dataset.me === S.mapEdit)); const hint = document.getElementById('maphint'); if (hint) hint.innerHTML = S.mapEdit ? 'Point suivant : <b>' + ({ front: 'avant du green', center: 'centre du green', back: 'arrière du green' })[S.mapEdit] + '</b>' : 'Points placés ✔ — touche la carte pour mesurer.'; }
        else { target = pt; drawMapLayers(); }
      });
      drawMapLayers();
      // fit trou si départ + green
      if (gps.tee && gps.center) map.fitBounds([[gps.tee.lat, gps.tee.lng], [gps.center.lat, gps.center.lng]], { padding: [40, 40] });
    }).catch(() => { body.querySelector('#map').innerHTML = '<p class="err">Carte indisponible hors connexion.</p>'; });
  }
  function drawMapLayers() {
    if (!map || !layers) return;
    const g = S.games[curGid]; const course = gameCourse(g); const h = S.hole[curGid]; const gps = course.holes[h - 1].gps || {};
    layers.clearLayers();
    const dot = (p, color, label, r) => L.circleMarker([p.lat, p.lng], { radius: r || 7, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 }).bindTooltip(label, { permanent: false }).addTo(layers);
    if (gps.tee) dot(gps.tee, '#2f6fd6', 'Départ');
    if (gps.front) dot(gps.front, '#9be37a', 'Avant', 5);
    if (gps.center) { dot(gps.center, '#e8272b', 'Centre green', 8); }
    if (gps.back) dot(gps.back, '#1b7a2b', 'Arrière', 5);
    const from = S.pos && gps.center && C.distance(S.pos, gps.center) < 1500 ? S.pos : gps.tee;
    if (S.pos) L.circleMarker([S.pos.lat, S.pos.lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#1a73e8', fillOpacity: 1 }).bindTooltip('Moi').addTo(layers);
    let info = '';
    if (target) {
      dot(target, '#ffd400', 'Cible', 7);
      const pts = []; if (from) pts.push([from.lat, from.lng]); pts.push([target.lat, target.lng]); if (gps.center) pts.push([gps.center.lat, gps.center.lng]);
      L.polyline(pts, { color: '#ffd400', weight: 3, dashArray: '6 6' }).addTo(layers);
      const d1 = from ? C.distance(from, target) : null, d2 = gps.center ? C.distance(target, gps.center) : null;
      const club = C.suggestClub(d1, S.me.bag);
      info = `${d1 != null ? `<span>${from === S.pos ? 'Moi' : 'Départ'} → cible <b>${d1} m</b>${club ? ' (' + esc(club.club) + ')' : ''}</span>` : ''}${d2 != null ? `<span>Cible → green <b>${d2} m</b></span>` : ''}`;
    } else if (from && gps.center) info = `<span>${from === S.pos ? 'Moi' : 'Départ'} → centre green <b>${C.distance(from, gps.center)} m</b></span>`;
    else if (!gps.center) info = '<span>Place le green avec les boutons ci-dessus.</span>';
    const el = document.getElementById('mapinfo'); if (el) el.innerHTML = info;
  }

  /* --- Classement --- */
  function renderBoard(body, g) {
    const course = gameCourse(g);
    const rows = C.leaderboard(g.players, g.game, course, scoresOf(g));
    let html = `<section class="card"><b>${FORMATS[g.game.format]}</b><small>${MODES[g.game.mode]} · repère ${esc(teeName(course, g.game.tee))} · ${frDate(g.game.play_date)}${g.game.status === 'done' ? ' · terminée' : ''}</small></section>`;
    if (g.game.format === 'match') {
      const ps = g.players; const duels = [];
      for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) duels.push(C.matchPlay(ps[i], ps[j], g.game, course, scoresOf(g)[ps[i].id] || {}, scoresOf(g)[ps[j].id] || {}));
      html += duels.length ? duels.map(m => `<div class="duel"><b>${esc(m.label)}</b><small>${m.strokes ? esc(m.receiver) + ' reçoit ' + m.strokes + ' coup' + (m.strokes > 1 ? 's' : '') : 'Pas de coups rendus'} · ${m.played} trou${m.played > 1 ? 's' : ''} joué${m.played > 1 ? 's' : ''}</small></div>`).join('') : '<p class="muted">Ajoute un 2e joueur pour le match play.</p>';
      html += '<h2>Scores</h2>';
    }
    html += `<table class="board"><thead><tr><th>#</th><th>Joueur</th><th>Trous</th><th>Brut</th><th>Net</th><th>Pts</th></tr></thead><tbody>${rows.map((r, i) => `<tr class="${g.players.find(p => p.id === r.playerId && p.device_id === S.me.deviceId) ? 'meRow' : ''}"><td>${i + 1}</td><td>${esc(r.name)}<small>HCP ${r.ph}</small></td><td>${r.played}/${r.holes}</td><td>${r.played ? r.gross + '<small>' + fmtPar(r.toPar) + '</small>' : '–'}</td><td>${r.played ? r.net + '<small>' + fmtPar(r.netToPar) + '</small>' : '–'}</td><td><b>${r.points}</b></td></tr>`).join('')}</tbody></table>
      ${(() => {
        const pay = C.payers(g.players, g.game, course, scoresOf(g), g.events);
        const lines = pay.last.map(x => `<li>🍻 <b>${esc(x.name)}</b> — ${g.game.status === 'done' ? 'dernier' : 'dernier pour l\'instant'}</li>`).concat(pay.rouges.map(r => `<li>🍺 <b>${esc(r.name)}</b> — pas passé les rouges (trou ${r.holes.join(', ')})</li>`));
        return `<h2>Tournées</h2>${lines.length ? `<ul class="paylist">${lines.join('')}</ul>` : '<p class="muted">Personne ne paie pour l\'instant.</p>'}<button class="btn ghost full" id="b-beer">🍺 Qui paie sa tournée ?</button>`;
      })()}
      ${(g.events || []).filter(e => e.type !== 'rouge').length ? `<h2>Moments forts</h2><ul class="feed">${(g.events || []).filter(e => e.type !== 'rouge').slice().reverse().map(e => { const s = shotOf(e.type); const p = g.players.find(x => x.id === e.player_id); return `<li><span>${s[1]}</span><div><b>${esc(e.type === 'autre' && e.label ? e.label : s[2])}</b> — ${esc(p ? p.name : '?')}<small>${e.hole ? 'Trou ' + e.hole + ' · ' : ''}par ${esc(e.by_name || '?')}</small></div></li>`; }).join('')}</ul>` : ''}
      <p class="hint">Balle ramassée (X) : 0 point en Stableford, comptée en double bogey net pour le brut/net.</p>
      <div class="row2"><button class="btn ghost" id="b-share">Partager le résultat</button>${g.game.status === 'done' ? '' : '<button class="btn" id="b-end">Terminer</button>'}</div>
      <button class="btn ghost full danger" id="b-del">🗑️ Supprimer la partie</button>`;
    body.innerHTML = html;
    body.querySelector('#b-share').onclick = () => {
      const lines = rows.map((r, i) => `${i + 1}. ${r.name} — ${g.game.format === 'stableford' ? r.points + ' pts · ' : ''}brut ${r.gross} (${fmtPar(r.toPar)}) · net ${r.net}`);
      shareText('⛳ ' + course.name + ' — ' + frDate(g.game.play_date) + '\n' + FORMATS[g.game.format] + '\n' + lines.join('\n'));
    };
    body.querySelector('#b-beer').onclick = () => celebrate(g.game.id);
    body.querySelector('#b-del').onclick = () => deleteGame(g);
    const e = body.querySelector('#b-end'); if (e) e.onclick = () => { if (confirm('Terminer la partie ?')) { updateGame(g.game.id, { status: 'done' }); renderGameBody(); celebrate(g.game.id); } };
  }

  /* --- Carte de score --- */
  function renderCard(body, g) {
    const course = gameCourse(g);
    const holes = C.holesFor(g.game.mode, course.holes.length);
    const sums = g.players.map(p => C.playerSummary(p, g.game, course, scoresOf(g)[p.id] || {}));
    const cell = (s, h) => { const ph = s.perHole[h]; if (!ph || ph.gross == null) return '<td></td>'; const d = ph.gross - ph.par; return `<td><span class="sc ${ph.pickup ? 'pick' : scoreCls(d)}">${ph.pickup ? 'X' : ph.raw}</span>${g.game.format === 'stableford' ? `<sub>${ph.points}</sub>` : ''}</td>`; };
    const sub = (s, hs) => { let gr = 0, pt = 0, n = 0; hs.forEach(h => { const ph = s.perHole[h]; if (ph && ph.gross != null) { gr += ph.gross; pt += ph.points || 0; n++; } }); return n ? `<td><b>${gr}</b>${g.game.format === 'stableford' ? `<sub>${pt}</sub>` : ''}</td>` : '<td></td>'; };
    const front = holes.filter(h => h <= 9), back = holes.filter(h => h > 9);
    const row = h => `<tr><td class="h">${h}</td><td>${course.holes[h - 1].par}</td><td class="si">${course.holes[h - 1].si}</td>${sums.map(s => cell(s, h)).join('')}</tr>`;
    const tot = (label, hs) => `<tr class="tot"><td>${label}</td><td>${hs.reduce((a, h) => a + course.holes[h - 1].par, 0)}</td><td></td>${sums.map(s => sub(s, hs)).join('')}</tr>`;
    body.innerHTML = `<div class="tablewrap"><table class="scard"><thead><tr><th>Trou</th><th>Par</th><th>HCP</th>${g.players.map(p => `<th>${esc(p.name.split(' ')[0])}</th>`).join('')}</tr></thead><tbody>
      ${front.map(row).join('')}${front.length && back.length ? tot('Aller', front) : ''}${back.map(row).join('')}${front.length && back.length ? tot('Retour', back) : ''}${tot('Total', holes)}
      <tr class="tot"><td colspan="3">Putts</td>${sums.map(s => `<td>${s.putts != null ? s.putts : ''}</td>`).join('')}</tr>
      </tbody></table></div>
      <div class="legend"><span class="sc eagle">3</span>Eagle <span class="sc birdie">3</span>Birdie <span class="sc par">4</span>Par <span class="sc bogey">5</span>Bogey <span class="sc dbl">6</span>Double+ <span class="sc pick">X</span>Ramassée</div>
      <button class="btn big full" id="c-share">📤 Partager la carte de score</button>`;
    body.querySelector('#c-share').onclick = () => shareCardImage(g);
  }

  /* --- Suppression d'une partie --- */
  function deleteGame(g) {
    const others = g.players.filter(p => p.device_id && p.device_id !== S.me.deviceId);
    const iCreated = !g.game.created_by || g.game.created_by === S.me.name;
    let everywhere = false;
    if (g.follow) { if (!confirm('Ne plus afficher cette partie ?')) return; }
    else if (!others.length || !remoteOn()) { if (!confirm('Supprimer définitivement cette partie ?')) return; everywhere = true; }
    else if (iCreated) {
      const r = prompt('Partie partagée avec ' + others.map(p => p.name).join(', ') + '.\nTape 1 pour la supprimer pour tout le monde, 2 pour la retirer juste de ton téléphone.', '2');
      if (r === '1') everywhere = true; else if (r !== '2') return;
    } else if (!confirm('Retirer cette partie de ton téléphone ? (elle reste chez les autres joueurs)')) return;
    delete S.games[g.game.id];
    S.hidden.add(g.game.id); LS.set('fw_hidden', [...S.hidden]);
    S.queue = S.queue.filter(o => !(o.row && (o.row.game_id === g.game.id || o.row.id === g.game.id))); saveQueue();
    if (everywhere) push({ t: 'delete', table: 'games', match: { id: g.game.id } });
    saveGames(); subscribeMe(); toast('Partie supprimée'); location.hash = '#/';
  }

  /* --- Carte de score en image (WhatsApp, etc.) --- */
  async function shareCardImage(g) {
    const course = gameCourse(g);
    const holes = C.holesFor(g.game.mode, course.holes.length);
    const sums = g.players.map(p => C.playerSummary(p, g.game, course, scoresOf(g)[p.id] || {}));
    const rows = C.leaderboard(g.players, g.game, course, scoresOf(g));
    const pay = C.payers(g.players, g.game, course, scoresOf(g), g.events);
    const stb = g.game.format === 'stableford';
    const front = holes.filter(h => h <= 9), back = holes.filter(h => h > 9);
    const seq = [...front.map(h => ({ h })), ...(front.length && back.length ? [{ t: 'Aller', hs: front }] : []), ...back.map(h => ({ h })), ...(front.length && back.length ? [{ t: 'Retour', hs: back }] : []), { t: 'Total', hs: holes }];
    const W = 1080, pad = 40, rowH = 50, colFix = [110, 80, 80], np = g.players.length;
    const pw = Math.min(220, (W - pad * 2 - colFix.reduce((a, b) => a + b, 0)) / Math.max(np, 1));
    const headH = 230, rankH = 70 + rows.length * 56, payH = (pay.last.length || pay.rouges.length) ? 60 + (pay.last.length ? 50 : 0) + pay.rouges.length * 44 : 0;
    const H = headH + rowH * (seq.length + 1) + 40 + rankH + payH + 90;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const x = cv.getContext('2d');
    const F = (w, sz) => `${w} ${sz}px system-ui,-apple-system,Segoe UI,Roboto,sans-serif`;
    x.fillStyle = '#f6f7f5'; x.fillRect(0, 0, W, H);
    // en-tête
    x.fillStyle = '#14532d'; x.fillRect(0, 0, W, headH);
    x.fillStyle = '#fff'; x.font = F(800, 50); x.fillText('⛳ ' + course.name, pad, 85);
    x.font = F(500, 30); x.fillStyle = '#cfe8d6';
    x.fillText(frDate(g.game.play_date) + ' · ' + FORMATS[g.game.format] + ' · ' + MODES[g.game.mode] + ' · repère ' + teeName(course, g.game.tee), pad, 140);
    x.fillText(g.players.map(p => p.name).join(' · '), pad, 190);
    // tableau
    let y = headH + 20;
    const colsX = [pad, pad + colFix[0], pad + colFix[0] + colFix[1]];
    const pX = i => pad + colFix[0] + colFix[1] + colFix[2] + i * pw;
    x.fillStyle = '#1b7a3d'; x.fillRect(pad, y, W - pad * 2, rowH);
    x.fillStyle = '#fff'; x.font = F(700, 24); x.textAlign = 'center';
    ['Trou', 'Par', 'HCP'].forEach((t, i) => x.fillText(t, colsX[i] + colFix[i] / 2, y + 33));
    g.players.forEach((p, i) => x.fillText(p.name.split(' ')[0].slice(0, 10), pX(i) + pw / 2, y + 33));
    y += rowH;
    const colors = { eagle: '#d9363e', birdie: '#d9363e', par: '#14201a', bogey: '#2563c9', dbl: '#6b21a8', pick: '#68756d' };
    seq.forEach((r, k) => {
      const tot = !!r.t;
      x.fillStyle = tot ? '#e7f4ec' : (k % 2 ? '#fff' : '#fbfcfb'); x.fillRect(pad, y, W - pad * 2, rowH);
      x.fillStyle = '#14201a'; x.font = F(tot ? 800 : 700, 26);
      if (tot) {
        x.fillText(r.t, colsX[0] + colFix[0] / 2, y + 34);
        x.fillText(String(r.hs.reduce((a, h) => a + course.holes[h - 1].par, 0)), colsX[1] + colFix[1] / 2, y + 34);
        sums.forEach((s, i) => { let gr = 0, pt = 0, n = 0; r.hs.forEach(h => { const ph = s.perHole[h]; if (ph && ph.gross != null) { gr += ph.gross; pt += ph.points || 0; n++; } }); if (n) { x.font = F(800, 26); x.fillText(stb ? gr + '  (' + pt + ' pts)' : String(gr), pX(i) + pw / 2, y + 34); } });
      } else {
        const ch = course.holes[r.h - 1];
        x.fillText(String(r.h), colsX[0] + colFix[0] / 2, y + 34);
        x.font = F(500, 26); x.fillText(String(ch.par), colsX[1] + colFix[1] / 2, y + 34);
        x.fillStyle = '#68756d'; x.font = F(500, 22); x.fillText(String(ch.si), colsX[2] + colFix[2] / 2, y + 33);
        sums.forEach((s, i) => {
          const ph = s.perHole[r.h]; if (!ph || ph.gross == null) return;
          const cx = pX(i) + pw / 2, cy = y + rowH / 2, d = ph.gross - ph.par, cls = ph.pickup ? 'pick' : scoreCls(d);
          x.strokeStyle = colors[cls]; x.lineWidth = 3;
          if (cls === 'birdie' || cls === 'eagle') { x.beginPath(); x.arc(cx, cy, 18, 0, 7); x.stroke(); if (cls === 'eagle') { x.beginPath(); x.arc(cx, cy, 13, 0, 7); x.stroke(); } }
          if (cls === 'bogey' || cls === 'dbl') { x.strokeRect(cx - 18, cy - 18, 36, 36); if (cls === 'dbl') x.strokeRect(cx - 13, cy - 13, 26, 26); }
          x.fillStyle = colors[cls]; x.font = F(800, 24); x.fillText(ph.pickup ? 'X' : String(ph.raw), cx, cy + 9);
          if (stb) { x.fillStyle = '#68756d'; x.font = F(600, 16); x.fillText(String(ph.points), cx + 34, cy + 16); }
        });
      }
      x.strokeStyle = '#dde3de'; x.lineWidth = 1; x.beginPath(); x.moveTo(pad, y + rowH); x.lineTo(W - pad, y + rowH); x.stroke();
      y += rowH;
    });
    // classement
    y += 40; x.textAlign = 'left';
    x.fillStyle = '#68756d'; x.font = F(800, 26); x.fillText('CLASSEMENT', pad, y); y += 24;
    rows.forEach((r, i) => {
      x.fillStyle = i === 0 ? '#fff7e0' : '#fff'; x.fillRect(pad, y, W - pad * 2, 48);
      x.fillStyle = '#14201a'; x.font = F(800, 28); x.fillText((i === 0 ? '🏆 ' : (i + 1) + '. ') + r.name, pad + 16, y + 34);
      x.textAlign = 'right'; x.font = F(700, 26);
      x.fillText((stb ? r.points + ' pts · ' : '') + 'brut ' + r.gross + ' (' + fmtPar(r.toPar) + ') · net ' + r.net, W - pad - 16, y + 34);
      x.textAlign = 'left'; y += 56;
    });
    // tournées
    if (payH) {
      y += 44; x.fillStyle = '#9a5b00'; x.font = F(800, 26); x.fillText('TOURNÉES 🍺', pad, y); y += 14;
      if (pay.last.length) { y += 40; x.fillStyle = '#14201a'; x.font = F(800, 30); x.fillText('🍻 Merci ' + pay.last.map(p => p.name).join(' et ') + ' !', pad, y); }
      pay.rouges.forEach(r => { y += 44; x.font = F(600, 26); x.fillText('🍺 ' + r.name + ' — pas passé les rouges (trou ' + r.holes.join(', ') + ')', pad, y); });
    }
    x.fillStyle = '#68756d'; x.font = F(600, 22); x.textAlign = 'center'; x.fillText('Fairway — golf entre potes', W / 2, H - 30);
    const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
    const name = 'carte-' + (course.name.split(' ').pop() || 'golf').toLowerCase() + '-' + g.game.play_date + '.png';
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], text: '⛳ ' + course.name + ' — ' + frDate(g.game.play_date) }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); toast('Image enregistrée');
  }

  /* --- Invitation --- */
  function showInvite(g) {
    const { link, text } = inviteText(g);
    const dlg = document.createElement('div'); dlg.className = 'modal';
    let qr = '';
    try { if (window.qrcode) { const q = window.qrcode(0, 'M'); q.addData(link); q.make(); qr = q.createSvgTag({ cellSize: 5, margin: 2, scalable: true }); } } catch (e) { }
    dlg.innerHTML = `<div class="sheet"><h2>Inviter à la partie</h2>
      ${!remoteOn() ? '<p class="err">Serveur non configuré : tes potes ne pourront pas rejoindre. Va dans Profil > Serveur.</p>' : ''}
      <div class="code">${esc(g.game.code)}</div>
      ${qr ? `<div class="qr">${qr}</div>` : ''}
      <div class="form"><div class="row2"><label>Date<input type="date" id="i-date" value="${esc(g.game.play_date || '')}"></label><label>Départ<input type="time" id="i-time" value="${esc(g.game.tee_time || '')}"></label></div></div>
      <button class="btn big full" id="i-share">Envoyer l'invitation</button>
      <button class="btn ghost full" id="i-copy">Copier le lien</button>
      <button class="btn ghost full" id="i-close">Fermer</button></div>`;
    document.body.appendChild(dlg);
    const sync = () => { const d = dlg.querySelector('#i-date').value, t = dlg.querySelector('#i-time').value; if (d !== g.game.play_date || (t || null) !== (g.game.tee_time || null)) updateGame(g.game.id, { play_date: d || today(), tee_time: t || null }); };
    dlg.querySelector('#i-share').onclick = () => { sync(); shareText(inviteText(S.games[g.game.id]).text, link); };
    dlg.querySelector('#i-copy').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(link).then(() => toast('Lien copié')); };
    dlg.querySelector('#i-close').onclick = () => { sync(); dlg.remove(); };
    dlg.onclick = e => { if (e.target === dlg) { sync(); dlg.remove(); } };
  }
  function shareText(text, url) {
    if (navigator.share) navigator.share({ text }).catch(() => { });
    else if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast('Copié, colle-le dans WhatsApp'));
    else prompt('Copie ce texte :', text);
  }
  function toast(m) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 2200); }

  /* --- Stats --- */
  function viewStats() {
    const rounds = myRoundStats().filter(r => r.s.played > 0);
    const full18 = rounds.filter(r => r.s.finished && r.s.holes === 18);
    const nine = rounds.filter(r => r.s.finished && r.s.holes === 9);
    const avg = a => a.length ? (a.reduce((x, y) => x + y, 0) / a.length) : null;
    const f1 = v => v == null ? '–' : (Math.round(v * 10) / 10).toString().replace('.', ',');
    const byPar = { 3: [], 4: [], 5: [] }; let pick = 0, birdies = 0, pars = 0, bogeys = 0, dbl = 0, holesN = 0;
    const puttsArr = [];
    rounds.forEach(r => Object.values(r.s.perHole).forEach(ph => {
      if (ph.gross == null) return; holesN++;
      if (byPar[ph.par]) byPar[ph.par].push(ph.gross - ph.par);
      if (ph.pickup) pick++; else { const d = ph.raw - ph.par; if (d <= -1) birdies++; else if (d === 0) pars++; else if (d === 1) bogeys++; else dbl++; }
      if (ph.putts != null) puttsArr.push(ph.putts);
    }));
    const pct = n => holesN ? Math.round(n * 100 / holesN) + '%' : '–';
    const last = full18.slice(0, 10).reverse();
    const max = Math.max(...last.map(r => r.s.gross), 1), min = Math.min(...last.map(r => r.s.gross), max);
    const spark = last.length > 1 ? `<svg viewBox="0 0 300 80" class="spark">${(() => { const pts = last.map((r, i) => [10 + i * (280 / (last.length - 1)), 70 - ((r.s.gross - min) / Math.max(1, max - min)) * 60]); return `<polyline fill="none" stroke="var(--g)" stroke-width="3" points="${pts.map(p => p.join(',')).join(' ')}"/>` + pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="var(--g)"/><text x="${p[0]}" y="${p[1] - 8}" text-anchor="middle" font-size="11">${last[i].s.gross}</text>`).join(''); })()}</svg>` : '';
    $app.innerHTML = topbar('Mes stats', '#/') + `<main>
      <div class="kpis"><div><b>${rounds.length}</b><small>parties</small></div><div><b>${f1(avg(full18.map(r => r.s.gross)))}</b><small>brut moy. 18 t.</small></div><div><b>${full18.length ? Math.min(...full18.map(r => r.s.gross)) : '–'}</b><small>meilleur 18 t.</small></div><div><b>${f1(avg(full18.map(r => r.s.points)))}</b><small>Stableford moy.</small></div><div><b>${f1(avg(nine.map(r => r.s.gross)))}</b><small>brut moy. 9 t.</small></div><div><b>${f1(avg(puttsArr))}</b><small>putts / trou</small></div></div>
      ${spark ? '<h2>Évolution (10 derniers 18 trous)</h2>' + spark : ''}
      <h2>Moyenne par type de trou</h2>
      <div class="kpis three">${[3, 4, 5].map(p => `<div><b>${byPar[p].length ? fmtPar(Math.round(avg(byPar[p]) * 100) / 100).replace('.', ',') : '–'}</b><small>par ${p}</small></div>`).join('')}</div>
      <h2>Répartition des trous</h2>
      <div class="bars">${[['Birdie et mieux', birdies, 'birdie'], ['Par', pars, 'par'], ['Bogey', bogeys, 'bogey'], ['Double et plus', dbl, 'dbl'], ['Ramassées', pick, 'pick']].map(([l, n, c]) => `<div class="bar"><span>${l}</span><i class="${c}" style="width:${holesN ? n * 100 / holesN : 0}%"></i><b>${pct(n)}</b></div>`).join('')}</div>
      <p class="hint">Ta stratégie bogey : tout ce qui est dans « Par » + « Bogey » est dans le plan.</p>
    </main>`;
    updateSyncBadge();
  }

  /* --- Parcours --- */
  function viewCourses() {
    const list = Object.values(allCourses());
    $app.innerHTML = topbar('Parcours', '#/') + `<main>
      ${list.map(c => { const placed = c.holes.filter(h => h.gps && h.gps.center).length; return `<a class="gcard" href="#/course/${encodeURIComponent(c.id)}"><div><b>${esc(c.name)}</b><small>${esc(c.city || '')} · ${c.holes.length} trous · par ${c.holes.reduce((s, h) => s + h.par, 0)}</small><small>Greens GPS : ${placed}/${c.holes.length}</small></div><div class="gscore">›</div></a>`; }).join('')}
      <button class="btn big full" id="c-new">＋ Nouveau parcours</button>
      <p class="hint">Les parcours (notes, difficultés, GPS des greens) sont partagés avec tous ceux qui utilisent ton serveur.</p></main>`;
    updateSyncBadge();
    $app.querySelector('#c-new').onclick = () => {
      const name = prompt('Nom du parcours :'); if (!name) return;
      const n = prompt('Nombre de trous (9 ou 18) :', '18') === '9' ? 9 : 18;
      const id = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Math.random().toString(36).slice(2, 6);
      const c = { id, name, city: '', tees: [{ id: 'jaune', name: 'Jaune', sss: null, slope: 113 }, { id: 'rouge', name: 'Rouge', sss: null, slope: 113 }], holes: Array.from({ length: n }, (_, i) => ({ n: i + 1, par: 4, si: i + 1, dist: {} })) };
      saveCourse(c); location.hash = '#/course/' + encodeURIComponent(id);
    };
  }
  function viewCourseEdit(idEnc) {
    const id = decodeURIComponent(idEnc);
    const base = getCourse(id); if (!base) { location.hash = '#/courses'; return; }
    const c = JSON.parse(JSON.stringify(base));
    const draw = () => {
      $app.innerHTML = topbar(c.name, '#/courses') + `<main class="form">
        <div class="row2"><label>Nom<input id="ce-name" value="${esc(c.name)}"></label><label>Ville<input id="ce-city" value="${esc(c.city || '')}"></label></div>
        <h2>Repères</h2>
        <table class="edit"><thead><tr><th>Repère</th><th>SSS</th><th>Slope</th><th></th></tr></thead><tbody>${c.tees.map((t, i) => `<tr><td><input data-t="${i}" data-f="name" value="${esc(t.name)}"></td><td><input data-t="${i}" data-f="sss" inputmode="decimal" value="${t.sss == null ? '' : t.sss}" placeholder="?"></td><td><input data-t="${i}" data-f="slope" inputmode="numeric" value="${t.slope || ''}"></td><td>${c.tees.length > 1 ? `<button class="x" data-tdel="${i}">✕</button>` : ''}</td></tr>`).join('')}</tbody></table>
        <button class="btn ghost sm" id="ce-tadd">＋ Repère</button>
        ${c.tees.some(t => t.sss == null) ? '<p class="hint">SSS manquant : le handicap de jeu prend le par à la place. Le SSS est sur la carte de score du club.</p>' : ''}
        <h2>Trous</h2>
        <div class="tablewrap"><table class="edit"><thead><tr><th>#</th><th>Par</th><th>HCP</th>${c.tees.map(t => `<th>${esc(t.name)} m</th>`).join('')}<th>Diff.</th></tr></thead><tbody>${c.holes.map((h, i) => `<tr><td>${h.n}</td><td><input data-h="${i}" data-f="par" inputmode="numeric" value="${h.par}"></td><td><input data-h="${i}" data-f="si" inputmode="numeric" value="${h.si}"></td>${c.tees.map(t => `<td><input data-h="${i}" data-d="${esc(t.id)}" inputmode="numeric" value="${(h.dist || {})[t.id] || ''}"></td>`).join('')}<td><input data-h="${i}" data-f="difficulty" inputmode="numeric" value="${h.difficulty || ''}" placeholder="1-5"></td></tr><tr class="noterow"><td></td><td colspan="${3 + c.tees.length}"><input data-h="${i}" data-f="note" placeholder="Note / pièges du trou ${h.n}${h.gps && h.gps.center ? ' · 📍 green placé' : ''}" value="${esc(h.note || '')}"></td></tr>`).join('')}</tbody></table></div>
        <button class="btn ghost full" id="ce-auto">🛰️ Trouver les drapeaux automatiquement (OpenStreetMap)</button>
        <button class="btn big full" id="ce-save">Enregistrer</button>
        <button class="btn ghost full" id="ce-dup">Dupliquer ce parcours</button>
      </main>`;
      updateSyncBadge();
      $app.querySelector('#ce-name').oninput = e => (c.name = e.target.value);
      $app.querySelector('#ce-city').oninput = e => (c.city = e.target.value);
      $app.querySelectorAll('[data-t]').forEach(inp => inp.oninput = e => { const t = c.tees[+e.target.dataset.t]; const f = e.target.dataset.f; t[f] = f === 'name' ? e.target.value : (e.target.value === '' ? null : Number(e.target.value.replace(',', '.'))); });
      $app.querySelectorAll('[data-tdel]').forEach(b => b.onclick = () => { c.tees.splice(+b.dataset.tdel, 1); draw(); });
      $app.querySelector('#ce-tadd').onclick = () => { const n = prompt('Nom du repère (ex. Blanc) :'); if (!n) return; c.tees.push({ id: n.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.random().toString(36).slice(2, 4), name: n, sss: null, slope: 113 }); draw(); };
      $app.querySelectorAll('[data-h]').forEach(inp => inp.oninput = e => {
        const h = c.holes[+e.target.dataset.h];
        if (e.target.dataset.d) { h.dist = h.dist || {}; h.dist[e.target.dataset.d] = e.target.value ? Number(e.target.value) : undefined; return; }
        const f = e.target.dataset.f;
        if (f === 'note') h.note = e.target.value;
        else { const v = parseInt(e.target.value, 10); h[f] = isNaN(v) ? (f === 'difficulty' ? null : h[f]) : v; }
      });
      $app.querySelector('#ce-save').onclick = () => {
        const sis = c.holes.map(h => h.si).sort((a, b) => a - b).join();
        const expect = c.holes.map((_, i) => i + 1).join();
        if (sis !== expect && !confirm('Les HCP (SI) ne vont pas de 1 à ' + c.holes.length + ' sans doublon. Enregistrer quand même ?')) return;
        saveCourse(c); toast('Parcours enregistré'); location.hash = '#/courses';
      };
      $app.querySelector('#ce-auto').onclick = () => { saveCourse(c); autoFlags(c.id).then(() => viewCourseEdit(encodeURIComponent(c.id))); };
      $app.querySelector('#ce-dup').onclick = () => { const copy = JSON.parse(JSON.stringify(c)); copy.id = c.id + '-' + Math.random().toString(36).slice(2, 5); copy.name = c.name + ' (copie)'; saveCourse(copy); location.hash = '#/course/' + encodeURIComponent(copy.id); };
    };
    draw();
  }

  /* --- Bienvenue (1re installation) --- */
  function viewWelcome() {
    $app.innerHTML = `<main class="welcome"><div class="wlogo">⛳</div><h1>Fairway</h1><div class="beta w">En beta et pour les copains</div><p>Le golf entre potes : scores, Stableford, GPS…<br>et le dernier paie sa tournée 🍺</p>
      <div class="form"><label>Ton prénom / surnom<input id="w-name" autocomplete="nickname"></label>
      <div class="row2"><label>Index<input id="w-idx" inputmode="decimal" placeholder="ex. 19.5"></label><label>Repère habituel<select id="w-tee">${['blanc', 'jaune', 'bleu', 'rouge'].map(t => `<option ${t === 'jaune' ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
      <button class="btn big full" id="w-go">C'est parti</button>
      <button class="btn ghost full" id="w-restore">J'ai déjà un profil</button></div>
      ${!remoteOn() ? '<p class="hint">Serveur non configuré : profil gardé sur ce téléphone seulement.</p>' : ''}</main>`;
    $app.querySelector('#w-go').onclick = () => {
      const n = $app.querySelector('#w-name').value.trim(); if (!n) return alert('Ton prénom ?');
      S.me.name = n; S.me.index = $app.querySelector('#w-idx').value.replace(',', '.'); S.me.tee = $app.querySelector('#w-tee').value;
      syncProfile(); route();
    };
    $app.querySelector('#w-restore').onclick = async () => { const c = prompt('Code de ton profil (Profil > Mon code) :'); if (!c) return; try { await restoreProfile(c); toast('Re-bonjour ' + S.me.name + ' 👋'); route(); } catch (e) { alert(e.message); } };
  }

  /* --- Profil & serveur --- */
  function viewProfile() {
    const tees = ['blanc', 'jaune', 'bleu', 'rouge'];
    $app.innerHTML = topbar('Profil', '#/') + `<main class="form">
      <div class="row2"><label>Nom<input id="p-name" value="${esc(S.me.name)}"></label><label>Index<input id="p-idx" inputmode="decimal" value="${esc(S.me.index)}"></label></div>
      <label class="switch"><input type="checkbox" id="p-follow" ${S.me.follow ? 'checked' : ''}><span>🔭 Suivre mes potes<small>Pop-ups et tournée des parties de mes partenaires, même sans être invité</small></span></label>
      <label>Repère habituel<select id="p-tee">${tees.map(t => `<option ${t === S.me.tee ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <h2>Mes distances (carry, m)</h2>
      <div class="bag">${S.me.bag.map((b, i) => `<label>${esc(b.club)}<input data-b="${i}" inputmode="numeric" value="${b.dist || ''}"></label>`).join('')}</div>
      <p class="hint">Servent à proposer le club selon la distance au green.</p>
      <button class="btn big full" id="p-save">Enregistrer</button>
      <h2>Serveur (parties partagées)</h2>
      <label>URL Supabase<input id="p-url" placeholder="https://xxxx.supabase.co" value="${esc(S.cfg.supabaseUrl || '')}"></label>
      <label>Clé anon public<input id="p-key" placeholder="eyJ..." value="${esc(S.cfg.supabaseAnonKey || '')}"></label>
      <div class="row2"><button class="btn ghost" id="p-test">Tester</button><button class="btn" id="p-srv">Enregistrer serveur</button></div>
      <p id="p-res" class="hint">${remoteOn() ? 'Serveur configuré.' : 'Sans serveur, l\'appli marche en local sur ce téléphone (pas d\'invitations).'}</p>
      <h2>Sauvegarde</h2>
      <p class="hint" id="p-bk">${backupLabel()}</p>
      <p class="hint">Tout est sauvegardé tout seul sur le serveur (profil, partenaires, parcours, parties) quelques secondes après chaque changement. Pour tout récupérer sur un autre téléphone : ton code ci-dessous.</p>
      <div class="row2"><button class="btn ghost" id="p-bknow">Sauvegarder maintenant</button><button class="btn ghost" id="p-bkrest">Restaurer</button></div>
      <h2>Mon code profil</h2>
      <div class="code small">${esc(S.me.code)}</div>
      <p class="hint">Note-le : si tu changes de téléphone ou réinstalles l'appli, ce code récupère ton profil, tes partenaires et tes parties.</p>
      <button class="btn ghost full" id="p-restore">J'ai déjà un profil (saisir un code)</button>
      <h2>Fichier de secours</h2>
      <div class="row2"><button class="btn ghost" id="p-exp">Exporter mes données</button><label class="btn ghost filebtn">Importer<input type="file" id="p-imp" accept="application/json" hidden></label></div>
    </main>`;
    updateSyncBadge();
    $app.querySelector('#p-follow').onchange = e => { S.me.follow = e.target.checked; syncProfile(); pullFollowGames(); toast(S.me.follow ? 'Tu suis tes potes 🔭' : 'Suivi des potes coupé'); };
    $app.querySelector('#p-bknow').onclick = async () => { await doBackup(); toast(S.lastBackup ? 'Sauvegardé ☁️' : 'Sauvegarde impossible (connexion ?)'); };
    $app.querySelector('#p-bkrest').onclick = async () => { if (!sb) return alert('Serveur non configuré.'); const ok = await restoreBackup(S.me.deviceId).catch(() => false); toast(ok ? 'Données restaurées 👍' : 'Aucune sauvegarde trouvée'); viewProfile(); };
    $app.querySelector('#p-restore').onclick = async () => { const c = prompt('Code de ton profil :'); if (!c) return; try { await restoreProfile(c); toast('Profil récupéré 👍'); viewProfile(); } catch (e) { alert(e.message); } };
    $app.querySelector('#p-save').onclick = () => {
      S.me.name = $app.querySelector('#p-name').value.trim(); S.me.index = $app.querySelector('#p-idx').value.replace(',', '.'); S.me.tee = $app.querySelector('#p-tee').value;
      $app.querySelectorAll('[data-b]').forEach(inp => { S.me.bag[+inp.dataset.b].dist = Number(inp.value) || 0; });
      syncProfile(); toast('Profil enregistré');
    };
    const read = () => ({ supabaseUrl: $app.querySelector('#p-url').value.trim().replace(/\/$/, ''), supabaseAnonKey: $app.querySelector('#p-key').value.trim() });
    $app.querySelector('#p-test').onclick = async () => {
      const res = $app.querySelector('#p-res');
      if (!window.supabase) { res.textContent = 'Bibliothèque Supabase non chargée (connexion ?).'; return; }
      try { const cl = window.supabase.createClient(read().supabaseUrl, read().supabaseAnonKey, { auth: { persistSession: false } }); const { error } = await cl.from('games').select('id').limit(1); res.textContent = error ? '❌ ' + error.message : '✅ Connexion OK, tables trouvées.'; }
      catch (e) { res.textContent = '❌ ' + e.message; }
    };
    $app.querySelector('#p-srv').onclick = () => { S.cfg = read(); LS.set('fw_cfg', S.cfg); initRemote(); pullCourses(); if (S.me.name) syncProfile(); pullMyGames(); toast('Serveur enregistré'); viewProfile(); };
    $app.querySelector('#p-exp').onclick = () => {
      const blob = new Blob([JSON.stringify({ me: S.me, courses: S.customCourses, games: S.games }, null, 1)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'fairway-sauvegarde-' + today() + '.json'; a.click();
    };
    $app.querySelector('#p-imp').onchange = e => {
      const f = e.target.files[0]; if (!f) return; const r = new FileReader();
      r.onload = () => { try { const d = JSON.parse(r.result); if (d.courses) Object.assign(S.customCourses, d.courses); if (d.games) Object.assign(S.games, d.games); if (d.me) S.me = { ...d.me, deviceId: d.me.deviceId || S.me.deviceId }; saveCourses(); saveGames(); saveMe(); toast('Données importées'); viewProfile(); } catch (err) { alert('Fichier invalide'); } };
      r.readAsText(f);
    };
  }

  /* ---------- Démarrage ---------- */
  initRemote();
  if (remoteOn()) {
    pullCourses().then(() => { if (/^#\/(courses|course|game)/.test(location.hash)) route(); });
    flush();
    if (S.me.name) syncProfile();
    pullMyGames().then(pullFollowGames).then(scheduleBackup);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { pullMyGames().then(pullFollowGames); flush(); } });
  }
  route();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { });
  window.__fairway = S; // debug
})();
