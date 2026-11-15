/* Fly18 (ex-Fairway) — golf entre potes : scores, calculs, GPS, parcours, parties partagées */
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
  const FORMATS = { stableford: 'Stableford', net: 'Stroke play net', brut: 'Stroke play brut', match: 'Match play', scramble: 'Scramble', combo: 'Scramble 9 + Match play 9' };
  const MODES = { '18': '18 trous', front: 'Aller (1-9)', back: 'Retour (10-18)' };
  // [id, emoji, libellé, groupe]
  const SHOTS = [['birdie', '🐦', 'Birdie', 's'], ['eagle', '🦅', 'Eagle', 's'], ['hio', '💥', 'Trou en 1', 's'], ['par', '💪', 'Par arraché', 's'],
    ['drive', '🚀', 'Gros drive', 'c'], ['approche', '🎯', 'Belle approche', 'c'], ['chip', '🪄', 'Chip-in', 'c'], ['putt', '⛳', 'Putt de fou', 'c'], ['bunker', '🏖️', 'Sortie de bunker', 'c'], ['sauvetage', '🦸', 'Sauvetage', 'c'],
    ['autre', '👏', 'Autre…', 'a']];
  const shotOf = t => SHOTS.find(s => s[0] === t) || ['autre', '👏', 'Nice shot'];

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
  // sac : liste standard Driver → LW, on garde les distances déjà saisies
  (function () {
    const std = window.STD_CLUBS || [], cur = Array.isArray(S.me.bag) ? S.me.bag : [];
    const get = n => (cur.find(x => x.club === n) || {}).dist || 0;
    S.me.bag = std.map(n => ({ club: n, dist: get(n) })).concat(cur.filter(x => !std.includes(x.club) && x.dist > 0));
  })();
  if (!S.me.partners) S.me.partners = [];
  if (S.me.follow == null) S.me.follow = true;
  if (S.me.visible == null) S.me.visible = true;
  if (S.me.xcap == null) S.me.xcap = 4;
  if (!S.me.theme) S.me.theme = 'auto';
  if (S.me.detect == null) S.me.detect = true;
  function applyBig() { if (S.me.big) document.documentElement.dataset.big = '1'; else delete document.documentElement.dataset.big; }
  applyBig();
  const darkMQ = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  if (!S.me.color) S.me.color = 'vert';
  if (!S.me.logo || !S.me.logoV2) { S.me.logo = 'pro_balle'; S.me.logoV2 = 1; }
  if (!S.me.logoV4) { S.me.logo = 'fly18'; S.me.logoV3 = 1; S.me.logoV4 = 1; }
  if (window.FW_LOGOS && !window.FW_LOGOS[S.me.logo]) S.me.logo = 'fly18';
  if (window.FW_PALETTES && !window.FW_PALETTES[S.me.color]) S.me.color = 'vert';
  const logoURL = () => window.fwLogoURL ? window.fwLogoURL(S.me.logo, S.me.color) : 'icon.svg';
  function applyTheme() {
    const dark = S.me.theme === 'dark' || (S.me.theme === 'auto' && darkMQ && darkMQ.matches);
    if (dark) document.documentElement.dataset.theme = 'dark'; else delete document.documentElement.dataset.theme;
    const p = (window.FW_PALETTES || {})[S.me.color] || (window.FW_PALETTES || {}).vert;
    const st = document.documentElement.style;
    if (p) { st.setProperty('--g', dark ? p.dg : p.g); st.setProperty('--gd', dark ? p.dgd : p.gd); st.setProperty('--gl', dark ? p.dgl : p.gl); st.setProperty('--acc', p.acc); }
    const m = document.querySelector('meta[name=theme-color]'); if (m) m.setAttribute('content', p ? (dark ? p.dgd : p.gd) : '#14532d');
    document.querySelectorAll('img.logo, img.wlogo').forEach(i => (i.src = logoURL()));
  }
  applyTheme();
  if (darkMQ && darkMQ.addEventListener) darkMQ.addEventListener('change', () => { if (S.me.theme === 'auto') applyTheme(); });
  S.onlineMap = {};
  S.hidden = new Set(LS.get('fw_hidden', []));
  S.copains = LS.get('fw_copains', []);
  LS.set('fw_me', S.me);
  S.seen = new Set(LS.get('fw_seen', []));
  const markSeen = id => { if (!id || S.seen.has(id)) return; S.seen.add(id); LS.set('fw_seen', [...S.seen].slice(-3000)); };
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
      S.games[id] = { ...g, mine: local ? local.mine : true, follow: local ? !!local.follow : false, watch: local ? !!local.watch : false }; saveGames();
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
    if (e.type === 'react') { if (!S.seen.has(e.id)) { markSeen(e.id); if (Date.now() - new Date(e.created_at || 0).getTime() < 120000) floatReaction(e); } return; }
    if (!S.seen.has(e.id)) eventPopup(g, e);
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

  /* ---------- Qui est en ligne (point vert) ---------- */
  let presCh = null, presReady = false;
  const led = devId => devId && devId !== S.me.deviceId && S.onlineMap[devId] ? '<i class="led" title="En ligne"></i>' : '';
  function presenceMeta() {
    const m = location.hash.match(/^#\/game\/([^/]+)/);
    const g = m && S.games[m[1]];
    const playing = g && !g.follow && g.game.status !== 'done';
    return { device_id: S.me.deviceId, name: S.me.name, course: playing ? shortCourse(g.game.course.name) : null, gid: playing ? g.game.id : null, watching: g && g.follow ? shortCourse(g.game.course.name) : null, ts: Date.now() };
  }
  const shortCourse = n => (n || '').replace(/^UGOLF\s+/i, '').replace(/^Golf\s+(de\s+|du\s+)?/i, '');
  function startPresence() {
    if (!remoteOn() || presCh || !S.me.name) return;
    presCh = sb.channel('fairway-online', { config: { presence: { key: S.me.deviceId } } });
    presCh.on('presence', { event: 'sync' }, () => {
      const st = presCh.presenceState(); const map = {};
      Object.values(st).forEach(arr => arr.forEach(m => { if (m.device_id && (!map[m.device_id] || m.ts > map[m.device_id].ts)) map[m.device_id] = m; }));
      S.onlineMap = map; refreshOnlineUI();
    }).subscribe(status => { if (status === 'SUBSCRIBED') { presReady = true; trackPresence(); } });
  }
  function trackPresence() {
    if (!presCh || !presReady) return;
    if (S.me.visible) presCh.track(presenceMeta()).catch(() => { }); else presCh.untrack().catch(() => { });
  }
  function refreshOnlineUI() {
    const box = document.getElementById('online');
    if (box) {
      const others = Object.values(S.onlineMap).filter(m => m.device_id !== S.me.deviceId).sort((a, b) => (b.course ? 1 : 0) - (a.course ? 1 : 0) || (a.name || '').localeCompare(b.name || ''));
      box.innerHTML = others.length ? `<h2>En ligne <span class="cnt">${others.length}</span></h2><div class="onl">${others.map(m => `<span class="onchip"><i class="led"></i>${esc(m.name || '?')}${m.course ? `<small>⛳ ${esc(m.course)}</small>` : m.watching ? `<small>👀 ${esc(m.watching)}</small>` : ''}</span>`).join('')}</div>` : '';
    }
    document.querySelectorAll('[data-dev]').forEach(el => { const on = !!(S.onlineMap[el.dataset.dev] && el.dataset.dev !== S.me.deviceId); el.classList.toggle('isonline', on); });
  }

  /* ---------- Copains inscrits (pour ajouter des joueurs, même hors ligne) ---------- */
  async function pullCopains() {
    if (!remoteOn()) return S.copains;
    try {
      const { data } = await sb.from('profiles').select('device_id, name, idx').order('name');
      if (data) { S.copains = data.filter(p => p.name && p.device_id !== S.me.deviceId).map(p => ({ device_id: p.device_id, name: p.name, idx: p.idx })); LS.set('fw_copains', S.copains); }
    } catch (e) { }
    return S.copains;
  }
  // partenaires (joués ensemble) d'abord, puis tous les inscrits ; dédoublonné par téléphone
  function copainList() {
    const out = [], seen = new Set();
    S.me.partners.slice().sort((a, b) => (b.games || []).length - (a.games || []).length).forEach(m => { const k = m.device_id || m.key; if (seen.has(k)) return; seen.add(k); out.push({ key: m.key, device_id: m.device_id || null, name: m.name, idx: m.idx, partner: true }); });
    S.copains.forEach(c => { if (seen.has(c.device_id)) return; seen.add(c.device_id); out.push({ key: 'd:' + c.device_id, device_id: c.device_id, name: c.name, idx: c.idx, partner: false }); });
    return out;
  }
  const chipHtml = (m, on, attr) => `<button ${attr}="${esc(m.key)}" ${m.device_id ? `data-dev="${esc(m.device_id)}"` : ''} class="${on ? 'on' : ''} ${S.onlineMap[m.device_id] ? 'isonline' : ''}"><i class="led sm"></i>${esc(m.name)}${m.device_id ? ' 📱' : ''}</button>`;

  /* ---------- Météo (Open-Meteo, sans clé) ---------- */
  const WX_ICONS = {
    sun: '<circle cx="32" cy="32" r="11" fill="#FFC531"/><g stroke="#FFC531" stroke-width="4" stroke-linecap="round"><path d="M32 8v6M32 50v6M8 32h6M50 32h6M15 15l4 4M45 45l4 4M15 49l4-4M45 19l4-4"/></g>',
    moon: '<path d="M40 12a20 20 0 1 0 12 30A16 16 0 0 1 40 12z" fill="#ffd970"/>',
    cloud: '<path d="M20 48h26a10 10 0 0 0 0-20 14 14 0 0 0-27-3 11 11 0 0 0 1 23z" fill="#cfd8e3"/>',
    part: '<circle cx="24" cy="22" r="9" fill="#FFC531"/><g stroke="#FFC531" stroke-width="3.5" stroke-linecap="round"><path d="M24 5v4M7 22h4M12 10l3 3M36 10l-3 3"/></g><path d="M22 52h24a9 9 0 0 0 0-18 13 13 0 0 0-25-2 10 10 0 0 0 1 20z" fill="#e4eaf1" stroke="#c4cfdb" stroke-width="1.5"/>',
    rain: '<path d="M18 38h28a10 10 0 0 0 0-20 14 14 0 0 0-27-3 11 11 0 0 0-1 23z" fill="#9fb0c3"/><g stroke="#3d8bfd" stroke-width="3.5" stroke-linecap="round"><path d="M22 44l-3 8M33 44l-3 8M44 44l-3 8"/></g>',
    snow: '<path d="M18 38h28a10 10 0 0 0 0-20 14 14 0 0 0-27-3 11 11 0 0 0-1 23z" fill="#c3cfdb"/><g fill="#8fc3ff"><circle cx="22" cy="48" r="3"/><circle cx="32" cy="54" r="3"/><circle cx="42" cy="48" r="3"/></g>',
    storm: '<path d="M18 36h28a10 10 0 0 0 0-20 14 14 0 0 0-27-3 11 11 0 0 0-1 23z" fill="#7d8b9c"/><path d="M34 36l-8 12h7l-4 10 12-15h-7l4-7z" fill="#FFC531"/>',
    fog: '<path d="M20 34h26a10 10 0 0 0 0-20 14 14 0 0 0-27-3 11 11 0 0 0 1 23z" fill="#cfd8e3"/><g stroke="#aab6c3" stroke-width="3.5" stroke-linecap="round"><path d="M12 42h40M18 50h32"/></g>'
  };
  function wxKind(code, day) {
    if (code === 0 || code === 1) return [day ? 'sun' : 'moon', code ? 'Plutôt beau' : (day ? 'Grand soleil' : 'Ciel dégagé')];
    if (code === 2) return ['part', 'Éclaircies'];
    if (code === 3) return ['cloud', 'Couvert'];
    if (code === 45 || code === 48) return ['fog', 'Brouillard'];
    if ([71, 73, 75, 77, 85, 86].includes(code)) return ['snow', 'Neige'];
    if (code >= 95) return ['storm', 'Orage'];
    if ([51, 53, 55, 56, 57].includes(code)) return ['rain', 'Bruine'];
    return ['rain', 'Pluie'];
  }
  const wxIcon = (code, day, cls) => `<svg class="${cls || ''}" viewBox="0 0 64 64">${WX_ICONS[wxKind(code, day)[0]]}</svg>`;
  function wxNext(w) {
    if (!w.rainAt) return w.q ? '<div class="wx-alert ok">☀️ Pas de pluie prévue dans les 2 prochaines heures</div>' : '';
    const mins = Math.round((w.rainAt - Date.now()) / 60000);
    const txt = mins <= 10 ? 'Pluie en cours ou imminente' : 'Pluie prévue vers ' + new Date(w.rainAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + ' (dans ~' + (mins >= 60 ? Math.floor(mins / 60) + ' h ' + String(mins % 60).padStart(2, '0') : mins + ' min') + ')';
    return `<div class="wx-alert">🌧️ ${txt}</div>`;
  }
  function wxHtml(w, open) {
    const [, label] = wxKind(w.code, w.day);
    const head = `<div class="wx-row"><div class="wx-ic">${wxIcon(w.code, w.day)}</div><div class="wx-main"><b>${Math.round(w.t)}°</b><span>${label}</span></div><div class="wx-side"><small>↑ ${Math.round(w.max)}° ↓ ${Math.round(w.min)}°</small><small>💨 ${Math.round(w.wind)} km/h</small><small>💧 ${w.rain}%</small></div></div>`;
    if (!open) return head + '<div class="wx-hint">Touche pour voir les prochaines heures</div>';
    const hrs = (w.hours || []).map(h => `<div class="wx-h"><small>${h.h}h</small>${wxIcon(h.code, h.day, 'mini')}<b>${Math.round(h.t)}°</b><small class="${h.p >= 50 ? 'wet' : ''}">${h.p}%</small></div>`).join('');
    return head + wxNext(w) + (hrs ? `<div class="wx-hours">${hrs}</div>` : '') + `<div class="wx-hint">Mis à jour à ${new Date(w.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · touche pour replier</div>`;
  }
  let wxOpen = false, wxBusy = false;
  function loadWeather(force) {
    const el = document.getElementById('wx'); if (!el) return;
    const show = w => { const e = document.getElementById('wx'); if (e && w) { e.innerHTML = wxHtml(w, wxOpen); e.hidden = false; e.classList.toggle('busy', wxBusy); } };
    if (!el.onclick) el.onclick = () => { if (wxBusy) return; if (wxOpen) { wxOpen = false; const w = LS.get('fw_wx', null); if (w) el.innerHTML = wxHtml(w, false); return; } wxOpen = true; loadWeather(true); };
    const cached = LS.get('fw_wx', null);
    if (cached) show(cached);
    if (!force && cached && Date.now() - cached.at < 30 * 60000) return;
    if (!navigator.geolocation || !navigator.onLine) { if (force) toast('Pas de connexion'); return; }
    wxBusy = true; el.classList.add('busy');
    const done = () => { wxBusy = false; const e = document.getElementById('wx'); if (e) e.classList.remove('busy'); };
    navigator.geolocation.getCurrentPosition(p => {
      const lat = p.coords.latitude.toFixed(3), lng = p.coords.longitude.toFixed(3);
      LS.set('fw_lastpos', { lat: p.coords.latitude, lng: p.coords.longitude });
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code,wind_speed_10m,is_day&minutely_15=precipitation&hourly=temperature_2m,weather_code,precipitation_probability,is_day&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=2&forecast_minutely_15=8`, { cache: 'no-store' })
        .then(r => r.json()).then(d => {
          if (!d.current) return;
          const off = (d.utc_offset_seconds || 0) * 1000;
          const toMs = t => Date.parse(t + 'Z') - off; // heure locale du lieu → instant
          const now = Date.now();
          let rainAt = null;
          if (d.minutely_15) d.minutely_15.time.forEach((t, i) => { const ms = toMs(t); if (!rainAt && ms + 15 * 60000 >= now && (d.minutely_15.precipitation[i] || 0) >= 0.1) rainAt = Math.max(ms, now); });
          const hours = [];
          if (d.hourly) d.hourly.time.forEach((t, i) => { const ms = toMs(t); if (ms > now - 30 * 60000 && hours.length < 6) hours.push({ h: t.slice(11, 13).replace(/^0/, ''), t: d.hourly.temperature_2m[i], code: d.hourly.weather_code[i], day: !!d.hourly.is_day[i], p: d.hourly.precipitation_probability[i] ?? 0 }); });
          const w = { at: now, q: true, t: d.current.temperature_2m, code: d.current.weather_code, day: !!d.current.is_day, wind: d.current.wind_speed_10m, max: d.daily.temperature_2m_max[0], min: d.daily.temperature_2m_min[0], rain: d.daily.precipitation_probability_max[0] ?? 0, rainAt, hours };
          LS.set('fw_wx', w); done(); show(w);
        }).catch(() => { done(); if (force) toast('Météo indisponible'); });
    }, () => { done(); if (force) toast('Localisation refusée'); }, { enableHighAccuracy: false, maximumAge: force ? 60000 : 600000, timeout: 15000 });
  }

  /* ---------- Détection d'arrivée au golf (appli ouverte) ---------- */
  let detectTimer = null;
  function checkArrival() {
    if (!S.me.detect || !S.me.name || !navigator.geolocation || document.visibilityState !== 'visible') return;
    if (/^#\/game\//.test(location.hash)) return; // déjà en partie
    navigator.geolocation.getCurrentPosition(p => {
      const pos = { lat: p.coords.latitude, lng: p.coords.longitude };
      let best = null;
      Object.values(allCourses()).forEach(c => { if (!c.center) return; const d = C.distance(pos, c.center); if (d <= 2000 && (!best || d < best.d)) best = { c, d }; });
      if (!best) return;
      const key = 'fw_welcome_' + best.c.id; const day = today();
      if (LS.get(key, '') === day) return;
      LS.set(key, day);
      welcomePopup(best.c, best.d);
    }, () => { }, { enableHighAccuracy: false, maximumAge: 120000, timeout: 15000 });
  }
  function startDetect() { clearInterval(detectTimer); if (!S.me.detect) return; setTimeout(checkArrival, 2500); }
  async function welcomePopup(course, dist) {
    const here = shortCourse(course.name);
    const potes = Object.values(S.onlineMap).filter(m => m.device_id !== S.me.deviceId && m.course && here && m.course === here);
    const el = document.createElement('div'); el.className = 'modal';
    const conf = Array.from({ length: 28 }, (_, i) => `<i style="left:${Math.random() * 100}%;animation-delay:${Math.random() * .5}s;background:${['#22a052', '#ffd400', '#fff', '#e8272b'][i % 4]}"></i>`).join('');
    el.innerHTML = `<div class="sheet welcome-golf"><div class="conf">${conf}</div><img class="wlogo" src="${logoURL()}" alt=""><h2>Bienvenue au golf !</h2><div class="wg-name">${esc(course.name)}</div>
      <p>Bonne partie ${esc(S.me.name)} ⛳<br><small>Et que le dernier paie sa tournée 🍺</small></p>
      <div id="wg-live"></div>
      ${potes.length ? `<p class="wg-potes">${potes.map(m => '<i class="led"></i>' + esc(m.name)).join(' · ')} ${potes.length > 1 ? 'sont' : 'est'} aussi sur le parcours</p>` : ''}
      <a class="btn big full" href="#/new/${encodeURIComponent(course.id)}" id="wg-new">⛳ Nouvelle partie ici</a>
      <button class="btn ghost full" id="wg-x">Plus tard</button></div>`;
    document.body.appendChild(el); vibrate([40, 60, 40]);
    const close = () => el.remove();
    el.querySelector('#wg-new').onclick = close; el.querySelector('#wg-x').onclick = close;
    el.onclick = e => { if (e.target === el) close(); };
    const live = (await fetchLive()).filter(g => g.game.course_id === course.id && g.game.status !== 'done');
    const box = el.querySelector('#wg-live');
    if (box && live.length) box.innerHTML = `<a class="btn ghost full" href="#/live" id="wg-lv">${FW_IC('live')} ${live.length} partie${live.length > 1 ? 's' : ''} en cours ici : rejoindre ou suivre</a>`, box.querySelector('#wg-lv').onclick = close;
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
    Object.values(S.games).forEach(g => { if (g.follow && ((!S.me.follow && !g.watch) || (g.game.status === 'done' && Date.now() - new Date(g.game.play_date + 'T23:59').getTime() > 2 * 864e5))) delete S.games[g.game.id]; });
    saveGames();
    // parties suivies supprimées sur le serveur (ex. partie test effacée par son créateur) : on les retire aussi ici
    const followed = Object.values(S.games).filter(g => g.follow).map(g => g.game.id);
    if (remoteOn() && navigator.onLine && followed.length) {
      try {
        const { data, error } = await sb.from('games').select('id').in('id', followed);
        if (!error && data) { const alive = new Set(data.map(r => r.id)); followed.forEach(id => { if (!alive.has(id)) delete S.games[id]; }); saveGames(); }
      } catch (e) { }
    }
    const ids = followIds();
    if (!remoteOn() || !ids.length) { subscribeMe(); if (location.hash === '' || location.hash === '#/') viewHome(); return; }
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
    push({ t: 'upsert', table: 'profiles', row: { device_id: S.me.deviceId, code: S.me.code, name: S.me.name, idx: S.me.index === '' || S.me.index == null ? null : Number(S.me.index), tee: S.me.tee, bag: S.me.bag, partners: S.me.partners, season: !!S.me.season, updated_at: new Date().toISOString() } });
  }
  async function restoreProfile(code) {
    if (!remoteOn()) throw new Error('Serveur non configuré.');
    const { data, error } = await sb.from('profiles').select('*').eq('code', code.trim().toUpperCase()).limit(1);
    if (error) throw error;
    if (!data || !data.length) throw new Error('Aucun profil avec ce code.');
    const r = data[0];
    const oldId = S.me.deviceId, keep = { theme: S.me.theme, big: S.me.big, detect: S.me.detect, visible: S.me.visible, follow: S.me.follow, xcap: S.me.xcap };
    S.me = { ...keep, deviceId: r.device_id, code: r.code, name: r.name || '', index: r.idx == null ? '' : String(r.idx), tee: r.tee || 'jaune', bag: r.bag || S.me.bag, partners: r.partners || [], season: !!r.season };
    saveMe();
    // l'ancien profil de cet appareil devient un doublon : on le supprime (et on rattache ses parties)
    if (oldId && oldId !== r.device_id) {
      try {
        await sb.from('players').update({ device_id: r.device_id }).eq('device_id', oldId);
        await sb.from('profiles').delete().eq('device_id', oldId);
        await sb.from('backups').delete().eq('device_id', oldId);
      } catch (e) { }
      Object.values(S.games).forEach(g => g.players.forEach(p => { if (p.device_id === oldId) p.device_id = r.device_id; }));
      LS.set('fw_games', S.games);
    }
    try { await restoreBackup(S.me.deviceId); } catch (e) { } await pullMyGames();
    if (presCh) { sb.removeChannel(presCh); presCh = null; presReady = false; startPresence(); }
  }
  function rememberPartners(g) {
    if (!g || !myPlayer(g)) return;
    let changed = false;
    const tp = teamPidSet(g);
    g.players.forEach(p => {
      if (p.device_id === S.me.deviceId || tp.has(p.id)) return;
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
    markSeen(row.id);
    push({ t: 'upsert', table: 'events', row });
    if (row.type === 'react') floatReaction(row); else eventPopup(g, row);
  }
  function removeEvent(gid, id) {
    const g = S.games[gid]; g.events = (g.events || []).filter(e => e.id !== id); saveGames();
    push({ t: 'delete', table: 'events', match: { id } });
  }
  const popQueue = []; let popBusy = false;
  function eventPopup(g, e) { if (popQueue.some(x => x.e.id === e.id)) return; popQueue.push({ g, e }); if (!popBusy) nextPopup(); }
  // rejoue les moments forts pas encore vus sur ce téléphone (ouverture d'une partie, même terminée, ou de l'appli)
  const replayOpenGames = () => Object.values(S.games).filter(g => !g.follow && g.game.status !== 'done' && myPlayer(g)).forEach(replayUnseen);
  function replayUnseen(g) {
    if (!g || !g.events) return;
    const todo = g.events.filter(e => e.type !== 'tournee' && e.type !== 'react' && !S.seen.has(e.id)).sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
    if (!todo.length) return;
    const show = todo.slice(-6);
    todo.slice(0, -6).forEach(e => markSeen(e.id));
    if (todo.length > 6) toast('+' + (todo.length - 6) + ' autres moments forts dans le classement');
    show.forEach(e => eventPopup(g, e));
  }
  function nextPopup() {
    const it = popQueue.shift(); if (!it) { popBusy = false; return; }
    popBusy = true;
    const { g, e } = it;
    if (S.seen.has(e.id) && !it.force) { nextPopup(); return; }
    markSeen(e.id);
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
  /* ---------- Réactions en direct ---------- */
  const REACTS = ['🔥', '😂', '👏', '😱', '🍺'];
  function floatReaction(e) {
    const el = document.createElement('div'); el.className = 'reactfloat';
    el.style.left = (12 + Math.random() * 60) + '%';
    el.innerHTML = `<span>${esc(e.label || '🔥')}</span><small>${esc(e.by_name || '')}</small>`;
    document.body.appendChild(el); setTimeout(() => el.remove(), 2600);
  }
  let lastReact = 0;
  function reactBar(g) {
    return `<div class="reactbar" data-rg="${g.game.id}">${REACTS.map(r => `<button data-r="${r}">${r}</button>`).join('')}</div>`;
  }
  function bindReactBar(root) {
    root.querySelectorAll('.reactbar [data-r]').forEach(b => b.onclick = () => {
      if (Date.now() - lastReact < 1500) return; lastReact = Date.now();
      const gid = b.closest('.reactbar').dataset.rg; if (!S.games[gid]) return;
      addEvent(gid, { type: 'react', label: b.dataset.r, player_id: null, hole: null }); vibrate(20);
    });
  }

  /* ---------- Trophées ---------- */
  const TROPHIES = [
    ['par1', '💪', 'Premier par', 'Faire un par', 'b'],
    ['birdie1', '🐦', 'Premier birdie', 'Faire un birdie', 's'],
    ['eagle', '🦅', 'Eagle', 'Faire un eagle', 'g'],
    ['hio', '💥', 'Trou en un', 'Le Graal', 'g'],
    ['serie3', '🔥', 'En feu', '3 pars (ou mieux) de suite', 's'],
    ['s110', '🎯', 'Sous les 110', '18 trous en moins de 110', 'b'],
    ['s100', '💯', 'Sous les 100', '18 trous en moins de 100', 's'],
    ['s90', '🚀', 'Sous les 90', '18 trous en moins de 90', 'g'],
    ['putt', '🏌️', 'Putter d\'or', '18 trous sans 3-putt (putts saisis)', 's'],
    ['norouge', '🛡️', 'Jamais dans les rouges', '18 trous sans rouge', 'b'],
    ['win1', '🏆', 'Première victoire', 'Gagner une partie', 's'],
    ['win5', '👑', 'Patron', 'Gagner 5 parties', 'g'],
    ['nice5', '⭐', 'Showman', 'Recevoir 5 Nice shots', 's'],
    ['games10', '📅', 'Fidèle', 'Jouer 10 parties', 'b'],
    ['rouge5', '🍺', 'Abonné aux tournées', '5 rouges pas passés', 'b']
  ];
  function myTrophies() {
    const got = {};
    const mine = Object.values(S.games).filter(g => !g.follow && myPlayer(g));
    let wins = 0, nice = 0, rouges = 0, done = 0;
    mine.forEach(g => {
      const me = myPlayer(g); const course = gameCourse(g);
      if (g.game.status === 'done') done++;
      if (wonGame(g) === true) wins++;
      rouges += rougesIn(g);
      nice += (g.events || []).filter(e => e.player_id === me.id && e.type !== 'rouge' && e.type !== 'react' && e.type !== 'tournee').length;
      if (isTeamGame(g)) return;
      const sc = scoresOf(g)[me.id] || {};
      const holes = C.holesFor(g.game.mode, course.holes.length);
      let run = 0, tot = 0, all = true, pick = false, puttsOk = true, puttsAll = true;
      holes.forEach(h => {
        const c = sc[h] || {}; const par = course.holes[h - 1].par;
        if (c.pickup) { pick = true; run = 0; return; }
        if (c.strokes == null) { all = false; run = 0; return; }
        const d = c.strokes - par; tot += c.strokes;
        if (d === 0) got.par1 = 1;
        if (d === -1) got.birdie1 = 1;
        if (c.strokes === 1) got.hio = 1; else if (d <= -2) got.eagle = 1;
        run = d <= 0 ? run + 1 : 0; if (run >= 3) got.serie3 = 1;
        if (c.putts == null) puttsAll = false; else if (c.putts >= 3) puttsOk = false;
      });
      if (holes.length === 18 && all && !pick) {
        if (tot < 110) got.s110 = 1; if (tot < 100) got.s100 = 1; if (tot < 90) got.s90 = 1;
        if (puttsAll && puttsOk) got.putt = 1;
      }
      if (holes.length === 18 && all && (me.tee || g.game.tee) !== 'rouge' && rougesIn(g) === 0) got.norouge = 1;
    });
    if (wins >= 1) got.win1 = 1; if (wins >= 5) got.win5 = 1;
    if (nice >= 5) got.nice5 = 1; if (done >= 10) got.games10 = 1; if (rouges >= 5) got.rouge5 = 1;
    return got;
  }
  const medal = (t, on, big) => `<span class="medal ${on ? 'm-' + t[4] : 'm-off'}${big ? ' big' : ''}"><i>${on ? t[1] : '🔒'}</i></span>`;
  function trophiesTile() {
    const got = myTrophies(); const n = TROPHIES.filter(t => got[t[0]]).length;
    return `<div class="troph"><div class="trhead"><b>Trophées</b><span class="trmini">${TROPHIES.filter(t => got[t[0]]).slice(-6).map(t => medal(t, true)).join('')}</span><span>${n}/${TROPHIES.length}</span><span class="hchev">›</span></div>
      <div class="trgrid">${TROPHIES.map(t => `<div class="tr ${got[t[0]] ? 'on' : ''}">${medal(t, got[t[0]])}<b>${esc(t[2])}</b><small>${esc(t[3])}</small></div>`).join('')}</div></div>`;
  }
  function checkTrophies() {
    const got = myTrophies(); const seen = new Set(LS.get('fw_troph', []));
    const fresh = TROPHIES.filter(t => got[t[0]] && !seen.has(t[0]));
    if (!fresh.length) return;
    LS.set('fw_troph', TROPHIES.filter(t => got[t[0]]).map(t => t[0]));
    fresh.slice(0, 3).forEach((t, i) => setTimeout(() => trophyPopup(t), i * 4200));
    if (fresh.length > 3) toast('+' + (fresh.length - 3) + ' autres trophées dans tes Stats 🏆');
  }
  function trophyPopup(t) {
    const el = document.createElement('div'); el.className = 'pop';
    const conf = Array.from({ length: 30 }, (_, i) => `<i style="left:${Math.random() * 100}%;animation-delay:${Math.random() * .6}s;background:${['#ffd400', '#f7c531', '#fff', '#22a052'][i % 4]};transform:rotate(${Math.random() * 360}deg)"></i>`).join('');
    el.innerHTML = `<div class="conf">${conf}</div><div class="popcard">${medal(t, true, true)}<div class="popsub">Nouveau trophée</div><div class="poptitle">${esc(t[2])}</div><div class="popsub">${esc(t[3])}</div></div>`;
    document.body.appendChild(el); vibrate([40, 60, 40]);
    const close = () => { if (!el.parentNode) return; el.classList.add('out'); setTimeout(() => el.remove(), 300); };
    el.onclick = close; setTimeout(close, 4000);
  }

  /* ---------- Index estimé (méthode WHS simplifiée) ---------- */
  function estimatedIndex() {
    const diffs = []; let approx = false;
    Object.values(S.games).filter(g => !g.follow && g.game.status === 'done' && myPlayer(g) && !isTeamGame(g))
      .sort((a, b) => (b.game.play_date || '').localeCompare(a.game.play_date || '')).forEach(g => {
        if (diffs.length >= 20) return;
        const me = myPlayer(g); const course = gameCourse(g);
        const holes = C.holesFor(g.game.mode, course.holes.length); if (holes.length !== 18) return;
        const sc = scoresOf(g)[me.id] || {}; if (holes.some(h => !sc[h] || (sc[h].strokes == null && !sc[h].pickup))) return;
        const tee = course.tees.find(t => t.id === (me.tee || g.game.tee)) || course.tees[0] || {};
        const par = course.holes.reduce((a, h) => a + h.par, 0);
        const cr = tee.sss || par; if (!tee.sss) approx = true;
        const slope = tee.slope || 113;
        const idx = Number(S.me.index);
        const ch = S.me.index !== '' && !isNaN(idx) ? C.playingHandicap(idx, tee, course, g.game.mode) : null;
        const recv = ch != null ? C.strokesPerHole(ch, course, g.game.mode) : null;
        let ags = 0;
        holes.forEach(h => { const c = sc[h]; const hp = course.holes[h - 1].par; const cap = recv ? hp + 2 + (recv[h] || 0) : hp + 5; ags += c.pickup ? cap : Math.min(c.strokes, cap); });
        diffs.push(Math.round((113 / slope) * (ags - cr) * 10) / 10);
      });
    const n = diffs.length; if (n < 3) return { n, value: null };
    const T = { 3: [1, -2], 4: [1, -1], 5: [1, 0], 6: [2, -1], 7: [2, 0], 8: [2, 0], 9: [3, 0], 10: [3, 0], 11: [3, 0], 12: [4, 0], 13: [4, 0], 14: [4, 0], 15: [5, 0], 16: [5, 0], 17: [6, 0], 18: [6, 0], 19: [7, 0], 20: [8, 0] }[n];
    const best = diffs.slice().sort((a, b) => a - b).slice(0, T[0]);
    let v = best.reduce((a, b) => a + b, 0) / best.length + T[1];
    v = Math.max(-5, Math.min(54, Math.round(v * 10) / 10));
    return { n, value: v, approx };
  }
  function indexCard() {
    const r = estimatedIndex();
    const dec = S.me.index !== '' && S.me.index != null ? String(S.me.index).replace('.', ',') : null;
    if (r.value == null) return `<div class="idxcard"><div><small>Index estimé</small><b>–</b></div><p>Encore ${3 - r.n} carte${3 - r.n > 1 ? 's' : ''} complète${3 - r.n > 1 ? 's' : ''} de 18 trous pour l'estimer.</p></div>`;
    const v = String(r.value).replace('.', ',');
    const delta = dec != null ? Math.round((r.value - Number(S.me.index)) * 10) / 10 : null;
    return `<div class="idxcard"><div><small>Index estimé</small><b>${v}</b></div><p>Sur tes ${r.n} dernière${r.n > 1 ? 's' : ''} carte${r.n > 1 ? 's' : ''} de 18 trous${dec != null ? ` · déclaré ${dec} <span class="${delta > 0 ? 'up' : 'down'}">(${delta > 0 ? '+' : ''}${String(delta).replace('.', ',')})</span>` : ''}<br><small>${r.approx ? 'Approximatif : SSS manquant sur un parcours · ' : ''}indicatif, pas l'index officiel FFGolf</small></p></div>`;
  }

  function shotSheet(g, hole) {
    const st = { pid: (myPlayer(g) || g.players[0] || {}).id, type: null };
    const el = document.createElement('div'); el.className = 'modal';
    const draw = () => {
      const grid = grp => SHOTS.filter(s => s[3] === grp).map(s => `<button data-t="${s[0]}" class="${s[0] === st.type ? 'on' : ''}"><span>${s[1]}</span><b>${s[2]}</b></button>`).join('');
      const pl = indivPlayers(g);
      el.innerHTML = `<div class="sheet nshot"><h2 class="rgh">${FW_IC('gold')} Nice shot !</h2>
        ${pl.length > 1 ? `<div class="nslab">Qui ?</div><div class="pick">${pl.map(p => `<button data-p="${p.id}" class="${p.id === st.pid ? 'on' : ''}">${esc(p.name)}</button>`).join('')}</div>` : ''}
        <div class="nslab">Score</div><div class="shotgrid">${grid('s')}</div>
        <div class="nslab">Le coup</div><div class="shotgrid">${grid('c')}</div>
        <div class="shotgrid one">${grid('a')}</div>
        <button class="btn big full" id="sh-go" ${st.pid && st.type ? '' : 'disabled'}>Envoyer à tout le monde</button>
        <button class="btn ghost full" id="sh-x">Annuler</button></div>`;
      el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { st.pid = b.dataset.p; draw(); });
      el.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { st.type = b.dataset.t; draw(); });
      el.querySelector('#sh-x').onclick = () => el.remove();
      el.querySelector('#sh-go').onclick = async () => {
        let label = null;
        if (st.type === 'autre') { label = await fwPrompt('Quel coup ?', 'Coup de génie'); if (!label) return; }
        el.remove(); addEvent(g.game.id, { player_id: st.pid, type: st.type, label, hole });
      };
    };
    draw(); document.body.appendChild(el);
    el.onclick = e => { if (e.target === el) el.remove(); };
  }

  // joueurs concernés par les rouges (pas ceux qui partent des rouges)
  function rougeEligible(g) {
    const t = teamPidSet(g);
    const list = [];
    g.players.forEach(p => { if (p.members) p.members.forEach(m => list.push({ id: m.id, name: m.name, tee: m.tee })); else if (!t.has(p.id)) list.push(p); });
    return list.filter(p => (p.tee || g.game.tee) !== 'rouge');
  }
  function rougeSheet(g, hole) {
    const el = document.createElement('div'); el.className = 'modal';
    const draw = () => {
      el.innerHTML = `<div class="sheet"><h2 class="rgh">${FW_IC('croix')} Pas passé les rouges · trou ${hole}</h2>
        <p class="muted">Touche le ou les joueurs concernés. Chaque rouge = une tournée 🍺</p>
        <div class="pick rpick">${rougeEligible(g).map(p => `<button data-p="${p.id}" class="${rougeEv(g, p.id, hole) ? 'on' : ''}">${esc(p.name)}</button>`).join('')}</div>
        <button class="btn full" id="rg-x">OK</button></div>`;
      el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { const ev = rougeEv(g, b.dataset.p, hole); if (ev) removeEvent(g.game.id, ev.id); else { addEvent(g.game.id, { player_id: b.dataset.p, type: 'rouge', hole }); vibrate(); } draw(); });
      el.querySelector('#rg-x').onclick = () => { el.remove(); renderGameBody(); };
    };
    draw(); document.body.appendChild(el);
    el.onclick = e => { if (e.target === el) { el.remove(); renderGameBody(); } };
  }

  /* ---------- Fin de partie : la tournée ---------- */
  function celebrate(gid) {
    setTimeout(checkTrophies, 6000);
    if (S.me.season) setTimeout(() => {
      const g0 = S.games[gid]; if (!g0) return;
      const mine = gameBlocks(g0)[S.me.deviceId]; if (!mine) return;
      const pts = mine.blocks.reduce((a, b) => a + b.pts, 0);
      refreshSeason().then(d => { const i = d.cur.findIndex(r => r.dev === S.me.deviceId); toast(`🏆 ${pts >= 0 ? '+' : ''}${pts} pts sur cette partie${i >= 0 ? ' · tu es ' + (i + 1) + (i ? 'e' : 'er') + ' de l\'étape de ' + MOIS[+d.month.slice(5) - 1] : ''}`); }).catch(() => { });
    }, 5200);
    const g = S.games[gid]; if (!g) return;
    const course = gameCourse(g);
    const pay = gamePayers(g);
    const names = pay.last.map(x => x.name);
    const title = names.length ? 'Merci ' + names.join(' et ') + ' !' : 'Égalité parfaite !';
    const sub = names.length ? (pay.teamName ? (g.game.format === 'combo' ? pay.teamName + ' a perdu le duel : tournée d\'équipe 🍻' : pay.teamName + ', équipe dernière : tournée d\'équipe 🍻') : (names.length > 1 ? 'Derniers ex aequo : tournée partagée 🍻' : 'Dernier de la partie : c\'est ta tournée 🍻')) : 'Personne ne paie… cette fois.';
    const extra = pay.rouges.map(r => `<li>${FW_IC('tournee')} <b>${esc(r.name)}</b> — pas passé les rouges au ${r.holes.join(', ')} → ${r.holes.length} tournée${r.holes.length > 1 ? 's' : ''}</li>`).join('');
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
        if (!center) { if (!silent || silent === 'auto') toast('Golf introuvable : place les greens à la main'); if (false) fwAlert('Golf introuvable par son nom : lance la recherche depuis le parcours, GPS activé.'); return 0; }
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
    } catch (e) { if (silent === 'auto') toast('Drapeaux : recherche impossible pour l\'instant'); else if (!silent) fwAlert('Recherche impossible (connexion ?)'); return 0; }
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
    if (el.dataset.dot) { el.className = 'sync dot ' + cls; el.title = txt; return; }
    el.textContent = txt; el.className = 'sync ' + cls;
  }

  /* ---------- Parties ---------- */
  function createGame(opts) {
    const course = getCourse(opts.courseId);
    const snap = JSON.parse(JSON.stringify(course)); delete snap._updated; snap._hcp = !!opts.hcp; snap._xcap = opts.xcap != null ? Number(opts.xcap) : (S.me.xcap != null ? S.me.xcap : 4);
    const game = { id: uid(), code: code6(), course_id: course.id, course: snap, tee: opts.tee, mode: opts.mode, format: opts.format, play_date: opts.date || today(), tee_time: opts.time || null, status: 'open', created_by: S.me.name, created_at: new Date().toISOString() };
    const players = opts.players.map((p, i) => ({ id: uid(), game_id: game.id, device_id: i === 0 ? S.me.deviceId : (p.device_id || null), name: p.name, idx: p.idx === '' ? null : Number(p.idx), tee: p.tee || opts.tee, created_at: new Date(Date.now() + i).toISOString() }));
    if (opts.teams && opts.teams.length) {
      game.teams = opts.teams.map((t, k) => {
        const pid = uid();
        players.push({ id: pid, game_id: game.id, device_id: null, name: t.name, idx: null, tee: opts.tee, created_at: new Date(Date.now() + 50 + k).toISOString() });
        return { id: 't' + k, name: t.name, color: t.color, pid, members: t.members.map(i => players[i].id) };
      });
    }
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
    return { link, text: '⛳ Partie de golf — ' + c.name + '\n📅 ' + when + '\n🏌️ ' + FORMATS[g.game.format] + ' · ' + MODES[g.game.mode] + ' · repère ' + teeName(c, g.game.tee) + (C.noHcp(g.game) ? ' · en brut' : ' · avec index') + '\nRejoins la partie : ' + link + '\n(code ' + g.game.code + ')' };
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
  // nom de l'appli : FA + I en drapeau + R en gras, WAY en fin
  const WORDMARK = '<span class="wm" aria-label="Fly18">FLY<span class="wm18">18</span></span>';
  function topbar(title, back, extra) {
    return `<header class="top">${back ? `<a class="back" href="${back}" aria-label="Retour">‹</a>` : '<img class="logo" src="' + logoURL() + '" alt="">'}<h1>${title === 'Fairway' ? WORDMARK : esc(title)}</h1>${extra === 'me' ? `<a class="mechip" href="#/profile"><span class="mc-t"><b>${esc(S.me.name || 'Profil')}</b><small>Index ${S.me.index !== '' && S.me.index != null ? esc(S.me.index) : '—'}</small></span><i id="sync" class="sync dot" data-dot="1"></i></a>` : '<span id="sync" class="sync"></span>' + (extra || '')}</header>`;
  }
  function route() {
    const h = location.hash.replace(/^#\/?/, '');
    const [r, a, b] = h.split('/');
    if (r !== 'game') { stopGPS(); unsubscribe(); }
    if (r !== 'admin' && amap) { amap.remove(); amap = null; }
    setTimeout(trackPresence, 300);
    if (!S.me.name && r !== 'join' && r !== 'profile') return viewWelcome();
    if (r === 'new') return viewNew(a ? decodeURIComponent(a) : null);
    if (r === 'game' && a) { if (S.openGid !== a) { S.openGid = a; S.tab = null; S.mapEditMode = false; } return viewGame(a); }
    if (r === 'join' && a) return viewJoin(a);
    if (r === 'courses') return viewCourses();
    if (r === 'course' && a) return viewCourseEdit(a);
    if (r === 'profile') return viewProfile();
    if (r === 'stats') return viewStats();
    if (r === 'classement') return viewSeason();
    if (r === 'live') return viewLive();
    if (r === 'copains') return viewCopains();
    if (r === 'admin' && a && isAdmin()) return viewAdminFlags(decodeURIComponent(a));
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
  const card = g => {
    let s = null, sc = '—';
    if (g.game.format === 'combo') { const r = comboResult(g); const mt = myTeam(g); if (r) { const i = mt ? r.tps.findIndex(t => t.id === mt.id) : 0; sc = fmtPts(r.pts[Math.max(i, 0)]) + ' – ' + fmtPts(r.pts[i === 1 ? 0 : 1]); } }
    else if (g.game.format === 'scramble') { const t = myTeam(g) || teamPlayers(g)[0]; if (t) { s = C.playerSummary(t, phaseGame(g, 'scr'), gameCourse(g), scoresOf(g)[t.id] || {}); if (s.played) sc = 'net ' + fmtPar(s.netToPar); } }
    else { const p = myPlayer(g) || g.players[0]; s = p ? C.playerSummary(p, g.game, gameCourse(g), scoresOf(g)[p.id] || {}) : null; if (s && s.played) sc = g.game.format === 'stableford' ? s.points + ' pts' : s.gross + ' (' + fmtPar(s.toPar) + ')'; }
    return `<a class="gcard" href="#/game/${g.game.id}"><div><b>${esc(g.game.course.name)}</b><small>${frDate(g.game.play_date)}${g.game.tee_time ? ' · ' + esc(g.game.tee_time) : ''} · ${FORMATS[g.game.format]} · ${MODES[g.game.mode]}</small><small>${isTeamGame(g) ? teamPlayers(g).map(t => esc(t.name) + ' (' + t.members.map(m => esc(m.name)).join(', ') + ')').join(' vs ') : g.players.map(x => esc(x.name)).join(', ')}</small></div><div class="gscore">${sc}<small>${s ? s.played + '/' + s.holes : ''}</small></div></a>`;
  };
  // historique : tuile compacte (date, lieu, score), touche pour déplier / replier
  const histCard = g => {
    const full = card(g);
    const sc = (full.match(/<div class="gscore">([\s\S]*?)<small>/) || [])[1] || '—';
    const hl = (full.match(/<div class="gscore">[\s\S]*?<small>([\s\S]*?)<\/small>/) || [])[1] || '';
    const who = isTeamGame(g) ? teamPlayers(g).map(t => esc(t.name) + ' (' + t.members.map(m => esc(m.name)).join(', ') + ')').join(' vs ') : g.players.map(x => esc(x.name)).join(', ');
    const d = new Date(g.game.play_date + 'T12:00');
    return `<div class="hcard" data-hx="${g.game.id}"><div class="hrow"><span class="hdate"><b>${d.getDate()}</b><small>${d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')}</small></span><span class="hcourse">${esc(g.game.course.name)}</span><span class="hsc">${sc}</span><span class="hchev">›</span></div>
      <div class="hmore"><small>${frDate(g.game.play_date)}${g.game.tee_time ? ' · ' + esc(g.game.tee_time) : ''} · ${FORMATS[g.game.format]} · ${MODES[g.game.mode]}${hl ? ' · ' + hl + ' joués' : ''}</small><small>${who}</small><a class="btn ghost sm" href="#/game/${g.game.id}">Voir la partie ›</a></div></div>`;
  };
  const bindHist = root => root.querySelectorAll('[data-hx]').forEach(c => c.onclick = e => { if (e.target.closest('a')) return; c.classList.toggle('open'); });
  const histGames = () => Object.values(S.games).filter(g => !g.follow && g.game.status === 'done').sort((a, b) => (b.game.play_date || '').localeCompare(a.game.play_date || ''));

  function viewHome() {
    const rounds = myRoundStats();
    const potes = Object.values(S.games).filter(g => g.follow).sort((a, b) => (b.game.created_at || '').localeCompare(a.game.created_at || ''));
    const open = Object.values(S.games).filter(g => !g.follow && g.game.status !== 'done').sort((a, b) => (b.game.created_at || '').localeCompare(a.game.created_at || ''));
    const done = Object.values(S.games).filter(g => !g.follow && g.game.status === 'done').sort((a, b) => (b.game.play_date || '').localeCompare(a.game.play_date || ''));
    const potesCard = g => {
      const sl = standingsLite(g);
      const lead = sl[0] && sl[0].played ? { name: sl[0].name, label: sl[0].label } : null;
      const holesDone = Math.max(0, ...g.players.map(p => Object.keys(scoresOf(g)[p.id] || {}).length).concat(teamPlayers(g).map(t => 0)));
      return `<a class="gcard pote" href="#/game/${g.game.id}"><div><b>${indivPlayers(g).map(x => led(x.device_id) + esc(x.name)).join(', ')}</b><small>${esc(g.game.course.name)} · ${FORMATS[g.game.format]}${g.game.status === 'done' ? ' · terminée' : ''}</small><small>${lead ? 'En tête : ' + esc(lead.name) + ' (' + esc(lead.label) + ')' : 'Pas encore commencé'}</small></div><div class="gscore">${g.game.status === 'done' ? '🍺' : holesDone + '/' + C.holesFor(g.game.mode, g.game.course.holes.length).length}</div></a>`;
    };
    $app.innerHTML = topbar('Fairway', null, 'me') + `<main>
      ${!S.me.name ? '<p class="hint">👋 Commence par renseigner ton nom et ton index dans <a href="#/profile">Profil</a>.</p>' : ''}
      <div id="wx" class="wx" hidden></div>
      <div id="online"></div>
      ${installBar()}
      <div class="tiles"><a class="tile new" href="#/new"><i>＋</i><b>Nouvelle partie</b></a>${S.me.season ? `<a class="tile trt" href="#/classement"><i>${FW_IC('trophy')}</i><b>Fly Tour</b><span id="srank"></span></a>` : `<button class="tile join" data-act="invite"><i>${FW_IC('invite')}</i><b>Inviter</b></button>`}<a class="tile live" href="#/live"><i>${FW_IC('live')}</i><b>Live</b><span id="livecount"></span></a></div>
      ${open.length ? '<h2>En cours</h2>' + open.map(card).join('') : ''}
      ${potes.length ? '<h2>🔭 Mes potes jouent</h2>' + potes.map(potesCard).join('') : ''}
      <h2>Historique</h2>${done.length ? done.slice(0, 4).map(histCard).join('') + (done.length > 4 ? `<a class="morelink" href="#/stats">Les ${done.length - 4} autres parties dans Stats ›</a>` : '') : '<p class="muted">Aucune partie terminée.</p>'}
      ${S.me.season ? `<div id="sstrip">${seasonStrip(LS.get('fw_season', null))}</div>` : (!S.me.seasonAsked && S.me.name ? `<div class="sinvite" id="sinvite"><span>🏆</span><div><b>Nouveau : le Fly Tour</b><small>Des points à chaque partie, une Fly Cup en jeu chaque mois entre potes.</small></div><button class="btn sm" id="si-on">Activer</button><button class="sx" id="si-no" aria-label="Plus tard">✕</button></div>` : '')}
      <div class="row3"><a class="btn ghost" href="#/stats"><i>${FW_IC('stats')}</i>Stats</a><a class="btn ghost" href="#/courses"><i>${FW_IC('parcours')}</i>Parcours</a><a class="btn ghost" href="#/profile"><i>${FW_IC('settings')}</i>Réglages</a></div>
      ${S.me.season ? `<button class="invbar" data-act="invite"><i>${FW_IC('invite')}</i><div><b>Inviter un pote</b><small>QR code pour installer Fly18 ou rejoindre ta partie</small></div><span>›</span></button>` : ''}
    </main>`;
    updateSyncBadge();
    if (remoteOn()) fetchLive().then(all => { const list = all.filter(g => g.game.status !== 'done'); const el = document.getElementById('livecount'); if (el && list.length) el.textContent = list.length; });
    refreshOnlineUI();
    loadWeather();
    if (S.me.season) refreshSeason().then(d => { const e = document.getElementById('sstrip'); if (e) e.innerHTML = seasonStrip(d); const rk = document.getElementById('srank'), i = d.cur.findIndex(r => r.dev === S.me.deviceId); if (rk && i >= 0) rk.textContent = (i + 1) + (i ? 'e' : 'er'); checkMonthCrown(d); }).catch(() => { });
    const sOn = $app.querySelector('#si-on'); if (sOn) sOn.onclick = () => { S.me.season = true; S.me.seasonAsked = 1; syncProfile(); toast('Bienvenue sur le Fly Tour 🏆'); viewHome(); };
    const sNo = $app.querySelector('#si-no'); if (sNo) sNo.onclick = () => { S.me.seasonAsked = 1; saveMe(); viewHome(); };
    bindHist($app);
    $app.querySelectorAll('[data-act=invite]').forEach(b => b.onclick = inviteSheet);
    const ib = $app.querySelector('#installbar'); if (ib) ib.onclick = promptInstall;
  }

  /* --- Nouvelle partie --- */
  function viewNew(preCourse) {
    const courses = Object.values(allCourses());
    const st = { courseId: (preCourse && courses.some(x => x.id === preCourse)) ? preCourse : courses[0] && courses[0].id, tee: S.me.tee || 'jaune', mode: '18', format: 'brut', date: today(), time: '', players: [{ name: S.me.name || 'Moi', idx: S.me.index == null ? '' : S.me.index, me: true }], teamSize: 2, assign: [], tnames: [], hcp: false, xcap: S.me.xcap != null ? S.me.xcap : 4 };
    const teamFmt = () => st.format === 'scramble' || st.format === 'combo';
    const nTeams = () => st.format === 'combo' ? 2 : Math.max(2, Math.ceil(st.players.length / st.teamSize));
    const fixTeams = () => { st.assign = st.players.map((_, i) => st.assign[i] != null && st.assign[i] < nTeams() ? st.assign[i] : -1); for (let k = 0; k < nTeams(); k++) if (!st.tnames[k]) st.tnames[k] = TEAM_NAMES[(k + Math.floor(Math.random() * TEAM_NAMES.length)) % TEAM_NAMES.length]; if (new Set(st.tnames.slice(0, nTeams())).size < nTeams()) st.tnames = st.tnames.map((n, k) => TEAM_NAMES[k % TEAM_NAMES.length]); };
    const draw_ = (balanced) => {
      const n = st.players.length, T = nTeams();
      let order = st.players.map((_, i) => i);
      if (balanced) order.sort((a, b) => (Number(st.players[a].idx) || 54) - (Number(st.players[b].idx) || 54));
      else for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      const res = []; order.forEach((pi, k) => { const round = Math.floor(k / T), pos = k % T; res[pi] = balanced && round % 2 ? T - 1 - pos : pos; });
      return res;
    };
    let partners = copainList();
    pullCopains().then(() => { partners = copainList(); if (location.hash === '#/new') draw(); });
    const draw = () => {
      const c = getCourse(st.courseId);
      if (c && !c.tees.find(t => t.id === st.tee)) st.tee = c.tees[0].id;
      if (st.format === 'combo') st.mode = '18';
      if (teamFmt()) fixTeams();
      const teamsHtml = !teamFmt() ? '' : `<h2>Équipes</h2>
        ${st.format === 'combo' ? '<p class="hint">Combo : 2 équipes. Trous 1-9 en scramble, trous 10-18 en match play 1 contre 1 (le meilleur index contre le meilleur index, etc.). 1 point le scramble, 1 point par match, l\'équipe qui perd paie la tournée 🍻</p>' : '<p class="hint">Scramble : chacun joue, on garde la meilleure balle, un seul score par équipe.' + (st.hcp ? ' Handicap d\'équipe WHS (à 2 : 35 % / 15 %, à 4 : 25/20/15/10 %).' : '') + '</p>'}
        <div class="seg"><button data-ts="2" class="${st.teamSize === 2 ? 'on' : ''}">Équipes de 2</button><button data-ts="4" class="${st.teamSize === 4 ? 'on' : ''}">Équipes de 4</button></div>
        <div class="row2"><button class="btn ghost" id="t-rand">🎲 Tirage au sort</button><button class="btn ghost" id="t-bal">⚖️ Équilibrer</button></div>
        <div id="teams">${Array.from({ length: nTeams() }, (_, k) => `<div class="teamcard" style="border-color:${TEAM_COLORS[k % TEAM_COLORS.length]}"><div class="tchead">${teamDot(TEAM_COLORS[k % TEAM_COLORS.length])}<input data-tn="${k}" value="${esc(st.tnames[k])}"><span class="tcount">${st.assign.filter(a => a === k).length}/${st.teamSize}</span></div><div class="tmem">${st.players.map((p, i) => st.assign[i] === k ? `<span class="tchip">${esc(p.name || '?')}</span>` : '').join('') || '<small>Personne</small>'}</div></div>`).join('')}</div>
        <div class="assign">${st.players.map((p, i) => `<div class="arow"><span>${esc(p.name || 'Joueur ' + (i + 1))}</span><div class="pick mini">${Array.from({ length: nTeams() }, (_, k) => `<button data-as="${i}:${k}" class="${st.assign[i] === k ? 'on' : ''}" style="${st.assign[i] === k ? 'background:' + TEAM_COLORS[k % TEAM_COLORS.length] + ';border-color:' + TEAM_COLORS[k % TEAM_COLORS.length] : ''}">${String.fromCharCode(65 + k)}</button>`).join('')}</div></div>`).join('')}</div>`;
      $app.innerHTML = topbar('Nouvelle partie', '#/') + `<main class="form">
        <label>Parcours<select id="n-course">${courses.map(x => `<option value="${esc(x.id)}" ${x.id === st.courseId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
        <div class="row2"><label>Repère<select id="n-tee">${c.tees.map(t => `<option value="${esc(t.id)}" ${t.id === st.tee ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
        <label>Trous<select id="n-mode" ${st.format === 'combo' ? 'disabled' : ''}>${Object.entries(MODES).filter(([k]) => c.holes.length >= 18 || k !== 'back').map(([k, v]) => `<option value="${k}" ${k === st.mode ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>
        <label>Formule<select id="n-format">${Object.entries(FORMATS).filter(([k]) => st.hcp || k !== 'net').map(([k, v]) => `<option value="${k}" ${k === st.format ? 'selected' : ''}>${!st.hcp && k === 'brut' ? 'Stroke play' : v}</option>`).join('')}</select></label>
        <label class="switch"><input type="checkbox" id="n-hcp" ${st.hcp ? 'checked' : ''}><span>Prendre en compte les index<small>${st.hcp ? 'Coups reçus selon l\'index de chacun (net, Stableford net, handicap d\'équipe)' : 'Décoché : tout le monde joue en brut, à égalité'}</small></span></label>
        ${st.format === 'stableford' || st.format === 'match' ? '' : `<label>Croix (balle ramassée)<select id="n-xcap">${[2, 3, 4, 5, 6].map(n => `<option value="${n}" ${n === Number(st.xcap) ? 'selected' : ''}>par + ${n}${n === 2 ? ' (double bogey)' : n === 3 ? ' (triple bogey)' : ''}</option>`).join('')}</select></label>`}
        <h2>Joueurs</h2>
        <div id="n-players" class="${st.hcp ? '' : 'noidx'}">${st.players.map((p, i) => `<div class="prow"><input placeholder="Nom" data-i="${i}" data-f="name" value="${esc(p.name)}"><input placeholder="Index" inputmode="decimal" data-i="${i}" data-f="idx" value="${esc(p.idx)}">${i ? `<button class="x" data-del="${i}">✕</button>` : '<span class="me">moi</span>'}</div>`).join('')}</div>
        ${partners.length ? `<h2>Les copains</h2><div class="pick">${partners.map(m => chipHtml(m, st.players.some(p => p.key === m.key), 'data-pk')).join('')}</div><p class="hint">Touche un copain pour l'ajouter : la partie apparaît directement sur son téléphone. Point vert = connecté. Même hors ligne (batterie à plat…), tu peux saisir ses scores pour lui.</p>` : ''}
        <button class="btn ghost" id="n-add">＋ Ajouter un joueur</button>
        <p class="hint">Tes potes peuvent aussi se rajouter eux-mêmes avec le lien d'invitation, une fois la partie créée.</p>
        ${st.format === 'match' ? '<p class="hint">Match play : chaque duel 1 contre 1 est calculé, coups rendus = différence des handicaps de jeu.</p>' : ''}
        ${teamsHtml}
        <button class="btn big" id="n-go">Créer la partie</button>
      </main>`;
      updateSyncBadge();
      const bind = (id, k) => { $app.querySelector(id).onchange = e => { st[k] = e.target.value; if (k === 'courseId') st.picked = true; draw(); }; };
      bind('#n-course', 'courseId'); bind('#n-tee', 'tee'); bind('#n-mode', 'mode'); bind('#n-format', 'format');
      const xs = $app.querySelector('#n-xcap'); if (xs) xs.onchange = e => { st.xcap = Number(e.target.value); };
      $app.querySelector('#n-hcp').onchange = e => { st.hcp = e.target.checked; if (!st.hcp && st.format === 'net') st.format = 'brut'; draw(); };
      $app.querySelectorAll('#n-players input').forEach(inp => inp.oninput = e => { st.players[+e.target.dataset.i][e.target.dataset.f] = e.target.value; });
      $app.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { st.players.splice(+b.dataset.del, 1); draw(); });
      $app.querySelectorAll('[data-pk]').forEach(b => b.onclick = () => {
        const m = partners.find(x => x.key === b.dataset.pk); const i = st.players.findIndex(p => p.key === m.key);
        if (i >= 0) st.players.splice(i, 1); else if (st.players.length < 8) st.players.push({ name: m.name, idx: m.idx == null ? '' : m.idx, device_id: m.device_id, key: m.key });
        draw();
      });
      $app.querySelector('#n-add').onclick = () => { if (st.players.length >= 8) return; st.players.push({ name: '', idx: '' }); draw(); };
      if (teamFmt()) {
        $app.querySelectorAll('[data-ts]').forEach(b => b.onclick = () => { st.teamSize = +b.dataset.ts; st.assign = []; draw(); });
        $app.querySelectorAll('[data-tn]').forEach(inp => inp.oninput = e => { st.tnames[+e.target.dataset.tn] = e.target.value; });
        $app.querySelectorAll('[data-as]').forEach(b => b.onclick = () => { const [i, k] = b.dataset.as.split(':').map(Number); st.assign[i] = st.assign[i] === k ? -1 : k; draw(); });
        const anim = balanced => { let n = 0; const iv = setInterval(() => { st.assign = draw_(false); draw(); vibrate(8); if (++n >= 9) { clearInterval(iv); st.assign = draw_(balanced); draw(); vibrate([30, 40, 60]); } }, 90); };
        $app.querySelector('#t-rand').onclick = () => anim(false);
        $app.querySelector('#t-bal').onclick = () => anim(true);
      }
      $app.querySelector('#n-go').onclick = () => {
        const players = st.players.filter(p => String(p.name).trim()).map(p => ({ name: String(p.name).trim(), idx: String(p.idx == null ? '' : p.idx).replace(',', '.'), device_id: p.device_id || null }));
        if (!players.length) return fwAlert('Ajoute au moins un joueur.');
        let teams = null;
        if (teamFmt()) {
          const keep = st.players.map((p, i) => String(p.name).trim() ? i : -1).filter(i => i >= 0);
          const asg = keep.map(i => st.assign[i]);
          if (asg.some(a => a == null || a < 0)) return fwAlert('Place chaque joueur dans une équipe (ou fais un tirage au sort 🎲).');
          teams = Array.from({ length: nTeams() }, (_, k) => ({ name: (st.tnames[k] || TEAM_NAMES[k]).trim() || TEAM_NAMES[k], color: TEAM_COLORS[k % TEAM_COLORS.length], members: asg.map((a, j) => a === k ? j : -1).filter(j => j >= 0) })).filter(t => t.members.length);
          if (teams.some(t => t.members.length !== st.teamSize)) return fwAlert('Chaque équipe doit avoir ' + st.teamSize + ' joueurs.');
          if (st.format === 'combo' && teams.length !== 2) return fwAlert('Le combo se joue à 2 équipes.');
        }
        const id = createGame({ ...st, players, teams });
        location.hash = '#/game/' + id;
      };
    };
    // golf le plus proche présélectionné (position récente, puis GPS)
    const pickNearest = pos => {
      if (preCourse || st.picked || !pos) return;
      let best = null, bd = Infinity;
      courses.forEach(c => { if (!c.center) return; const d = C.distance(pos, c.center); if (d != null && d < bd) { bd = d; best = c; } });
      if (best && best.id !== st.courseId) { st.courseId = best.id; if (location.hash.startsWith('#/new')) draw(); }
    };
    pickNearest(LS.get('fw_lastpos', null));
    draw();
    if (!preCourse && navigator.geolocation) navigator.geolocation.getCurrentPosition(p => { const pos = { lat: p.coords.latitude, lng: p.coords.longitude }; LS.set('fw_lastpos', pos); pickNearest(pos); }, () => { }, { enableHighAccuracy: false, maximumAge: 600000, timeout: 10000 });
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
    const free = indivPlayers(g).filter(p => !p.device_id);
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
      const name = $app.querySelector('#j-name').value.trim(); if (!name) return fwAlert('Ton nom ?');
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
    const spect = !!g.follow;
    if (!S.tab) S.tab = spect || g.game.status === 'done' ? 'classement' : 'trou';
    if (spect && (S.tab === 'trou' || S.tab === 'carte')) S.tab = 'classement';
    const tabs = spect ? [['classement', 'Live'], ['score', 'Carte de score']] : [['trou', 'Trou'], ['carte', 'Carte'], ['classement', 'Classement'], ['score', 'Carte de score']];
    $app.innerHTML = topbar(g.game.course.name, spect ? '#/live' : '#/', spect ? '<span class="specbadge">👀 Spectateur</span>' : `<button class="aatg ${S.me.big ? 'on' : ''}" id="g-big" aria-label="Taille du texte"><small>A</small>A</button>`) +
      `<nav class="tabs">${tabs.map(([k, v]) => `<button data-tab="${k}" class="${S.tab === k ? 'on' : ''}">${v}</button>`).join('')}</nav><main id="gbody"${spect ? ' class="withreact"' : ''}></main>${spect && g.game.status !== 'done' ? reactBar(g) : ''}`;
    bindReactBar($app);
    updateSyncBadge();
    $app.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { S.tab = b.dataset.tab; $app.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('on', x === b)); renderGameBody(); });
    if (!spect) {
      startGPS();
      $app.querySelector('#g-big').onclick = () => { S.me.big = !S.me.big; saveMe(); applyBig(); $app.querySelector('#g-big').classList.toggle('on', !!S.me.big); if (S.me.big && S.tab !== 'trou') { S.tab = 'trou'; viewGame(gid); return; } renderGameBody(); toast(S.me.big ? '👓 Mode parcours' : 'Mode normal'); };
    }
    subscribe(gid);
    if (!spect) rememberPartners(g);
    const lc = spect ? null : getCourse(g.game.course_id);
    S.flagTried = S.flagTried || new Set();
    if (lc && !lc._osm && !S.flagTried.has(lc.id) && !lc.holes.some(h => h.gps && h.gps.center) && navigator.onLine) { S.flagTried.add(lc.id); autoFlags(lc.id, 'auto'); }
    if (remoteOn()) refreshGame(gid).then(ok => { if (ok) { liveRender(); replayUnseen(S.games[gid]); } });
    renderGameBody();
    setTimeout(() => replayUnseen(S.games[gid]), 600);
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
    const me = myPlayer(g) || indivPlayers(g)[0];
    const sc = me ? (scoresOf(g)[me.id] || {}) : {};
    const mt = isTeamGame(g) ? (myTeam(g) || teamPlayers(g)[0]) : null;
    const tsc = mt ? (scoresOf(g)[mt.id] || {}) : {};
    const done = h => (isTeamGame(g) && isScrHole(g, h)) ? tsc[h] : sc[h];
    return `<div class="chips" id="chips">${holes.map(h => `<button data-h="${h}" class="${h === cur ? 'on' : ''} ${done(h) ? 'done' : ''} ${g.game.format === 'combo' && h === 10 ? 'phase' : ''}">${h}</button>`).join('')}</div>`;
  }

  function renderHole(body, g) {
    const course = gameCourse(g);
    const h = S.hole[g.game.id];
    const ch = course.holes[h - 1];
    const holes = C.holesFor(g.game.mode, course.holes.length);
    const dist = ch.dist ? ch.dist[g.game.tee] : null;
    const teamHole = isTeamGame(g) && isScrHole(g, h);
    const gmH = !isTeamGame(g) ? g.game : phaseGame(g, teamHole ? 'scr' : 'mp');
    const mt = teamHole ? myTeam(g) : null;
    const players = teamHole ? teamPlayers(g).sort((a, b) => (mt && b.id === mt.id) - (mt && a.id === mt.id)) : indivPlayers(g).sort((a, b) => (b.device_id === S.me.deviceId) - (a.device_id === S.me.deviceId));
    const stars = ch.difficulty ? '★'.repeat(ch.difficulty) + '☆'.repeat(5 - ch.difficulty) : '';
    let phaseInfo = '';
    if (g.game.format === 'combo') {
      const r = comboResult(g);
      phaseInfo = teamHole ? `<div class="phasebar">🤝 <b>Scramble</b> (trous 1-9) · ${r ? esc(r.scrLabel) : ''}</div>` : `<div class="phasebar">⚔️ <b>Match play</b> (trous 10-18)${r ? r.matches.map(x => `<small>${esc(x.a.name)} vs ${esc(x.b.name)} : ${esc(x.m.label)}</small>`).join('') : ''}</div>`;
    } else if (g.game.format === 'scramble') phaseInfo = '<div class="phasebar">🤝 <b>Scramble</b> · un score par équipe</div>';
    const sumRows = players.map(p => {
      const s = C.playerSummary(p, gmH, course, scoresOf(g)[p.id] || {});
      const cur = (scoresOf(g)[p.id] || {})[h] || {};
      const recv = s.recv[h] || 0;
      const shown = cur.pickup ? 'X' : (cur.strokes != null ? cur.strokes : '–');
      const ph = s.perHole[h];
      const cls = cur.pickup ? 'pick' : (cur.strokes != null ? scoreCls(cur.strokes - ch.par) : '');
      return `<div class="player" data-pid="${p.id}">
        <div class="pname"><b>${p.members ? teamDot(p.color) : ''}${esc(p.name)}${p.device_id === S.me.deviceId || (mt && p.id === mt.id) ? ' <span class="tag">moi</span>' : ''}</b>${p.members ? `<small class="mem">${p.members.map(m => esc(m.name)).join(' · ')}</small>` : ''}<small>${C.noHcp(g.game) ? (g.game.format === 'stableford' ? s.points + ' pts' : (s.played ? fmtPar(s.toPar) : '–')) : `HCP ${p.members ? 'équipe' : 'jeu'} ${s.ph} · ${recv > 0 ? '●'.repeat(recv) + ' reçoit ' + recv : (recv < 0 ? 'rend ' + (-recv) : 'pas de coup')} · ${g.game.format === 'stableford' ? s.points + ' pts' : 'net ' + fmtPar(s.netToPar)}`}</small></div>
        <div class="stepper"><button data-s="-1">−</button><span class="val ${cls}">${shown}</span><button data-s="1">＋</button></div>
        <div class="sub"><span>Putts</span><button data-pt="-1">−</button><span class="pv">${cur.putts != null ? cur.putts : '–'}</span><button data-pt="1">＋</button>
          <button class="pickbtn ${cur.pickup ? 'on' : ''}" data-pick="1" title="Balle ramassée">X</button>
          <span class="res">${ph && ph.gross != null ? C.scoreName(cur.strokes, ch.par, cur.pickup) + (g.game.format === 'stableford' ? ' · ' + ph.points + ' pt' + (ph.points > 1 ? 's' : '') : '') : ''}</span></div>
      </div>`;
    }).join('');
    const idx = holes.indexOf(h);
    body.innerHTML = holeChips(g, h) + `
      <section class="holehead"><div class="hn">${h}</div><div><b>Par ${ch.par}</b> · HCP ${ch.si}${dist ? ' · ' + dist + ' m' : ''}<small>${stars ? `<span class="stars">${stars}</span> ` : ''}${ch.note ? esc(ch.note) : '<i class="muted">Pas de note sur ce trou</i>'}</small></div><button class="icon" id="h-note" aria-label="Modifier la note">✏️</button></section>
      <section class="gps" id="gps"></section>
      <div class="actrow"><button class="act good" id="h-shot">${FW_IC('gold')}<b>Nice shot</b></button>${rougeEligible(g).length ? `<button class="act bad" id="h-rouge">${FW_IC('croix')}<b>Rouges</b>${(g.events || []).filter(e => e.type === 'rouge' && e.hole === h).length ? `<span class="actn">${(g.events || []).filter(e => e.type === 'rouge' && e.hole === h).length}</span>` : ''}</button>` : ''}</div>
      ${phaseInfo}
      <section class="players">${sumRows}</section>
      ${!isTeamGame(g) && g.players.length < 8 ? '<button class="btn ghost full" id="h-addp">＋ Ajouter un joueur</button>' : ''}
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
      row.querySelectorAll('[data-rpid]').forEach(b => b.onclick = () => { const mpid = b.dataset.rpid; const ev = rougeEv(g, mpid, h); if (ev) removeEvent(g.game.id, ev.id); else addEvent(g.game.id, { player_id: mpid, type: 'rouge', hole: h }); renderGameBody(); });
      const rb = row.querySelector('[data-rouge]');
      if (rb) rb.onclick = () => { const ev = rougeEv(g, pid, h); if (ev) removeEvent(g.game.id, ev.id); else addEvent(g.game.id, { player_id: pid, type: 'rouge', hole: h }); renderGameBody(); };
      row.querySelector('[data-pick]').onclick = () => { const c = cur(); setScore(g.game.id, pid, h, { pickup: !c.pickup, strokes: c.pickup ? c.strokes : null }); renderGameBody(); };
    });
    body.querySelector('#h-note').onclick = () => editNote(g, h);
    body.querySelector('#h-shot').onclick = () => shotSheet(g, h);
    const hr = body.querySelector('#h-rouge'); if (hr) hr.onclick = () => rougeSheet(g, h);
    const add = body.querySelector('#h-addp'); if (add) add.onclick = () => addPlayerSheet(g);
    const go = d => { S.hole[g.game.id] = holes[idx + d]; S.measure = null; renderGameBody(); window.scrollTo(0, 0); };
    const p = body.querySelector('#h-prev'); if (p) p.onclick = () => go(-1);
    const n = body.querySelector('#h-next'); if (n) n.onclick = () => go(1);
    const e = body.querySelector('#h-end'); if (e) e.onclick = async () => { if (await fwConfirm('Terminer la partie ?')) { updateGame(g.game.id, { status: 'done' }); S.tab = 'classement'; viewGame(g.game.id); celebrate(g.game.id); } };
    const r = body.querySelector('#h-reopen'); if (r) r.onclick = () => { updateGame(g.game.id, { status: 'open' }); renderGameBody(); };
  }
  /* ---------- Équipes (scramble / combo) ---------- */
  const TEAM_NAMES = ['Les Birdies', 'Team Bogey', 'Les Chopes', 'Les Gratteurs', 'Les Hors-Limites', 'Les Pintes', 'Les Slicers', 'Team Mousse', 'Les Fers à Repasser', 'Les Bunkers'];
  const TEAM_COLORS = ['#e8272b', '#2f6fd6', '#f2a900', '#22a052', '#8b5cf6', '#ff7ab6'];
  const isTeamGame = g => g && (g.game.format === 'scramble' || g.game.format === 'combo');
  const teamPidSet = g => new Set((g.game.teams || []).map(t => t.pid));
  const indivPlayers = g => { const t = teamPidSet(g); return g.players.filter(p => !t.has(p.id)); };
  const isScrHole = (g, h) => g.game.format === 'scramble' || (g.game.format === 'combo' && h <= 9);
  function phaseGame(g, phase) {
    if (g.game.format === 'combo') return { ...g.game, mode: phase === 'scr' ? 'front' : 'back', format: phase === 'scr' ? 'net' : 'match' };
    return { ...g.game, format: 'net' };
  }
  function teamPlayers(g) {
    const course = gameCourse(g), pg = phaseGame(g, 'scr');
    return (g.game.teams || []).map(t => {
      const mem = t.members.map(id => g.players.find(p => p.id === id)).filter(Boolean);
      return { id: t.pid, name: t.name, color: t.color, members: mem, tee: g.game.tee, fixedPh: C.teamHandicap(mem, pg, course) };
    });
  }
  const myTeam = g => { const me = myPlayer(g); return me ? teamPlayers(g).find(t => t.members.some(m => m.id === me.id)) : null; };
  const teamDot = c => `<i class="tdot" style="background:${c}"></i>`;
  function comboResult(g) {
    const course = gameCourse(g), tps = teamPlayers(g); if (tps.length !== 2) return null;
    const pgS = phaseGame(g, 'scr'), pgM = phaseGame(g, 'mp');
    const scr = tps.map(t => C.playerSummary(t, pgS, course, scoresOf(g)[t.id] || {}));
    const pts = [0, 0]; const scrDone = scr.every(x => x.finished);
    let scrLabel = 'Pas commencé';
    const n = Math.min(scr[0].played, scr[1].played);
    if (n > 0) {
      const hs = C.holesFor('front', course.holes.length).slice(0, n);
      const netAt = x => hs.reduce((a, h) => a + (x.perHole[h].gross - x.perHole[h].recv), 0);
      const d = netAt(scr[0]) - netAt(scr[1]);
      scrLabel = d === 0 ? (scrDone ? 'Égalité' : 'Égalité après ' + n) : (d < 0 ? tps[0].name : tps[1].name) + (scrDone ? ' gagne de ' : ' mène de ') + Math.abs(d) + (scrDone ? '' : ' après ' + n);
      if (scrDone) { if (d < 0) pts[0] += 1; else if (d > 0) pts[1] += 1; else { pts[0] += .5; pts[1] += .5; } }
    }
    const sortM = t => t.members.slice().sort((a, b) => (Number(a.idx) || 0) - (Number(b.idx) || 0));
    const A = sortM(tps[0]), B = sortM(tps[1]); const matches = [];
    for (let i = 0; i < Math.min(A.length, B.length); i++) {
      const m = C.matchPlay(A[i], B[i], pgM, course, scoresOf(g)[A[i].id] || {}, scoresOf(g)[B[i].id] || {});
      const done = m.played > 0 && (m.left === 0 || Math.abs(m.up) > m.left);
      if (done) { if (m.up > 0) pts[0] += 1; else if (m.up < 0) pts[1] += 1; else { pts[0] += .5; pts[1] += .5; } }
      matches.push({ a: A[i], b: B[i], m, done });
    }
    return { tps, scr, scrDone, scrLabel, matches, pts };
  }
  const fmtPts = n => String(n).replace('.5', '½').replace(/^0½$/, '½');
  function gamePayers(g) {
    const course = gameCourse(g);
    if (!isTeamGame(g)) return C.payers(g.players, g.game, course, scoresOf(g), g.events);
    const base = C.payers(indivPlayers(g), { ...g.game, format: 'net' }, course, {}, g.events);
    let lt = [];
    if (g.game.format === 'combo') { const r = comboResult(g); if (r && r.pts[0] !== r.pts[1]) lt = [r.pts[0] < r.pts[1] ? r.tps[0] : r.tps[1]]; }
    else {
      const tps = teamPlayers(g);
      const rows = C.leaderboard(tps, phaseGame(g, 'scr'), course, scoresOf(g)).filter(r => r.played);
      if (rows.length >= 2) { const worst = Math.max(...rows.map(r => r.netToPar)); const lasts = rows.filter(r => r.netToPar === worst); if (lasts.length < rows.length) lt = lasts.map(r => tps.find(t => t.id === r.playerId)); }
    }
    return { last: lt.flatMap(t => t.members.map(p => ({ playerId: p.id, name: p.name }))), rouges: base.rouges, teamName: lt.map(t => t.name).join(' et ') };
  }
  // classement résumé (cartes Live / Mes potes / partage)
  function standingsLite(g) {
    const course = gameCourse(g);
    if (g.game.format === 'combo') { const r = comboResult(g); if (r) return r.tps.map((t, i) => ({ name: t.name, label: fmtPts(r.pts[i]) + ' pt' + (r.pts[i] > 1 ? 's' : ''), played: 1, v: -r.pts[i] })).sort((a, b) => a.v - b.v); }
    if (g.game.format === 'scramble') return C.leaderboard(teamPlayers(g), phaseGame(g, 'scr'), course, scoresOf(g)).map(r => ({ name: r.name, label: r.played ? 'net ' + fmtPar(r.netToPar) : '–', played: r.played }));
    return C.leaderboard(g.players, g.game, course, scoresOf(g)).map(r => ({ name: r.name, label: r.played ? (g.game.format === 'stableford' ? r.points + ' pts' : fmtPar(g.game.format === 'brut' ? r.toPar : r.netToPar)) : '–', played: r.played, playerId: r.playerId }));
  }
  // colonnes de carte de score : {p, gm, label, color}
  function cardCols(g) {
    if (!isTeamGame(g)) return g.players.map(p => ({ p, gm: g.game, label: p.name.split(' ')[0] }));
    const tcols = teamPlayers(g).map(t => ({ p: t, gm: phaseGame(g, 'scr'), label: t.name.replace(/^(Les|Team)\s+/i, '').slice(0, 10), color: t.color }));
    if (g.game.format === 'scramble') return tcols;
    return tcols.concat(indivPlayers(g).map(p => ({ p, gm: phaseGame(g, 'mp'), label: p.name.split(' ')[0] })));
  }

  const rougeEv = (g, pid, h) => (g.events || []).find(e => e.type === 'rouge' && e.player_id === pid && e.hole === h);
  const scoreCls = d => d <= -2 ? 'eagle' : d === -1 ? 'birdie' : d === 0 ? 'par' : d === 1 ? 'bogey' : 'dbl';
  const vibrate = pat => { try { navigator.vibrate && navigator.vibrate(pat || 15); } catch (e) { } };

  async function editNote(g, h) {
    const course = getCourse(g.game.course_id); if (!course) return;
    const ch = course.holes[h - 1];
    const note = await fwPrompt('Note / difficultés du trou ' + h + ' (partagée avec tes potes) :', ch.note || '');
    if (note === null) return;
    const d = await fwPrompt('Difficulté de 1 (facile) à 5 (piège) — vide pour aucune :', ch.difficulty || '');
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
      const m = S.measure;
      html = `<div class="gband"><div class="gs"><small>Avant</small><b>${df != null ? df : '–'}</b></div><div class="gc"><b>${dc}</b><small>m</small></div><div class="gs"><small>Arrière</small><b>${db != null ? db : '–'}</b></div>
        <div class="gclub">${club && dc < 300 ? `<b>${esc(club.club)}</b><small>${club.dist} m carry</small>` : ''}</div>
        ${m ? `<button class="gmeas on" data-ms="stop"><b>${C.distance(m, P)} m</b><small>OK</small></button>` : `<button class="gmeas" data-ms="start" title="Mesurer mon coup (±${P.acc} m)">📏<small>Coup</small></button>`}</div>`;
    }
    if (P && !gps.center) {
      const m = S.measure;
      html += `<div class="measure">${m ? `Coup mesuré : <b>${C.distance(m, P)} m</b> <button class="btn sm" data-ms="stop">OK</button>` : '<button class="btn ghost sm" data-ms="start">📏 Mesurer mon coup</button>'}<small class="acc">précision ±${P.acc} m</small></div>`;
    }
    el.innerHTML = html;
    el.querySelectorAll('[data-gp]').forEach(b => b.onclick = () => setGreenPoint(g, h, b.dataset.gp, S.pos));
    el.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => { S.tab = 'carte'; S.mapEditMode = true; S.mapEdit = 'center'; viewGame(curGid); });
    el.querySelectorAll('[data-ms]').forEach(b => b.onclick = () => { if (b.dataset.ms === 'start') { S.measure = { lat: S.pos.lat, lng: S.pos.lng }; } else { const d = C.distance(S.measure, S.pos); S.measure = null; if (d) fwAlert('Distance du coup : ' + d + ' m'); } updateGPSView(); });
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
    const edit = !!S.mapEditMode; if (!edit) S.mapEdit = null;
    S.mapCentered = false;
    body.innerHTML = holeChips(g, h) + `<div class="mapwrap${edit ? ' editing' : ''}"><div id="map"></div>
      <div id="mapinfo" class="mapinfo"></div>
      <div class="mapfabs"><button id="m-me" aria-label="Me centrer sur la carte">◎</button><button id="m-edit" class="${edit ? 'on' : ''}" aria-label="Modifier la carte">✏️</button></div>
      ${edit ? `<div class="mapedit"><div class="maptools">${[['tee', 'Départ'], ['front', 'Avant'], ['center', 'Centre'], ['back', 'Arrière']].map(([k, v]) => `<button data-me="${k}" class="${S.mapEdit === k ? 'on' : ''}">${v}</button>`).join('')}</div>
        <p class="hint" id="maphint">${S.mapEdit ? 'Touche la carte pour placer : <b>' + ({ tee: 'départ', front: 'avant du green', center: 'centre du green', back: 'arrière du green' })[S.mapEdit] + '</b>' : 'Choisis un repère puis touche la carte pour le placer.'}</p>
        <div class="row2"><button class="btn ghost sm" id="m-auto">${FW_IC('signal')} Auto</button>${isAdmin() ? `<a class="btn ghost sm" href="#/admin/${encodeURIComponent(g.game.course_id)}/${h}">${FW_IC('gear')} Précis</a>` : ''}</div>
        <button class="btn sm full" id="m-done">Terminé</button></div>` : ''}</div>`;
    body.querySelectorAll('[data-h]').forEach(b => b.onclick = () => { S.hole[g.game.id] = +b.dataset.h; target = null; destroyMap(); renderGameBody(); });
    body.querySelector('#m-edit').onclick = () => { S.mapEditMode = !S.mapEditMode; S.mapEdit = S.mapEditMode ? 'center' : null; destroyMap(); renderGameBody(); };
    const done = body.querySelector('#m-done'); if (done) done.onclick = () => { S.mapEditMode = false; S.mapEdit = null; destroyMap(); renderGameBody(); };
    const au = body.querySelector('#m-auto'); if (au) au.onclick = () => autoFlags(g.game.course_id).then(() => { destroyMap(); renderGameBody(); });
    body.querySelectorAll('[data-me]').forEach(b => b.onclick = () => { S.mapEdit = S.mapEdit === b.dataset.me ? null : b.dataset.me; body.querySelectorAll('[data-me]').forEach(x => x.classList.toggle('on', x.dataset.me === S.mapEdit)); const hint = document.getElementById('maphint'); if (hint) hint.innerHTML = S.mapEdit ? 'Touche la carte pour placer : <b>' + ({ tee: 'départ', front: 'avant du green', center: 'centre du green', back: 'arrière du green' })[S.mapEdit] + '</b>' : 'Choisis un repère puis touche la carte pour le placer.'; });
    body.querySelector('#m-me').onclick = () => { if (!S.pos) return toast(S.gpsErr ? 'GPS indisponible' : 'Recherche de ta position…'); if (map) map.setView([S.pos.lat, S.pos.lng], 18); };
    loadLeaflet().then(() => {
      destroyMap();
      const course = gameCourse(g); const gps = course.holes[h - 1].gps || {};
      const c = gps.center || gps.tee || (S.pos && C.distance(S.pos, course.center || S.pos) < 5000 ? S.pos : null) || course.center || { lat: 46.6, lng: 2.4 };
      map = L.map('map', { zoomControl: true, attributionControl: true }).setView([c.lat, c.lng], gps.center ? 17 : 16);
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 20, maxNativeZoom: 19, attribution: 'Esri, Maxar' }).addTo(map);
      layers = L.layerGroup().addTo(map);
      map.on('click', e => {
        const pt = { lat: e.latlng.lat, lng: e.latlng.lng };
        if (S.mapEditMode && S.mapEdit) { setGreenPoint(g, h, S.mapEdit, pt); const order = ['tee', 'front', 'center', 'back']; const nx = order[order.indexOf(S.mapEdit) + 1]; S.mapEdit = nx || null; body.querySelectorAll('[data-me]').forEach(b => b.classList.toggle('on', b.dataset.me === S.mapEdit)); const hint = document.getElementById('maphint'); if (hint) hint.innerHTML = S.mapEdit ? 'Point suivant : <b>' + ({ front: 'avant du green', center: 'centre du green', back: 'arrière du green' })[S.mapEdit] + '</b>' : 'Points placés ✔ — touche « Terminé ».'; }
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
    if (S.pos) {
      if (S.pos.acc && S.pos.acc < 200) L.circle([S.pos.lat, S.pos.lng], { radius: S.pos.acc, color: '#1a73e8', weight: 1, fillColor: '#1a73e8', fillOpacity: .12 }).addTo(layers);
      L.circleMarker([S.pos.lat, S.pos.lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#1a73e8', fillOpacity: 1 }).bindTooltip('Moi').addTo(layers);
      // première position : cadrer moi + green si je suis sur le trou
      if (!S.mapCentered && gps.center && C.distance(S.pos, gps.center) < 1500) { S.mapCentered = true; map.fitBounds([[S.pos.lat, S.pos.lng], [gps.center.lat, gps.center.lng]], { padding: [60, 60], maxZoom: 18 }); }
    }
    let info = '';
    if (target) {
      dot(target, '#ffd400', 'Cible', 7);
      const pts = []; if (from) pts.push([from.lat, from.lng]); pts.push([target.lat, target.lng]); if (gps.center) pts.push([gps.center.lat, gps.center.lng]);
      L.polyline(pts, { color: '#ffd400', weight: 3, dashArray: '6 6' }).addTo(layers);
      const d1 = from ? C.distance(from, target) : null, d2 = gps.center ? C.distance(target, gps.center) : null;
      const club = C.suggestClub(d1, S.me.bag);
      info = `<div class="mi-row">${d1 != null ? `<div class="mi"><small>${from === S.pos ? 'Moi' : 'Départ'} → cible</small><b>${d1} m</b>${club ? `<small>${esc(club.club)}</small>` : ''}</div>` : ''}${d2 != null ? `<div class="mi"><small>Cible → green</small><b>${d2} m</b></div>` : ''}<button class="mi-x" id="mi-x" aria-label="Effacer la cible">✕</button></div>`;
    } else if (from && gps.center) info = `<div class="mi-row"><div class="mi"><small>${from === S.pos ? 'Moi' : 'Départ'} → green</small><b>${C.distance(from, gps.center)} m</b></div><div class="mi tip"><small>Touche la carte<br>pour viser un point</small></div></div>`;
    else if (!gps.center) info = '<div class="mi-row"><div class="mi tip"><small>Green pas encore placé : touche ✏️ pour le placer</small></div></div>';
    else info = '<div class="mi-row"><div class="mi tip"><small>Touche la carte pour mesurer une distance</small></div></div>';
    const el = document.getElementById('mapinfo'); if (el) { el.innerHTML = info; const x = el.querySelector('#mi-x'); if (x) x.onclick = e => { e.stopPropagation(); target = null; drawMapLayers(); }; }
  }

  /* --- Classement --- */
  function renderBoard(body, g) {
    const course = gameCourse(g);
    const rows = isTeamGame(g) ? C.leaderboard(teamPlayers(g), phaseGame(g, 'scr'), course, scoresOf(g)) : C.leaderboard(g.players, g.game, course, scoresOf(g));
    const spect = !!g.follow;
    const holesAll = C.holesFor(g.game.mode, course.holes.length);
    const where = spect && g.game.status !== 'done' ? `<section class="card where"><b>📍 Où ils en sont</b>${(isTeamGame(g) ? teamPlayers(g) : g.players).map(p => { const sc = scoresOf(g)[p.id] || {}; const n = holesAll.filter(h => sc[h]).length; const last = [...holesAll].reverse().find(h => sc[h]); const ls = last ? sc[last] : null; return `<div class="wrow"><span>${p.members ? teamDot(p.color) + p.members.map(m => led(m.device_id)).join('') : led(p.device_id)}${esc(p.name)}</span><span>${n >= holesAll.length ? 'Terminé' : 'Trou ' + (holesAll[n] || holesAll[0])}</span><small>${last ? 'au ' + last + ' : ' + (ls.pickup ? 'X' : C.scoreName(ls.strokes, course.holes[last - 1].par, false)) : 'pas encore parti'}</small></div>`; }).join('')}</section>` : '';
    let html = where + `<section class="card"><b>${FORMATS[g.game.format]}</b><small>${MODES[g.game.mode]} · repère ${esc(teeName(course, g.game.tee))} · ${C.noHcp(g.game) ? 'brut, sans index' : 'avec index'} · ${frDate(g.game.play_date)}${g.game.status === 'done' ? ' · terminée' : ''}</small></section>`;
    if (g.game.format === 'combo') {
      const r = comboResult(g);
      if (r) {
        const [ta, tb] = r.tps;
        html += `<section class="combo"><div class="cteam">${teamDot(ta.color)}<b>${esc(ta.name)}</b><small>${ta.members.map(m => esc(m.name)).join(' · ')}</small></div><div class="cscore">${fmtPts(r.pts[0])} – ${fmtPts(r.pts[1])}</div><div class="cteam r">${teamDot(tb.color)}<b>${esc(tb.name)}</b><small>${tb.members.map(m => esc(m.name)).join(' · ')}</small></div></section>
          <h2>🤝 Scramble · trous 1-9</h2><div class="duel"><b>${esc(r.scrLabel)}</b><small>${r.scr.map((x, i) => esc(r.tps[i].name) + ' : ' + (x.played ? x.gross + ' brut / ' + x.net + ' net (HCP ' + x.ph + ')' : '–')).join(' · ')}</small></div>
          <h2>⚔️ Match play · trous 10-18</h2>${r.matches.map(x => `<div class="duel"><b>${esc(x.a.name)} vs ${esc(x.b.name)}</b><small>${esc(x.m.label)}${x.m.strokes ? ' · ' + esc(x.m.receiver) + ' reçoit ' + x.m.strokes : ''}</small></div>`).join('')}
          <p class="hint">1 point pour le scramble, 1 point par match (½ en cas d'égalité). L'équipe qui perd paie la tournée.</p>`;
      } else html += '<p class="muted">Le combo se joue à 2 équipes.</p>';
    }
    if (g.game.format === 'scramble') html += '<h2>Équipes</h2>';
    if (g.game.format === 'match') {
      const ps = g.players; const duels = [];
      for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) duels.push(C.matchPlay(ps[i], ps[j], g.game, course, scoresOf(g)[ps[i].id] || {}, scoresOf(g)[ps[j].id] || {}));
      html += duels.length ? duels.map(m => `<div class="duel"><b>${esc(m.label)}</b><small>${m.strokes ? esc(m.receiver) + ' reçoit ' + m.strokes + ' coup' + (m.strokes > 1 ? 's' : '') : 'Pas de coups rendus'} · ${m.played} trou${m.played > 1 ? 's' : ''} joué${m.played > 1 ? 's' : ''}</small></div>`).join('') : '<p class="muted">Ajoute un 2e joueur pour le match play.</p>';
      html += '<h2>Scores</h2>';
    }
    html += `${g.game.format === 'combo' ? '<!--' : ''}<table class="board ${C.noHcp(g.game) ? 'nohcp' : ''}"><thead><tr><th>#</th><th>${isTeamGame(g) ? 'Équipe' : 'Joueur'}</th><th>Trous</th><th>Brut</th><th>Net</th><th>Pts</th></tr></thead><tbody>${rows.map((r, i) => `<tr class="${g.players.find(p => p.id === r.playerId && p.device_id === S.me.deviceId) ? 'meRow' : ''}"><td>${i + 1}</td><td>${isTeamGame(g) ? teamDot((teamPlayers(g).find(t => t.id === r.playerId) || {}).color) : led((g.players.find(p => p.id === r.playerId) || {}).device_id)}${esc(r.name)}<small>${isTeamGame(g) ? esc((teamPlayers(g).find(t => t.id === r.playerId) || { members: [] }).members.map(m => m.name).join(' · ')) + ' · ' : ''}${C.noHcp(g.game) ? '' : 'HCP ' + r.ph}</small></td><td>${r.played}/${r.holes}</td><td>${r.played ? r.gross + '<small>' + fmtPar(r.toPar) + '</small>' : '–'}</td><td>${r.played ? r.net + '<small>' + fmtPar(r.netToPar) + '</small>' : '–'}</td><td><b>${r.points}</b></td></tr>`).join('')}</tbody></table>${g.game.format === 'combo' ? '-->' : ''}
      ${(() => {
        const pay = gamePayers(g);
        const lines = pay.last.map(x => `<li>${FW_IC('tournee')} <b>${esc(x.name)}</b> — ${pay.teamName ? esc(pay.teamName) + (g.game.status === 'done' ? '' : ' (pour l\'instant)') : (g.game.status === 'done' ? 'dernier' : 'dernier pour l\'instant')}</li>`).concat(pay.rouges.map(r => `<li>🍺 <b>${esc(r.name)}</b> — pas passé les rouges (trou ${r.holes.join(', ')})</li>`));
        return `<h2><button class="beerbtn" id="b-beer" aria-label="Revoir l'animation">${FW_IC('tournee')}</button> Tournées</h2>${lines.length ? `<ul class="paylist">${lines.join('')}</ul>` : '<p class="muted">Personne ne paie pour l\'instant.</p>'}`;
      })()}
      ${(g.events || []).filter(e => e.type !== 'rouge' && e.type !== 'react').length ? `<h2>Moments forts</h2><ul class="feed">${(g.events || []).filter(e => e.type !== 'rouge' && e.type !== 'react').slice().reverse().map(e => { const s = shotOf(e.type); const p = g.players.find(x => x.id === e.player_id); return `<li><span>${s[1]}</span><div><b>${esc(e.type === 'autre' && e.label ? e.label : s[2])}</b> — ${esc(p ? p.name : '?')}<small>${e.hole ? 'Trou ' + e.hole + ' · ' : ''}par ${esc(e.by_name || '?')}</small></div></li>`; }).join('')}</ul>` : ''}
      <p class="hint">Balle ramassée (X) : 0 point en Stableford, comptée par + ${C.xcapOf(g.game)}${C.noHcp(g.game) ? '' : ' (+ coups reçus)'} en stroke play.</p>
      <div class="row2"><button class="btn ghost" id="b-share">Partager le résultat</button>${g.game.status === 'done' || spect ? '' : '<button class="btn" id="b-end">Terminer</button>'}</div>
      <button class="btn ghost full danger" id="b-del">${spect ? '👋 Ne plus suivre' : '🗑️ Supprimer la partie'}</button>`;
    body.innerHTML = html;
    body.querySelector('#b-share').onclick = () => {
      const lines = isTeamGame(g) ? standingsLite(g).map((r, i) => `${i + 1}. ${r.name} — ${r.label}`) : rows.map((r, i) => `${i + 1}. ${r.name} — ${g.game.format === 'stableford' ? r.points + ' pts · ' : ''}brut ${r.gross} (${fmtPar(r.toPar)}) · net ${r.net}`);
      shareText('⛳ ' + course.name + ' — ' + frDate(g.game.play_date) + '\n' + FORMATS[g.game.format] + '\n' + lines.join('\n'));
    };
    body.querySelector('#b-beer').onclick = () => celebrate(g.game.id);
    body.querySelector('#b-del').onclick = () => deleteGame(g);
    const e = body.querySelector('#b-end'); if (e) e.onclick = async () => { if (await fwConfirm('Terminer la partie ?')) { updateGame(g.game.id, { status: 'done' }); renderGameBody(); celebrate(g.game.id); } };
  }

  /* --- Carte de score --- */
  function renderCard(body, g) {
    const course = gameCourse(g);
    const holes = C.holesFor(g.game.mode, course.holes.length);
    const cols = cardCols(g);
    const sums = cols.map(c => C.playerSummary(c.p, c.gm, course, scoresOf(g)[c.p.id] || {}));
    const cell = (s, h) => { const ph = s.perHole[h]; if (!ph || ph.gross == null) return '<td></td>'; const d = ph.gross - ph.par; return `<td><span class="sc ${ph.pickup ? 'pick' : scoreCls(d)}">${ph.pickup ? 'X' : ph.raw}</span>${g.game.format === 'stableford' ? `<sub>${ph.points}</sub>` : ''}</td>`; };
    const sub = (s, hs) => { let gr = 0, pt = 0, n = 0; hs.forEach(h => { const ph = s.perHole[h]; if (ph && ph.gross != null) { gr += ph.gross; pt += ph.points || 0; n++; } }); return n ? `<td><b>${gr}</b>${g.game.format === 'stableford' ? `<sub>${pt}</sub>` : ''}</td>` : '<td></td>'; };
    const front = holes.filter(h => h <= 9), back = holes.filter(h => h > 9);
    const row = h => `<tr><td class="h">${h}</td><td>${course.holes[h - 1].par}</td><td class="si">${course.holes[h - 1].si}</td>${sums.map(s => cell(s, h)).join('')}</tr>`;
    const tot = (label, hs) => `<tr class="tot"><td>${label}</td><td>${hs.reduce((a, h) => a + course.holes[h - 1].par, 0)}</td><td></td>${sums.map(s => sub(s, hs)).join('')}</tr>`;
    body.innerHTML = `<div class="tablewrap"><table class="scard"><thead><tr><th>Trou</th><th>Par</th><th>HCP</th>${cols.map(c => `<th>${c.color ? teamDot(c.color) : ''}${esc(c.label)}</th>`).join('')}</tr></thead><tbody>
      ${front.map(row).join('')}${front.length && back.length ? tot('Aller', front) : ''}${back.map(row).join('')}${front.length && back.length ? tot('Retour', back) : ''}${tot('Total', holes)}
      <tr class="tot"><td colspan="3">Putts</td>${sums.map(s => `<td>${s.putts != null ? s.putts : ''}</td>`).join('')}</tr>
      </tbody></table></div>
      <div class="legend"><span class="sc eagle">3</span>Eagle <span class="sc birdie">3</span>Birdie <span class="sc par">4</span>Par <span class="sc bogey">5</span>Bogey <span class="sc dbl">6</span>Double+ <span class="sc pick">X</span>Ramassée</div>
      <button class="btn big full" id="c-share">📤 Partager la carte de score</button>`;
    body.querySelector('#c-share').onclick = () => shareCardImage(g);
  }

  /* --- 👥 Les copains inscrits --- */
  async function viewCopains() {
    $app.innerHTML = topbar('👥 Les copains', '#/profile') + '<main id="cpb"><p class="muted">Chargement…</p></main>';
    updateSyncBadge();
    const el = document.getElementById('cpb');
    if (!remoteOn()) { el.innerHTML = '<p class="err">Serveur non configuré.</p>'; return; }
    let rows = [];
    try {
      let r = await sb.from('profiles').select('device_id, name, idx, created_at, updated_at').order('created_at', { ascending: false });
      if (r.error) r = await sb.from('profiles').select('device_id, name, idx, updated_at').order('updated_at', { ascending: false });
      rows = (r.data || []).filter(p => p.name);
    } catch (e) { }
    const { data: pl } = await sb.from('players').select('device_id').not('device_id', 'is', null);
    const games = {}; (pl || []).forEach(p => { games[p.device_id] = (games[p.device_id] || 0) + 1; });
    const dt = d => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' à ' + new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—';
    const ago = d => { if (!d) return '—'; const m = Math.round((Date.now() - new Date(d).getTime()) / 60000); return m < 2 ? "à l'instant" : m < 60 ? 'il y a ' + m + ' min' : m < 1440 ? 'il y a ' + Math.round(m / 60) + ' h' : 'il y a ' + Math.round(m / 1440) + ' j'; };
    el.innerHTML = `<div class="kpis three"><div><b>${rows.length}</b><small>inscrits</small></div><div><b>${Object.values(S.onlineMap).filter(m => m.device_id !== S.me.deviceId).length}</b><small>en ligne</small></div><div><b>${rows.filter(p => p.created_at && Date.now() - new Date(p.created_at).getTime() < 864e5).length}</b><small>nouveaux 24 h</small></div></div>
      <ul class="cplist">${rows.map(p => `<li><div><b>${led(p.device_id)}${esc(p.name)}${p.device_id === S.me.deviceId ? ' <span class="tag">moi</span>' : ''}</b><small>Index ${p.idx != null ? esc(p.idx) : '—'} · ${games[p.device_id] || 0} partie${(games[p.device_id] || 0) > 1 ? 's' : ''}</small></div><div class="cpd"><small>Inscrit le ${dt(p.created_at)}</small><small>Vu ${ago(p.updated_at)}</small></div></li>`).join('') || '<li class="muted">Personne pour l\'instant.</li>'}</ul>`;
  }

  /* --- 📺 Live : parties en cours des copains --- */
  async function fetchLive() {
    if (!remoteOn()) return [];
    try {
      const since = new Date(Date.now() - 14 * 3600e3).toISOString();
      const { data: games } = await sb.from('games').select('*').or(`and(status.eq.open,created_at.gte.${since}),and(status.eq.done,play_date.eq.${today()})`).order('created_at', { ascending: false }).limit(30);
      if (!games || !games.length) return [];
      const ids = games.map(g => g.id);
      const [{ data: players }, { data: scores }, { data: events }] = await Promise.all([
        sb.from('players').select('*').in('game_id', ids).order('created_at'),
        sb.from('scores').select('*').in('game_id', ids),
        sb.from('events').select('*').in('game_id', ids).order('created_at')
      ]);
      return games.map(game => {
        const g = { game, players: (players || []).filter(p => p.game_id === game.id), scores: {}, events: (events || []).filter(e => e.game_id === game.id) };
        (scores || []).filter(r => r.game_id === game.id).forEach(r => { (g.scores[r.player_id] = g.scores[r.player_id] || {})[r.hole] = { strokes: r.strokes, putts: r.putts, pickup: r.pickup }; });
        return g;
      }).filter(g => g.players.length);
    } catch (e) { return []; }
  }
  let liveChannel = null, liveTimer2 = null;
  async function viewLive() {
    $app.innerHTML = topbar('Live', '#/') + '<main><div id="livebody"><p class="muted">Recherche des parties en cours…</p></div><button class="btn ghost full lvcode" id="lv-code">🔑 J\'ai un code de partie</button></main>';
    $app.querySelector('#lv-code').onclick = async () => { const c = await fwPrompt('Code de la partie (6 caractères) :'); if (c) location.hash = '#/join/' + c.trim().toUpperCase(); };
    updateSyncBadge();
    if (!remoteOn()) { document.getElementById('livebody').innerHTML = '<p class="err">Serveur non configuré.</p>'; return; }
    const draw = async () => {
      const list = await fetchLive();
      const el = document.getElementById('livebody'); if (!el) return;
      if (!list.length) { el.innerHTML = '<div class="empty">⛳<p>Aucune partie aujourd\'hui pour l\'instant.</p><small>Dès que des copains jouent, leurs parties apparaissent ici en direct.</small></div>'; return; }
      const card = g => {
        const course = g.game.course; const holesAll = C.holesFor(g.game.mode, course.holes.length);
        const rows = standingsLite(g);
        const done = Math.max(0, ...g.players.map(p => holesAll.filter(h => (g.scores[p.id] || {})[h]).length));
        const lastEv = g.events.filter(e => e.type !== 'tournee' && e.type !== 'react').slice(-1)[0];
        const evTxt = lastEv ? (lastEv.type === 'rouge' ? FW_IC('tournee') + ' ' + esc((g.players.find(p => p.id === lastEv.player_id) || {}).name || '?') + " n'a pas passé les rouges" : shotOf(lastEv.type)[1] + ' ' + esc(lastEv.type === 'autre' && lastEv.label ? lastEv.label : shotOf(lastEv.type)[2]) + ' de ' + esc((g.players.find(p => p.id === lastEv.player_id) || {}).name || '?')) : '';
        const mine = S.games[g.game.id] && !S.games[g.game.id].follow;
        const fin = g.game.status === 'done';
        const pay = fin ? gamePayers(g) : null;
        return `<button class="livecard ${fin ? 'fin' : ''}" data-g="${g.game.id}"><div class="lc-top"><b>${esc(course.name)}</b>${fin ? '<span class="findot">🏁 Terminée</span>' : '<span class="livedot">● LIVE</span>'}</div>
          <small>${FORMATS[g.game.format]} · ${fin ? holesAll.length + ' trous' : 'trou ' + Math.min(done + 1, holesAll.length) + '/' + holesAll.length}${mine ? ' · ta partie' : ''}</small>
          <ol>${rows.slice(0, 4).map(r => `<li><span>${led((g.players.find(p => p.id === r.playerId) || {}).device_id)}${esc(r.name)}</span><b>${esc(r.label)}</b></li>`).join('')}</ol>
          ${fin && pay && pay.last.length ? `<div class="lc-ev">🍻 Merci ${esc(pay.last.map(x => x.name).join(' et '))} !</div>` : (evTxt ? `<div class="lc-ev">${evTxt}</div>` : '')}</button>`;
      };
      const enCours = list.filter(g => g.game.status !== 'done'), finies = list.filter(g => g.game.status === 'done');
      el.innerHTML = (enCours.length ? '<h2>● En cours</h2><p class="hint">Mises à jour en direct. Touche une partie pour la suivre.</p>' + enCours.map(card).join('') : '<p class="muted">Aucune partie en cours en ce moment.</p>')
        + (finies.length ? '<h2>🏁 Terminées aujourd\'hui</h2>' + finies.map(card).join('') : '');
      el.querySelectorAll('[data-g]').forEach(b => b.onclick = () => {
        const g = list.find(x => x.game.id === b.dataset.g);
        if (!S.games[g.game.id]) { S.games[g.game.id] = { ...g, mine: false, follow: true, watch: true }; saveGames(); subscribeMe(); }
        S.tab = 'classement'; S.openGid = g.game.id; location.hash = '#/game/' + g.game.id;
      });
    };
    await draw();
    if (liveChannel) sb.removeChannel(liveChannel);
    const again = () => { clearTimeout(liveTimer2); liveTimer2 = setTimeout(() => { if (location.hash === '#/live') draw(); }, 800); };
    liveChannel = sb.channel('live-all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, again)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, again)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events' }, again)
      .subscribe();
    const stop = () => { if (location.hash !== '#/live') { if (liveChannel) { sb.removeChannel(liveChannel); liveChannel = null; } window.removeEventListener('hashchange', stop); } };
    window.addEventListener('hashchange', stop);
  }

  /* --- Ajouter un joueur en cours de partie --- */
  function addPlayerSheet(g) {
    const inGame = new Set(g.players.map(p => p.device_id).filter(Boolean));
    const el = document.createElement('div'); el.className = 'modal';
    const draw = () => {
      const list = copainList().filter(m => !(m.device_id && inGame.has(m.device_id)) && !g.players.some(p => !p.device_id && p.name.toLowerCase() === m.name.toLowerCase()));
      el.innerHTML = `<div class="sheet"><h2>＋ Ajouter un joueur</h2>
        ${list.length ? `<div class="pick">${list.map(m => chipHtml(m, false, 'data-ak')).join('')}</div><p class="hint">Point vert = connecté. Hors ligne ? Pas grave, tu saisis ses scores pour lui.</p>` : '<p class="muted">Tous les copains inscrits sont déjà dans la partie.</p>'}
        <h2>Ou un invité</h2>
        <div class="form"><div class="row2"><label>Prénom<input id="ap-n"></label>${C.noHcp(g.game) ? '' : '<label>Index<input id="ap-i" inputmode="decimal"></label>'}</div></div>
        <button class="btn big full" id="ap-go">Ajouter l'invité</button>
        <button class="btn ghost full" id="ap-inv">📨 Envoyer le lien / QR de la partie</button>
        <button class="btn ghost full" id="ap-x">Fermer</button></div>`;
      el.querySelector('#ap-inv').onclick = () => { el.remove(); showInvite(g); };
      el.querySelectorAll('[data-ak]').forEach(b => b.onclick = () => {
        const m = list.find(x => x.key === b.dataset.ak); if (!m) return;
        addPlayer(g.game.id, { name: m.name, idx: m.idx == null ? '' : String(m.idx), device_id: m.device_id });
        el.remove(); toast(m.name + ' ajouté' + (m.device_id ? ' 📱' : '')); rememberPartners(S.games[g.game.id]); renderGameBody();
      });
      el.querySelector('#ap-go').onclick = () => { const n = el.querySelector('#ap-n').value.trim(); if (!n) return; const ii = el.querySelector('#ap-i'); addPlayer(g.game.id, { name: n, idx: ii ? ii.value.replace(',', '.') : '' }); el.remove(); renderGameBody(); };
      el.querySelector('#ap-x').onclick = () => el.remove();
    };
    draw(); document.body.appendChild(el);
    el.onclick = e => { if (e.target === el) el.remove(); };
    pullCopains().then(() => { if (el.parentNode) draw(); });
  }

  /* --- 🛠️ Admin : placement précis des drapeaux --- */
  const isAdmin = () => ((S.cfg && S.cfg.admins) || (window.FAIRWAY_CONFIG && window.FAIRWAY_CONFIG.admins) || []).includes(S.me.deviceId);
  let amap = null;
  function viewAdminFlags(courseId) {
    const course0 = getCourse(courseId); if (!course0) { location.hash = '#/courses'; return; }
    const parts = location.hash.split('/');
    const st = { h: Math.max(1, Math.min(course0.holes.length, parseInt(parts[3], 10) || 1)), tee: S.me.tee && course0.tees.some(t => t.id === S.me.tee) ? S.me.tee : course0.tees[0].id, mode: 'center' };
    const PTS = [['tee', 'Départ', '#2f6fd6', 'D'], ['front', 'Avant', '#7bd65a', 'A'], ['center', 'Centre', '#e8272b', '⛳'], ['back', 'Arrière', '#14532d', 'R']];
    if (amap) { amap.remove(); amap = null; }
    $app.innerHTML = topbar('🛠️ Drapeaux · ' + shortCourse(course0.name), '#/courses') + `<main class="adm">
      <div class="chips" id="a-chips"></div>
      <div class="adm-bar"><div class="seg" id="a-mode">${PTS.map(([k, l, col]) => `<button data-m="${k}"><i class="tdot" style="background:${col}"></i>${l}</button>`).join('')}</div></div>
      <div id="amap"></div>
      <div class="adm-info" id="a-info"></div>
      <div class="row2"><button class="btn ghost" id="a-prev">‹ Trou préc.</button><button class="btn" id="a-next">Trou suiv. ›</button></div>
      <div class="row2"><button class="btn ghost sm" id="a-fit">🎯 Recentrer</button><button class="btn ghost sm danger" id="a-clear">🗑️ Effacer ce trou</button></div>
      <p class="hint">Choisis un point (Départ, Avant, Centre, Arrière) puis touche la carte, ou fais glisser un point déjà posé. Zoome au maximum pour être précis. Chaque modification est enregistrée et partagée tout de suite.</p></main>`;
    updateSyncBadge();
    const course = () => getCourse(courseId);
    const gpsOf = () => (course().holes[st.h - 1].gps || {});
    const savePt = (key, ll) => {
      const copy = JSON.parse(JSON.stringify(course()));
      const hh = copy.holes[st.h - 1]; hh.gps = hh.gps || {};
      if (ll) hh.gps[key] = { lat: +ll.lat.toFixed(7), lng: +ll.lng.toFixed(7) }; else delete hh.gps[key];
      if (key === 'center' && ll && !copy.center) copy.center = { lat: +ll.lat.toFixed(6), lng: +ll.lng.toFixed(6) };
      saveCourse(copy);
    };
    const drawChips = () => {
      const el = document.getElementById('a-chips');
      el.innerHTML = course().holes.map((h, i) => `<button data-h="${i + 1}" class="${i + 1 === st.h ? 'on' : ''} ${h.gps && h.gps.center ? 'done' : ''}">${i + 1}</button>`).join('');
      el.querySelectorAll('[data-h]').forEach(b => b.onclick = () => { st.h = +b.dataset.h; history.replaceState(null, '', '#/admin/' + encodeURIComponent(courseId) + '/' + st.h); refresh(true); });
      const on = el.querySelector('.on'); if (on) el.scrollLeft = on.offsetLeft - el.clientWidth / 2 + 20;
      document.querySelectorAll('#a-mode [data-m]').forEach(b => b.classList.toggle('on', b.dataset.m === st.mode));
    };
    let layer = null;
    const drawInfo = () => {
      const ch = course().holes[st.h - 1], gp = gpsOf();
      const card = ch.dist ? ch.dist[st.tee] : null;
      let html = `<div class="adm-h"><b>Trou ${st.h}</b> · Par ${ch.par} · HCP ${ch.si} <select id="a-tee">${course().tees.map(t => `<option value="${esc(t.id)}" ${t.id === st.tee ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div>`;
      if (gp.tee && gp.center) {
        const d = C.distance(gp.tee, gp.center), diff = card ? d - card : null;
        const ok = diff == null ? '' : Math.abs(diff) <= 10 ? '✅' : Math.abs(diff) <= 25 ? '🟠' : '⚠️';
        html += `<div class="adm-row"><span>Départ → centre (ligne droite)</span><b>${d} m</b></div>`;
        if (card) html += `<div class="adm-row"><span>Carte de score (${esc((course().tees.find(t => t.id === st.tee) || {}).name || '')})</span><b>${card} m ${ok} <small>${diff >= 0 ? '+' : ''}${diff} m</small></b></div>`;
        if (diff != null && Math.abs(diff) > 25) html += '<p class="hint">Gros écart : départ mal placé, mauvais repère, ou trou en dogleg (la carte mesure le long du fairway).</p>';
      } else html += `<p class="hint">${gp.center ? 'Place le départ pour comparer avec la carte de score.' : 'Pas encore de centre de green sur ce trou.'}</p>`;
      if (gp.front && gp.back) html += `<div class="adm-row"><span>Profondeur du green</span><b>${C.distance(gp.front, gp.back)} m</b></div>`;
      document.getElementById('a-info').innerHTML = html;
      document.getElementById('a-tee').onchange = e => { st.tee = e.target.value; drawInfo(); };
    };
    const drawMarkers = () => {
      if (!amap) return;
      if (layer) layer.clearLayers(); else layer = L.layerGroup().addTo(amap);
      const gp = gpsOf();
      PTS.forEach(([k, l, col, letter]) => {
        if (!gp[k]) return;
        const icon = L.divIcon({ className: 'admpin', html: `<span style="background:${col}">${letter}</span><em>${l}</em>`, iconSize: [26, 26], iconAnchor: [13, 13] });
        const m = L.marker([gp[k].lat, gp[k].lng], { draggable: true, icon }).addTo(layer);
        m.on('dragend', () => { savePt(k, m.getLatLng()); drawInfo(); drawLine(); });
        m.on('drag', () => drawLine(k, m.getLatLng()));
      });
      drawLine();
    };
    let line = null;
    const drawLine = (k, ll) => {
      if (!amap) return;
      const gp = { ...gpsOf() }; if (k && ll) gp[k] = ll;
      if (line) { line.remove(); line = null; }
      const pts = ['tee', 'front', 'center', 'back'].filter(x => gp[x]).map(x => [gp[x].lat, gp[x].lng]);
      if (gp.tee && gp.center) line = L.polyline([[gp.tee.lat, gp.tee.lng], [gp.center.lat, gp.center.lng]], { color: '#ffd400', weight: 2, dashArray: '6 6' }).addTo(amap);
    };
    const fit = () => {
      const gp = gpsOf(); const pts = ['tee', 'front', 'center', 'back'].filter(x => gp[x]).map(x => [gp[x].lat, gp[x].lng]);
      if (pts.length >= 2) amap.fitBounds(pts, { padding: [40, 40], maxZoom: 19 });
      else if (pts.length === 1) amap.setView(pts[0], 19);
      else { const c = course().center || S.pos; if (c) amap.setView([c.lat, c.lng], 16); }
    };
    const refresh = refit => { drawChips(); drawInfo(); drawMarkers(); if (refit) fit(); };
    loadLeaflet().then(() => {
      const c = course().center || { lat: 46.6, lng: 2.4 };
      amap = L.map('amap', { zoomControl: true }).setView([c.lat, c.lng], 16);
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 22, maxNativeZoom: 19, attribution: 'Esri, Maxar' }).addTo(amap);
      amap.on('click', e => { savePt(st.mode, e.latlng); const order = ['tee', 'front', 'center', 'back']; drawMarkers(); drawInfo(); drawChips(); });
      refresh(true);
    }).catch(() => { document.getElementById('amap').innerHTML = '<p class="err">Carte indisponible (connexion ?)</p>'; });
    document.querySelectorAll('#a-mode [data-m]').forEach(b => b.onclick = () => { st.mode = b.dataset.m; drawChips(); });
    const go = d => { const n = st.h + d; if (n < 1 || n > course().holes.length) return; st.h = n; history.replaceState(null, '', '#/admin/' + encodeURIComponent(courseId) + '/' + st.h); refresh(true); };
    document.getElementById('a-prev').onclick = () => go(-1);
    document.getElementById('a-next').onclick = () => go(1);
    document.getElementById('a-fit').onclick = fit;
    document.getElementById('a-clear').onclick = async () => { if (!await fwConfirm('Effacer départ et green du trou ' + st.h + ' ?')) return; ['tee', 'front', 'center', 'back'].forEach(k => savePt(k, null)); refresh(false); };
    drawChips(); drawInfo();
  }

  /* --- Suppression d'une partie --- */
  async function deleteGame(g) {
    const others = g.players.filter(p => p.device_id && p.device_id !== S.me.deviceId);
    const iCreated = !g.game.created_by || g.game.created_by === S.me.name;
    let everywhere = false;
    if (g.follow) { if (!await fwConfirm('Ne plus afficher cette partie ?')) return; }
    else if (!others.length || !remoteOn()) { if (!await fwConfirm('Supprimer cette partie ?', 'Supprimer', true)) return; everywhere = true; }
    else if (iCreated) {
      const r = await fwChoice('Partie partagée avec ' + others.map(p => p.name).join(', ') + '.', [['all', 'Supprimer pour tout le monde', 'danger'], ['me', 'Retirer juste de mon téléphone', 'ghost'], [null, 'Annuler', 'ghost']]);
      if (r === 'all') everywhere = true; else if (r !== 'me') return;
    } else if (!await fwConfirm('Retirer cette partie de ton téléphone ? (elle reste chez les autres joueurs)')) return;
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
    const cols = cardCols(g);
    const sums = cols.map(c => C.playerSummary(c.p, c.gm, course, scoresOf(g)[c.p.id] || {}));
    const rows = isTeamGame(g) ? standingsLite(g) : C.leaderboard(g.players, g.game, course, scoresOf(g));
    const pay = gamePayers(g);
    const stb = g.game.format === 'stableford';
    const front = holes.filter(h => h <= 9), back = holes.filter(h => h > 9);
    const seq = [...front.map(h => ({ h })), ...(front.length && back.length ? [{ t: 'Aller', hs: front }] : []), ...back.map(h => ({ h })), ...(front.length && back.length ? [{ t: 'Retour', hs: back }] : []), { t: 'Total', hs: holes }];
    const W = 1080, pad = 40, rowH = 50, colFix = [110, 80, 80], np = cols.length;
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
    x.fillText(isTeamGame(g) ? teamPlayers(g).map(t => t.name + ' (' + t.members.map(m => m.name).join(', ') + ')').join('  vs  ').slice(0, 70) : g.players.map(p => p.name).join(' · '), pad, 190);
    // tableau
    let y = headH + 20;
    const colsX = [pad, pad + colFix[0], pad + colFix[0] + colFix[1]];
    const pX = i => pad + colFix[0] + colFix[1] + colFix[2] + i * pw;
    x.fillStyle = '#1b7a3d'; x.fillRect(pad, y, W - pad * 2, rowH);
    x.fillStyle = '#fff'; x.font = F(700, 24); x.textAlign = 'center';
    ['Trou', 'Par', 'HCP'].forEach((t, i) => x.fillText(t, colsX[i] + colFix[i] / 2, y + 33));
    cols.forEach((c, i) => x.fillText(c.label.slice(0, 10), pX(i) + pw / 2, y + 33));
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
      x.fillText(r.label != null ? r.label : (stb ? r.points + ' pts · ' : '') + 'brut ' + r.gross + ' (' + fmtPar(r.toPar) + ') · net ' + r.net, W - pad - 16, y + 34);
      x.textAlign = 'left'; y += 56;
    });
    // tournées
    if (payH) {
      y += 44; x.fillStyle = '#9a5b00'; x.font = F(800, 26); x.fillText('TOURNÉES 🍺', pad, y); y += 14;
      if (pay.last.length) { y += 40; x.fillStyle = '#14201a'; x.font = F(800, 30); x.fillText('🍻 Merci ' + pay.last.map(p => p.name).join(' et ') + ' !', pad, y); }
      pay.rouges.forEach(r => { y += 44; x.font = F(600, 26); x.fillText('🍺 ' + r.name + ' — pas passé les rouges (trou ' + r.holes.join(', ') + ')', pad, y); });
    }
    x.fillStyle = '#68756d'; x.font = F(600, 22); x.textAlign = 'center'; x.fillText('Fly18 — golf entre potes', W / 2, H - 30);
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
    else fwPrompt('Copie ce texte :', text);
  }
  function toast(m) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 2200); }

  /* --- Stats --- */
  // une partie terminée à plusieurs : gagnée par moi (ou mon équipe) ?
  function wonGame(g) {
    const me = myPlayer(g); if (!me || g.game.status !== 'done') return null;
    const course = gameCourse(g);
    if (g.game.format === 'combo') { const r = comboResult(g); const mt = myTeam(g); if (!r || !mt) return null; const i = r.tps.findIndex(t => t.id === mt.id); return r.pts[i] > r.pts[1 - i]; }
    if (g.game.format === 'scramble') { const tps = teamPlayers(g); if (tps.length < 2) return null; const rows = C.leaderboard(tps, phaseGame(g, 'scr'), course, scoresOf(g)).filter(r => r.played); const mt = myTeam(g); if (!rows.length || !mt) return null; return rows.filter(r => r.netToPar === rows[0].netToPar).some(r => r.playerId === mt.id) && rows.length > 1; }
    if (indivPlayers(g).length < 2) return null;
    if (g.game.format === 'match') { const ps = indivPlayers(g); let w = 0, l = 0; ps.filter(p => p.id !== me.id).forEach(o => { const m = C.matchPlay(me, o, g.game, course, scoresOf(g)[me.id] || {}, scoresOf(g)[o.id] || {}); if (m.up > 0) w++; else if (m.up < 0) l++; }); return w > 0 && l === 0; }
    const rows = C.leaderboard(g.players, g.game, course, scoresOf(g)).filter(r => r.played);
    if (rows.length < 2) return null;
    const key = r => g.game.format === 'stableford' ? -r.points : (g.game.format === 'brut' ? r.toPar : r.netToPar);
    const best = Math.min(...rows.map(key));
    return rows.some(r => r.playerId === me.id && key(r) === best);
  }
  const rougesIn = g => { const me = myPlayer(g); return me ? (g.events || []).filter(e => e.type === 'rouge' && e.player_id === me.id).length : 0; };

  // historique complet : une tuile par mois, regroupées par année
  function histByMonth() {
    const all = histGames(); if (!all.length) return '';
    const groups = {};
    all.forEach(g => { const k = (g.game.play_date || '').slice(0, 7); (groups[k] = groups[k] || []).push(g); });
    let html = '', year = null;
    Object.keys(groups).sort().reverse().forEach(k => {
      const [y, m] = k.split('-');
      if (y !== year) { year = y; html += `<div class="hyear">${y}</div>`; }
      const list = groups[k];
      const label = new Date(+y, +m - 1, 1).toLocaleDateString('fr-FR', { month: 'long' });
      html += `<div class="motile" data-mo="${k}"><div class="mohead"><b>${label.charAt(0).toUpperCase() + label.slice(1)}</b><span>${list.length} partie${list.length > 1 ? 's' : ''}</span><span class="hchev">›</span></div><div class="molist">${list.map(histCard).join('')}</div></div>`;
    });
    return `<div class="histall"><div class="hahead"><b>Historique des parties</b><span>${all.length} partie${all.length > 1 ? 's' : ''}</span><span class="hchev">›</span></div><div class="habody">${html}</div></div>`;
  }
  function viewStats(mode) {
    mode = mode || S.statsMode || 'avg'; S.statsMode = mode;
    const rounds = myRoundStats().filter(r => r.s.played > 0);
    const full18 = rounds.filter(r => r.s.finished && r.s.holes === 18);
    const nine = rounds.filter(r => r.s.finished && r.s.holes === 9);
    const avg = a => a.length ? (a.reduce((x, y) => x + y, 0) / a.length) : null;
    const f1 = v => v == null ? '–' : (Math.round(v * 10) / 10).toString().replace('.', ',');
    // palmarès (toutes les parties terminées où je joue, y compris en équipe)
    const mine = Object.values(S.games).filter(g => !g.follow && myPlayer(g));
    const played = mine.filter(g => wonGame(g) !== null);
    const wins = played.filter(g => wonGame(g) === true).length;
    const rougesTot = mine.reduce((n, g) => n + rougesIn(g), 0);
    const palmares = `<h2>Palmarès</h2><div class="kpis three"><div><b>🏆 ${wins}</b><small>coupe${wins > 1 ? 's' : ''} remportée${wins > 1 ? 's' : ''}</small></div><div><b>${played.length ? Math.round(wins * 100 / played.length) + '%' : '–'}</b><small>de victoires (${wins}/${played.length})</small></div><div><b>🍺 ${rougesTot}</b><small>rouge${rougesTot > 1 ? 's' : ''} pas dépassé${rougesTot > 1 ? 's' : ''}</small></div></div>`;
    // sélection selon le filtre
    let sel = rounds, single = null;
    if (mode === 'last') { single = rounds[0] || null; sel = single ? [single] : []; }
    if (mode === 'best') { const pool = full18.length ? full18 : rounds.filter(r => r.s.finished); single = pool.slice().sort((a, b) => a.s.toPar - b.s.toPar || (b.g.game.play_date || '').localeCompare(a.g.game.play_date || ''))[0] || null; sel = single ? [single] : []; }
    const byPar = { 3: [], 4: [], 5: [] }; let pick = 0, birdies = 0, pars = 0, bogeys = 0, dbl = 0, holesN = 0;
    const puttsArr = [];
    sel.forEach(r => Object.values(r.s.perHole).forEach(ph => {
      if (ph.gross == null) return; holesN++;
      if (byPar[ph.par]) byPar[ph.par].push(ph.gross - ph.par);
      if (ph.pickup) pick++; else { const d = ph.raw - ph.par; if (d <= -1) birdies++; else if (d === 0) pars++; else if (d === 1) bogeys++; else dbl++; }
      if (ph.putts != null) puttsArr.push(ph.putts);
    }));
    const pct = n => holesN ? Math.round(n * 100 / holesN) + '%' : '–';
    let head = '', kpis = '', spark = '';
    if (single) {
      const r = single, w = wonGame(r.g), rg = rougesIn(r.g);
      head = `<section class="card statround"><b>${esc(r.course.name)}</b><small>${frDate(r.g.game.play_date)} · ${FORMATS[r.g.game.format] || ''} · ${r.s.played}/${r.s.holes} trous${w === true ? ' · 🏆 gagnée' : ''}</small></section>`;
      kpis = `<div class="kpis"><div><b>${r.s.gross}</b><small>brut (${fmtPar(r.s.toPar)})</small></div><div><b>${r.s.points}</b><small>points Stableford</small></div><div><b>${r.s.putts != null ? r.s.putts : '–'}</b><small>putts</small></div><div><b>${f1(avg(puttsArr))}</b><small>putts / trou</small></div><div><b>${pick}</b><small>croix</small></div><div><b>🍺 ${rg}</b><small>rouge${rg > 1 ? 's' : ''}</small></div></div>`;
    } else {
      kpis = `<div class="kpis"><div><b>${rounds.length}</b><small>parties</small></div><div><b>${f1(avg(full18.map(r => r.s.gross)))}</b><small>brut moy. 18 t.</small></div><div><b>${full18.length ? Math.min(...full18.map(r => r.s.gross)) : '–'}</b><small>meilleur 18 t.</small></div><div><b>${f1(avg(full18.map(r => r.s.points)))}</b><small>Stableford moy.</small></div><div><b>${f1(avg(nine.map(r => r.s.gross)))}</b><small>brut moy. 9 t.</small></div><div><b>${f1(avg(puttsArr))}</b><small>putts / trou</small></div></div>`;
      const last = full18.slice(0, 10).reverse();
      const max = Math.max(...last.map(r => r.s.gross), 1), min = Math.min(...last.map(r => r.s.gross), max);
      spark = last.length > 1 ? `<h2>Évolution (10 derniers 18 trous)</h2><svg viewBox="0 0 300 80" class="spark">${(() => { const pts = last.map((r, i) => [10 + i * (280 / (last.length - 1)), 72 - ((r.s.gross - min) / Math.max(1, max - min)) * 50]); return `<polyline fill="none" stroke="var(--g)" stroke-width="3" points="${pts.map(p => p.join(',')).join(' ')}"/>` + pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="var(--g)"/><text x="${p[0]}" y="${p[1] - 8}" text-anchor="middle" font-size="11">${last[i].s.gross}</text>`).join(''); })()}</svg>` : '';
    }
    const body = !sel.length ? '<p class="muted">Pas encore de partie à afficher.</p>' : `${head}${kpis}${spark}
      <h2>${single ? 'Par type de trou' : 'Moyenne par type de trou'}</h2>
      <div class="kpis three">${[3, 4, 5].map(p => `<div><b>${byPar[p].length ? fmtPar(Math.round(avg(byPar[p]) * 100) / 100).replace('.', ',') : '–'}</b><small>par ${p}</small></div>`).join('')}</div>
      <h2>Répartition des trous</h2>
      <div class="bars">${[['Birdie et mieux', birdies, 'birdie'], ['Par', pars, 'par'], ['Bogey', bogeys, 'bogey'], ['Double et plus', dbl, 'dbl'], ['Ramassées', pick, 'pick']].map(([l, n, c]) => `<div class="bar"><span>${l}</span><i class="${c}" style="width:${holesN ? n * 100 / holesN : 0}%"></i><b>${pct(n)}</b></div>`).join('')}</div>`;
    $app.innerHTML = topbar('Mes stats', '#/') + `<main>
      ${palmares}
      ${indexCard()}
      ${trophiesTile()}
      <div class="seg statseg">${[['last', 'Dernière partie'], ['avg', 'Moyenne'], ['best', 'Meilleure']].map(([k, l]) => `<button data-sm="${k}" class="${mode === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${body}
      ${histByMonth()}
    </main>`;
    updateSyncBadge();
    $app.querySelectorAll('[data-sm]').forEach(b => b.onclick = () => viewStats(b.dataset.sm));
    $app.querySelectorAll('[data-mo]').forEach(t => t.querySelector('.mohead').onclick = () => t.classList.toggle('open'));
    const tr = $app.querySelector('.troph'); if (tr) tr.querySelector('.trhead').onclick = () => tr.classList.toggle('open');
    const ha = $app.querySelector('.histall'); if (ha) ha.querySelector('.hahead').onclick = () => ha.classList.toggle('open');
    bindHist($app);
  }

  /* --- Parcours --- */
  function viewCourses() {
    const list = Object.values(allCourses());
    $app.innerHTML = topbar('Parcours', '#/') + `<main>
      ${list.map(c => { const placed = c.holes.filter(h => h.gps && h.gps.center).length; return `<a class="gcard" href="#/course/${encodeURIComponent(c.id)}"><div><b>${esc(c.name)}</b><small>${esc(c.city || '')} · ${c.holes.length} trous · par ${c.holes.reduce((s, h) => s + h.par, 0)}</small><small>Greens GPS : ${placed}/${c.holes.length}</small></div><div class="gscore">›</div></a>${isAdmin() ? `<a class="btn ghost full admbtn" href="#/admin/${encodeURIComponent(c.id)}">🛠️ Ajuster les drapeaux (admin)</a>` : ''}`; }).join('')}
      <button class="btn big full" id="c-new">＋ Nouveau parcours</button>
      <p class="hint">Les parcours (notes, difficultés, GPS des greens) sont partagés avec tous ceux qui utilisent ton serveur.</p></main>`;
    updateSyncBadge();
    $app.querySelector('#c-new').onclick = async () => {
      const name = await fwPrompt('Nom du parcours :'); if (!name) return;
      const n = (await fwChoice('Nombre de trous ?', [['18', '18 trous'], ['9', '9 trous', 'ghost']])) === '9' ? 9 : 18;
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
        <button class="btn ghost full" id="ce-auto">${FW_IC('signal')} Trouver les drapeaux automatiquement (OpenStreetMap)</button>
        <button class="btn big full" id="ce-save">Enregistrer</button>
        <button class="btn ghost full" id="ce-dup">Dupliquer ce parcours</button>
      </main>`;
      updateSyncBadge();
      $app.querySelector('#ce-name').oninput = e => (c.name = e.target.value);
      $app.querySelector('#ce-city').oninput = e => (c.city = e.target.value);
      $app.querySelectorAll('[data-t]').forEach(inp => inp.oninput = e => { const t = c.tees[+e.target.dataset.t]; const f = e.target.dataset.f; t[f] = f === 'name' ? e.target.value : (e.target.value === '' ? null : Number(e.target.value.replace(',', '.'))); });
      $app.querySelectorAll('[data-tdel]').forEach(b => b.onclick = () => { c.tees.splice(+b.dataset.tdel, 1); draw(); });
      $app.querySelector('#ce-tadd').onclick = async () => { const n = await fwPrompt('Nom du repère (ex. Blanc) :'); if (!n) return; c.tees.push({ id: n.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.random().toString(36).slice(2, 4), name: n, sss: null, slope: 113 }); draw(); };
      $app.querySelectorAll('[data-h]').forEach(inp => inp.oninput = e => {
        const h = c.holes[+e.target.dataset.h];
        if (e.target.dataset.d) { h.dist = h.dist || {}; h.dist[e.target.dataset.d] = e.target.value ? Number(e.target.value) : undefined; return; }
        const f = e.target.dataset.f;
        if (f === 'note') h.note = e.target.value;
        else { const v = parseInt(e.target.value, 10); h[f] = isNaN(v) ? (f === 'difficulty' ? null : h[f]) : v; }
      });
      $app.querySelector('#ce-save').onclick = async () => {
        const sis = c.holes.map(h => h.si).sort((a, b) => a - b).join();
        const expect = c.holes.map((_, i) => i + 1).join();
        if (sis !== expect && !await fwConfirm('Les HCP (SI) ne vont pas de 1 à ' + c.holes.length + ' sans doublon. Enregistrer quand même ?')) return;
        saveCourse(c); toast('Parcours enregistré'); location.hash = '#/courses';
      };
      $app.querySelector('#ce-auto').onclick = () => { saveCourse(c); autoFlags(c.id).then(() => viewCourseEdit(encodeURIComponent(c.id))); };
      $app.querySelector('#ce-dup').onclick = () => { const copy = JSON.parse(JSON.stringify(c)); copy.id = c.id + '-' + Math.random().toString(36).slice(2, 5); copy.name = c.name + ' (copie)'; saveCourse(copy); location.hash = '#/course/' + encodeURIComponent(copy.id); };
    };
    draw();
  }

  /* --- Bienvenue (1re installation) --- */

  /* ---------- Classement de la saison (points par mois) ---------- */
  const SEASON_RULES = [['Trou en un', 500], ['Albatros', 250], ['Eagle', 15], ['Birdie', 5], ['Par', 2], ['Bogey', -1], ['Double bogey', -2], ['Triple ou plus', -3], ['Croix', -4], ['Pas passé les rouges', -3], ['Nice shot reçu d\'un pote (3 max / partie)', 2], ['Nice shot donné à un pote (3 max / partie)', 1], ['Participation (par 9 trous)', 5], ['Victoire', 5]];
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const monthKey = d => d.slice(0, 7);
  const monthLabel = k => { const [y, m] = k.split('-'); return MOIS[+m - 1] + ' ' + y; };
  // points d'une partie terminée, découpée en blocs de 9 trous (aller / retour), par joueur inscrit
  function gameBlocks(g) {
    const out = {}; if (g.game.status !== 'done') return out;
    const course = gameCourse(g); if (!course || !course.holes) return out;
    const holes = C.holesFor(g.game.mode, course.holes.length);
    const team = isTeamGame(g);
    const ps = indivPlayers(g).filter(p => p.device_id);
    const sc = scoresOf(g); const ev = g.events || [];
    const blockOf = h => (h <= 9 ? 0 : 1);
    const used = [...new Set(holes.map(blockOf))];
    ps.forEach(p => {
      const rows = sc[p.id] || {};
      const B = {}; used.forEach(k => (B[k] = { pts: 0, det: {}, n: 0, holes: holes.filter(h => blockOf(h) === k) }));
      const add = (h, k, v) => { const b = B[blockOf(h)]; if (!b) return; b.pts += v; b.det[k] = (b.det[k] || 0) + v; };
      const tee = (course.tees || []).find(t => t.id === (p.tee || g.game.tee)) || (course.tees || [])[0];
      const ix = p.idx != null && p.idx !== '' ? Number(p.idx) : null;
      const recv = ix != null && !isNaN(ix) ? C.strokesPerHole(C.playingHandicap(ix, tee, course, g.game.mode), course, g.game.mode) : {};
      holes.forEach(h => {
        const c = rows[h]; if (!c || (c.strokes == null && !c.pickup)) return;
        B[blockOf(h)].n++;
        if (team) return; // en équipe : pas de score individuel
        if (c.pickup) return add(h, 'Croix', -4);
        const par = course.holes[h - 1].par, diff = c.strokes - par - (recv[h] || 0);
        if (c.strokes === 1) add(h, 'Trou en un', 500);
        else if (diff <= -3) add(h, 'Albatros', 250);
        else if (diff === -2) add(h, 'Eagle', 15);
        else if (diff === -1) add(h, 'Birdie', 5);
        else if (diff === 0) add(h, 'Par', 2);
        else if (diff === 1) add(h, 'Bogey', -1);
        else if (diff === 2) add(h, 'Double bogey', -2);
        else add(h, 'Triple ou plus', -3);
      });
      ev.filter(e => e.type === 'rouge' && e.player_id === p.id).forEach(e => add(e.hole || holes[0], 'Rouges', -3));
      // Nice shots « fair-play » : comptent seulement s'ils viennent d'un autre joueur, 1 par trou, 3 max par partie
      const norm = x => (x || '').trim().toLowerCase();
      const recvd = []; const seenH = new Set();
      ev.filter(e => e.player_id === p.id && !['rouge', 'react', 'tournee'].includes(e.type) && norm(e.by_name) && norm(e.by_name) !== norm(p.name)).forEach(e => { if (!seenH.has(e.hole)) { seenH.add(e.hole); recvd.push(e); } });
      recvd.slice(0, 3).forEach(e => add(e.hole || holes[0], 'Nice shots reçus', 2));
      const given = []; const seenG = new Set();
      ev.filter(e => !['rouge', 'react', 'tournee'].includes(e.type) && norm(e.by_name) === norm(p.name) && e.player_id && e.player_id !== p.id).forEach(e => { const k = e.player_id + ':' + e.hole; if (!seenG.has(k)) { seenG.add(k); given.push(e); } });
      given.slice(0, 3).forEach(e => add(e.hole || holes[0], 'Nice shots donnés', 1));
      Object.values(B).forEach(b => { if (b.n >= b.holes.length && b.holes.length) { b.pts += 5; b.det['Participation'] = (b.det['Participation'] || 0) + 5; } });
      out[p.device_id] = { name: p.name, blocks: Object.values(B).filter(b => b.n >= b.holes.length && b.holes.length) };
    });
    // victoire : ajoutée au dernier bloc de la partie
    if (!team && g.game.format !== 'match' && ps.length >= 2) {
      const rows = C.leaderboard(ps, g.game, course, sc).filter(r => r.played);
      if (rows.length >= 2) {
        const key = r => g.game.format === 'stableford' ? -r.points : (g.game.format === 'brut' ? r.toPar : r.netToPar);
        const best = Math.min(...rows.map(key));
        rows.filter(r => key(r) === best).forEach(r => { const p = ps.find(x => x.id === r.playerId); const o = p && out[p.device_id]; const b = o && o.blocks[o.blocks.length - 1]; if (b) { b.pts += 5; b.det['Victoire'] = (b.det['Victoire'] || 0) + 5; } });
      }
    }
    return out;
  }
  const BEST_BLOCKS = 4;
  // classement d'un mois : somme des 4 meilleurs blocs de 9 trous
  function standingsMonth(games, month, allowed) {
    const per = {};
    games.filter(g => (g.game.play_date || '').startsWith(month)).forEach(g => {
      Object.entries(gameBlocks(g)).forEach(([dev, r]) => {
        if (allowed && !allowed.has(dev)) return;
        const t = per[dev] = per[dev] || { dev, name: r.name, blocks: [], games: 0 };
        t.name = r.name; t.games++; r.blocks.forEach(b => t.blocks.push(b));
      });
    });
    return Object.values(per).map(t => {
      const best = t.blocks.slice().sort((a, b) => b.pts - a.pts).slice(0, BEST_BLOCKS);
      const det = {}; best.forEach(b => Object.entries(b.det).forEach(([k, v]) => (det[k] = (det[k] || 0) + v)));
      return { dev: t.dev, name: t.name, games: t.games, nines: t.blocks.length, kept: best.length, pts: best.reduce((a, b) => a + b.pts, 0), det };
    }).sort((a, b) => b.pts - a.pts || b.nines - a.nines);
  }
  function standingsFor(games, period, allowed) {
    if (period.length === 7) return standingsMonth(games, period, allowed);
    // année : cumul des totaux mensuels
    const tot = {};
    for (let m = 1; m <= 12; m++) standingsMonth(games, period + '-' + String(m).padStart(2, '0'), allowed).forEach(r => {
      const t = tot[r.dev] = tot[r.dev] || { dev: r.dev, name: r.name, pts: 0, games: 0, nines: 0, kept: 0, det: {} };
      t.pts += r.pts; t.games += r.games; t.nines += r.nines; t.kept += r.kept; t.name = r.name;
      Object.entries(r.det).forEach(([k, v]) => (t.det[k] = (t.det[k] || 0) + v));
    });
    return Object.values(tot).sort((a, b) => b.pts - a.pts);
  }
  async function fetchSeasonGames(year) {
    let list = Object.values(S.games).filter(g => !g.follow && g.game.status === 'done');
    if (remoteOn() && navigator.onLine) {
      try {
        const { data: games } = await sb.from('games').select('*').eq('status', 'done').gte('play_date', year + '-01-01').lte('play_date', year + '-12-31').limit(500);
        if (games && games.length) {
          const ids = games.map(g => g.id);
          const [{ data: players }, { data: scores }, { data: events }] = await Promise.all([
            sb.from('players').select('*').in('game_id', ids), sb.from('scores').select('*').in('game_id', ids), sb.from('events').select('*').in('game_id', ids)]);
          list = games.map(game => { const g = { game, players: (players || []).filter(p => p.game_id === game.id), scores: {}, events: (events || []).filter(e => e.game_id === game.id) }; (scores || []).filter(r => r.game_id === game.id).forEach(r => { (g.scores[r.player_id] = g.scores[r.player_id] || {})[r.hole] = { strokes: r.strokes, putts: r.putts, pickup: r.pickup }; }); return g; });
        }
      } catch (e) { }
    }
    return list.filter(g => (g.game.play_date || '').startsWith(String(year)));
  }
  async function refreshSeason() {
    const now = today(); const y = now.slice(0, 4);
    const games = await fetchSeasonGames(y);
    let prevGames = games;
    const pm = prevMonthKey(monthKey(now));
    if (!pm.startsWith(y)) prevGames = await fetchSeasonGames(pm.slice(0, 4));
    let allowed = new Set(S.me.season ? [S.me.deviceId] : []);
    if (remoteOn() && navigator.onLine) { try { const { data: pr } = await sb.from('profiles').select('device_id').eq('season', true); if (pr) allowed = new Set(pr.map(r => r.device_id).concat(S.me.season ? [S.me.deviceId] : [])); } catch (e) { } }
    const cups = {};
    for (let m = 1; m < +now.slice(5, 7); m++) { const st = standingsMonth(games, y + '-' + String(m).padStart(2, '0'), allowed); if (st.length && st[0].pts > 0) st.filter(r => r.pts === st[0].pts).forEach(r => (cups[r.dev] = (cups[r.dev] || 0) + 1)); }
    const data = { at: Date.now(), cups, month: monthKey(now), cur: standingsFor(games, monthKey(now), allowed), prevKey: pm, prev: standingsFor(prevGames, pm, allowed), year: y, yearRows: standingsFor(games, y, allowed) };
    LS.set('fw_season', data); return data;
  }
  function prevMonthKey(k) { let [y, m] = k.split('-').map(Number); m--; if (!m) { m = 12; y--; } return y + '-' + String(m).padStart(2, '0'); }
  function seasonStrip(data) {
    if (!data || data.month !== monthKey(today())) return '';
    const rows = data.cur; const i = rows.findIndex(r => r.dev === S.me.deviceId);
    const [y, m] = data.month.split('-').map(Number); const left = new Date(y, m, 0).getDate() - new Date().getDate();
    const lbl = 'Fly Tour · étape de ' + MOIS[m - 1];
    if (i < 0) return `<a class="sstrip" href="#/classement"><span class="rk">–</span><div><b>${lbl}</b><small>${rows.length ? 'Joue une partie pour entrer dans l\'étape' : 'Pas encore de points ce mois-ci'}</small></div><div class="pts"><b>0</b><small>pt</small></div></a>`;
    const me = rows[i]; const ahead = i > 0 ? rows[i - 1] : null;
    const sub = ahead ? `à ${ahead.pts - me.pts} pt${ahead.pts - me.pts > 1 ? 's' : ''} de ${esc(ahead.name)}` : (rows.length > 1 ? `${me.pts - rows[1].pts} pt${me.pts - rows[1].pts > 1 ? 's' : ''} d'avance 👑` : 'en tête 👑');
    return `<a class="sstrip" href="#/classement"><span class="rk">${i + 1}<sup>${i ? 'e' : 'er'}</sup></span><div><b>${lbl}</b><small>${sub} · ${left > 0 ? left + ' jour' + (left > 1 ? 's' : '') + ' restant' + (left > 1 ? 's' : '') : 'dernier jour !'}</small></div><div class="pts"><b>${me.pts}</b><small>pts</small></div></a>`;
  }
  function viewSeason(tab) {
    tab = tab || S.seasonTab || 'cur'; S.seasonTab = tab;
    const data = LS.get('fw_season', null);
    const draw = d => {
      const rows = !d ? [] : tab === 'cur' ? d.cur : tab === 'prev' ? d.prev : d.yearRows;
      const curM = monthKey(today());
      const tabs = [['cur', MOIS[+curM.slice(5) - 1]], ['prev', MOIS[+prevMonthKey(curM).slice(5) - 1]], ['year', 'Saison ' + curM.slice(0, 4)]];
      const podium = rows.length ? `<div class="podium">${[1, 0, 2].map(k => rows[k] ? `<div><span>${k === 0 ? '👑 ' : ''}${esc(rows[k].name)}</span><i class="p${k + 1}">${k + 1}<small>${rows[k].pts} pts</small></i></div>` : '<div></div>').join('')}</div>` : '<p class="muted" style="text-align:center">Pas encore de partie terminée sur cette période.</p>';
      const list = rows.length ? `<div class="slist">${rows.map((r, k) => `<p class="${r.dev === S.me.deviceId ? 'me' : ''}"><span>${k + 1}</span>${esc(r.name)}${tab === 'year' && d.cups && d.cups[r.dev] ? ` <span class="cup">🏆×${d.cups[r.dev]}</span>` : ''}<small>${tab === 'year' ? r.games + ' partie' + (r.games > 1 ? 's' : '') : r.kept + '/' + BEST_BLOCKS + ' × 9 trous'}</small><b>${r.pts} pts</b></p>`).join('')}</div>` : '';
      const mine = rows.find(r => r.dev === S.me.deviceId);
      const det = mine ? `<h2>Mes points</h2><div class="sdet">${Object.entries(mine.det).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span class="${v < 0 ? 'neg' : ''}">${esc(k)} ${v > 0 ? '+' : ''}${v}</span>`).join('')}</div>` : '';
      const rules = `<details class="srules"><summary>Le barème</summary><div class="sdet">${SEASON_RULES.map(([k, v]) => `<span class="${v < 0 ? 'neg' : ''}">${esc(k)} ${v > 0 ? '+' : ''}${v}</span>`).join('')}</div><p class="hint">Chaque 18 trous compte comme deux « 9 trous » (aller et retour). Seuls tes <b>4 meilleurs 9 trous du mois</b> sont retenus : jouer souvent n'est pas obligatoire pour gagner. Scores comptés en net si l'index est renseigné, sinon en brut. Un Nice shot ne compte que s'il est donné par un autre joueur. Seules les parties terminées comptent. Chaque mois est une étape : remise à zéro le 1er, et le premier remporte la <b>Fly Cup</b>. La saison cumule toutes les étapes de l'année.</p></details>`;
      $app.querySelector('main').innerHTML = `<div class="seg statseg">${tabs.map(([k, l]) => `<button data-st="${k}" class="${tab === k ? 'on' : ''}">${l.charAt(0).toUpperCase() + l.slice(1)}</button>`).join('')}</div>${podium}${list}${det}${rules}`;
      $app.querySelectorAll('[data-st]').forEach(b => b.onclick = () => viewSeason(b.dataset.st));
    };
    $app.innerHTML = topbar('Fly Tour', '#/') + '<main><p class="muted">Calcul du classement…</p></main>';
    updateSyncBadge();
    if (data) draw(data);
    refreshSeason().then(d => { if (location.hash === '#/classement') draw(d); });
  }
  // sacre du mois précédent (une fois)
  function checkMonthCrown(d) {
    if (!d || !d.prev || !d.prev.length) return;
    if (LS.get('fw_crown', '') === d.prevKey) return;
    LS.set('fw_crown', d.prevKey);
    const r = d.prev; const el = document.createElement('div'); el.className = 'pop';
    const conf = Array.from({ length: 30 }, (_, i) => `<i style="left:${Math.random() * 100}%;animation-delay:${Math.random() * .6}s;background:${['#ffd400', '#f7c531', '#fff', '#22a052'][i % 4]};transform:rotate(${Math.random() * 360}deg)"></i>`).join('');
    el.innerHTML = `<div class="conf">${conf}</div><div class="popcard"><div class="popemoji">👑</div><div class="popsub">Fly Tour · étape de ${MOIS[+d.prevKey.slice(5) - 1]}</div><div class="poptitle">${esc(r[0].name)} remporte la Fly Cup !</div><div class="popsub">${r[0].pts} pts${r[1] ? ' · 2e ' + esc(r[1].name) + ' (' + r[1].pts + ')' : ''}${r[2] ? ' · 3e ' + esc(r[2].name) + ' (' + r[2].pts + ')' : ''}</div></div>`;
    document.body.appendChild(el); vibrate([40, 60, 40]);
    const close = () => { if (!el.parentNode) return; el.classList.add('out'); setTimeout(() => el.remove(), 300); };
    el.onclick = close; setTimeout(close, 6000);
  }

  /* ---------- Fenêtres de dialogue maison (sans l'adresse du site) ---------- */
  function fwDialog(msg, { input = null, buttons }) {
    return new Promise(res => {
      const el = document.createElement('div'); el.className = 'modal fwdlg';
      el.innerHTML = `<div class="sheet dlg"><p class="dlgmsg">${esc(msg).replace(/ ([?!:;])/g, '\u00a0$1').replace(/\n/g, '<br>')}</p>${input !== null ? `<input class="dlgin" value="${esc(input)}">` : ''}<div class="dlgbtns">${buttons.map((b, i) => `<button class="btn ${b[2] === 'ghost' ? 'ghost' : ''} ${b[2] === 'danger' ? 'danger' : ''}" data-i="${i}">${esc(b[1])}</button>`).join('')}</div></div>`;
      document.body.appendChild(el);
      const inp = el.querySelector('.dlgin');
      const close = v => { el.remove(); res(v); };
      el.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { const bt = buttons[+b.dataset.i]; close(bt[0] === '__input' ? inp.value : bt[0]); });
      el.onclick = e => { if (e.target === el) close(input !== null ? null : buttons[buttons.length - 1][0]); };
      if (inp) { setTimeout(() => { inp.focus(); inp.select(); }, 50); inp.onkeydown = e => { if (e.key === 'Enter') close(inp.value); }; }
    });
  }
  const fwAlert = msg => fwDialog(msg, { buttons: [[true, 'OK']] });
  const fwConfirm = (msg, ok, danger, cancel) => fwDialog(msg, { buttons: [[true, ok || 'OK', danger ? 'danger' : ''], [false, cancel || 'Annuler', 'ghost']] });
  const fwPrompt = (msg, def) => fwDialog(msg, { input: def == null ? '' : String(def), buttons: [['__input', 'OK'], [null, 'Annuler', 'ghost']] });
  const fwChoice = (msg, opts) => fwDialog(msg, { buttons: opts });

  /* ---------- Inviter un nouveau + installation ---------- */
  const APP_URL = 'https://r4c4st.github.io/fairway/';
  const isStandalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); installEvt = e;
    if (document.getElementById('installbar')) return;
    const anchor = document.querySelector('main .tiles') || document.querySelector('.welcome .form');
    if (!anchor) return;
    const tmp = document.createElement('div'); tmp.innerHTML = installBar(); const bar = tmp.firstElementChild; if (!bar) return;
    if (anchor.classList.contains('tiles')) anchor.before(bar); else anchor.after(bar);
    bar.onclick = promptInstall;
  });
  window.addEventListener('appinstalled', () => { installEvt = null; toast('Fly18 est installée 🎉'); const b = document.getElementById('installbar'); if (b) b.remove(); });
  function installBar() {
    if (isStandalone()) return '';
    if (installEvt) return `<button class="installbar" id="installbar">${FW_IC('install')}<span><b>Installer Fly18</b><small>Une icône sur ton écran, comme une vraie appli</small></span><i>›</i></button>`;
    if (isIOS()) return `<div class="installbar ios"><span><b>Installer Fly18 sur iPhone</b><small>Safari → bouton Partager ⬆️ → « Sur l'écran d'accueil »</small></span></div>`;
    return '';
  }
  async function promptInstall() {
    if (!installEvt) return fwAlert('Dans Chrome : menu ⋮ → « Installer l\'application » (ou « Ajouter à l\'écran d\'accueil »).');
    installEvt.prompt();
    try { await installEvt.userChoice; } catch (e) { }
    installEvt = null; const b = document.getElementById('installbar'); if (b) b.remove();
  }
  function inviteSheet() {
    let qr = '';
    try { if (window.qrcode) { const q = window.qrcode(0, 'M'); q.addData(APP_URL); q.make(); qr = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); } } catch (e) { }
    const msg = 'Rejoins-nous sur Fly18 ⛳ — l\'appli golf des copains (scores en direct, GPS, et le dernier paie sa tournée 🍺).\nOuvre ce lien avec Chrome et installe-la : ' + APP_URL;
    const el = document.createElement('div'); el.className = 'modal';
    el.innerHTML = `<div class="sheet invite"><h2 class="rgh">${FW_IC('invite')} Inviter un pote</h2>
      <p class="muted">Il scanne le code avec l'appareil photo de son téléphone : l'appli s'ouvre et lui propose de l'installer.</p>
      <div class="qrbox">${qr || '<p class="muted">QR code indisponible hors connexion</p>'}</div>
      <div class="qrurl">${APP_URL.replace('https://', '')}</div>
      <button class="btn big full" id="iv-share">Envoyer le lien (WhatsApp, SMS…)</button>
      <button class="btn ghost full" id="iv-x">Fermer</button></div>`;
    document.body.appendChild(el);
    el.querySelector('#iv-x').onclick = () => el.remove();
    el.onclick = e => { if (e.target === el) el.remove(); };
    el.querySelector('#iv-share').onclick = async () => {
      if (navigator.share) { try { await navigator.share({ title: 'Fly18', text: msg }); return; } catch (e) { if (e.name === 'AbortError') return; } }
      try { await navigator.clipboard.writeText(msg); toast('Lien copié 📋'); } catch (e) { fwPrompt('Copie ce message :', msg); }
    };
  }

  function viewWelcome() {
    $app.innerHTML = `<main class="welcome"><img class="wlogo" src="${logoURL()}" alt="Fly18"><h1>${WORDMARK}</h1><div class="beta w">Bêta version pour les copains</div><p>Le golf entre potes : scores, Stableford, GPS…<br>et le dernier paie sa tournée 🍺</p>
      <div class="form"><label>Ton prénom / surnom<input id="w-name" autocomplete="nickname"></label>
      <div class="row2"><label>Index (facultatif)<input id="w-idx" inputmode="decimal" placeholder="ex. 19.5"></label><label>Repère habituel<select id="w-tee">${['blanc', 'jaune', 'bleu', 'rouge'].map(t => `<option ${t === 'jaune' ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
      <button class="btn big full" id="w-go">C'est parti</button>
      <button class="btn ghost full" id="w-restore">J'ai déjà un profil</button></div>
      ${installBar()}
      ${!remoteOn() ? '<p class="hint">Serveur non configuré : profil gardé sur ce téléphone seulement.</p>' : ''}</main>`;
    { const ib = $app.querySelector('#installbar'); if (ib) ib.onclick = promptInstall; }
    $app.querySelector('#w-go').onclick = async () => {
      const n = $app.querySelector('#w-name').value.trim(); if (!n) return fwAlert('Ton prénom ?');
      // même prénom déjà inscrit ? c'est peut-être toi sur un autre appareil
      if (remoteOn()) { try { const { data } = await sb.from('profiles').select('device_id').ilike('name', n).neq('device_id', S.me.deviceId).limit(1); if (data && data.length && await fwConfirm('Un copain « ' + n + ' » est déjà inscrit.\nC\'est toi sur un autre appareil (téléphone, PC…) ?', 'Oui, c\'est moi', false, 'Non, quelqu\'un d\'autre')) { $app.querySelector('#w-restore').click(); return; } } catch (e) { } }
      S.me.name = n; S.me.index = $app.querySelector('#w-idx').value.replace(',', '.'); S.me.tee = $app.querySelector('#w-tee').value;
      syncProfile(); route();
    };
    $app.querySelector('#w-restore').onclick = async () => { const c = await fwPrompt('Code de ton profil (Profil > Mon code) :'); if (!c) return; try { await restoreProfile(c); toast('Re-bonjour ' + S.me.name + ' 👋'); route(); } catch (e) { fwAlert(e.message); } };
  }

  /* --- Profil & serveur --- */
  function viewProfile() {
    const tees = ['blanc', 'jaune', 'bleu', 'rouge'];
    $app.innerHTML = topbar('Profil', '#/') + `<main class="form">
      <div class="row2"><label>Nom<input id="p-name" value="${esc(S.me.name)}"></label><label>Index (facultatif)<input id="p-idx" inputmode="decimal" value="${esc(S.me.index)}"></label></div>
      <label class="switch"><input type="checkbox" id="p-big" ${S.me.big ? 'checked' : ''}><span>👓 Mode Frounzy<small>Gros caractères, gros boutons, écran simplifié (aussi via Aa en haut d'une partie)</small></span></label>
      <label class="switch"><input type="checkbox" id="p-detect" ${S.me.detect ? 'checked' : ''}><span>📍 Détecter mon arrivée au golf<small>Message de bienvenue à l'ouverture de l'appli, à moins de 2 km d'un parcours (1 fois par jour)</small></span></label>
      <label class="switch"><input type="checkbox" id="p-visible" ${S.me.visible ? 'checked' : ''}><span>🟢 Apparaître en ligne<small>Les potes voient un point vert à côté de ton prénom (et ton parcours quand tu joues)</small></span></label>
      <label class="switch"><input type="checkbox" id="p-season" ${S.me.season ? 'checked' : ''}><span>🏆 Fly Tour<small>Le classement entre potes : une étape par mois, une Fly Cup au vainqueur (tes 4 meilleurs 9 trous)</small></span></label>
      <label class="switch"><input type="checkbox" id="p-follow" ${S.me.follow ? 'checked' : ''}><span>🔭 Suivre mes potes<small>Pop-ups et tournée des parties de mes partenaires, même sans être invité</small></span></label>
      <label>Couleur</label>
      <div class="colors">${Object.entries(window.FW_PALETTES || {}).map(([k, p]) => `<button data-col="${k}" class="${S.me.color === k ? 'on' : ''}" title="${esc(p.name)}"><i style="background:linear-gradient(135deg,${p.g},${p.gd})"></i><small>${esc(p.name)}</small></button>`).join('')}</div>
      <label>Logo</label>
      <div class="logos">${Object.keys(window.FW_LOGOS || {}).map(k => `<button data-lg="${k}" class="${S.me.logo === k ? 'on' : ''}"><img src="${window.fwLogoURL(k, S.me.color)}" alt=""><small>${esc(window.FW_LOGO_NAMES[k])}</small></button>`).join('')}</div>
      <label>Apparence</label>
      <div class="seg" id="p-theme">${[['auto', '📱 Auto'], ['light', '☀️ Clair'], ['dark', '🌙 Sombre']].map(([k, v]) => `<button data-th="${k}" class="${S.me.theme === k ? 'on' : ''}">${v}</button>`).join('')}</div>
      <p class="hint">🌙 Sombre : vrai noir, économise la batterie sur les écrans OLED. ☀️ Clair : plus lisible en plein soleil.</p>
      <label>Croix en stroke play (par défaut)<select id="p-xcap">${[2, 3, 4, 5, 6].map(n => `<option value="${n}" ${n === Number(S.me.xcap) ? 'selected' : ''}>par + ${n}${n === 2 ? ' (double bogey)' : n === 3 ? ' (triple bogey)' : ''}</option>`).join('')}</select></label>
      <label>Repère habituel<select id="p-tee">${tees.map(t => `<option ${t === S.me.tee ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <h2>Mes distances (carry, m)</h2>
      <div class="bag">${S.me.bag.map((b, i) => `<label>${esc(b.club)}<input data-b="${i}" inputmode="numeric" value="${b.dist || ''}"></label>`).join('')}</div>
      <p class="hint">Remplis seulement les clubs que tu as dans ton sac (laisse vide les autres). Servent à proposer le club selon la distance au green.</p>
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
      <a class="btn ghost full" href="#/copains">👥 Les copains inscrits</a>
      <h2>Mon code profil</h2>
      <div class="code small">${esc(S.me.code)}</div>
      <p class="hint">Note-le : si tu changes de téléphone ou réinstalles l'appli, ce code récupère ton profil, tes partenaires et tes parties.</p>
      <button class="btn ghost full" id="p-restore">J'ai déjà un profil (saisir un code)</button>
      <h2>Fichier de secours</h2>
      <div class="row2"><button class="btn ghost" id="p-exp">Exporter mes données</button><label class="btn ghost filebtn">Importer<input type="file" id="p-imp" accept="application/json" hidden></label></div>
    </main>`;
    updateSyncBadge();
    $app.querySelectorAll('[data-col]').forEach(b => b.onclick = () => { S.me.color = b.dataset.col; saveMe(); applyTheme(); viewProfile(); });
    $app.querySelectorAll('[data-lg]').forEach(b => b.onclick = () => { S.me.logo = b.dataset.lg; saveMe(); applyTheme(); $app.querySelectorAll('[data-lg]').forEach(x => x.classList.toggle('on', x === b)); });
    $app.querySelectorAll('[data-th]').forEach(b => b.onclick = () => { S.me.theme = b.dataset.th; saveMe(); applyTheme(); $app.querySelectorAll('[data-th]').forEach(x => x.classList.toggle('on', x === b)); });
    $app.querySelector('#p-xcap').onchange = e => { S.me.xcap = Number(e.target.value); saveMe(); toast('Croix = par + ' + S.me.xcap + ' pour tes prochaines parties'); };
    $app.querySelector('#p-big').onchange = e => { S.me.big = e.target.checked; saveMe(); applyBig(); };
    $app.querySelector('#p-detect').onchange = e => { S.me.detect = e.target.checked; saveMe(); startDetect(); toast(S.me.detect ? '📍 Détection activée' : 'Détection coupée'); };
    $app.querySelector('#p-visible').onchange = e => { S.me.visible = e.target.checked; saveMe(); trackPresence(); toast(S.me.visible ? 'Tu apparais en ligne 🟢' : 'Mode invisible 👻'); };
    $app.querySelector('#p-season').onchange = e => { S.me.season = e.target.checked; S.me.seasonAsked = 1; syncProfile(); LS.set('fw_season', null); toast(S.me.season ? 'Bienvenue sur le Fly Tour 🏆' : 'Fly Tour désactivé'); };
    $app.querySelector('#p-follow').onchange = e => { S.me.follow = e.target.checked; syncProfile(); pullFollowGames(); toast(S.me.follow ? 'Tu suis tes potes 🔭' : 'Suivi des potes coupé'); };
    $app.querySelector('#p-bknow').onclick = async () => { await doBackup(); toast(S.lastBackup ? 'Sauvegardé ☁️' : 'Sauvegarde impossible (connexion ?)'); };
    $app.querySelector('#p-bkrest').onclick = async () => { if (!sb) return fwAlert('Serveur non configuré.'); const ok = await restoreBackup(S.me.deviceId).catch(() => false); toast(ok ? 'Données restaurées 👍' : 'Aucune sauvegarde trouvée'); viewProfile(); };
    $app.querySelector('#p-restore').onclick = async () => { const c = await fwPrompt('Code de ton profil :'); if (!c) return; try { await restoreProfile(c); toast('Profil récupéré 👍'); viewProfile(); } catch (e) { fwAlert(e.message); } };
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
      r.onload = () => { try { const d = JSON.parse(r.result); if (d.courses) Object.assign(S.customCourses, d.courses); if (d.games) Object.assign(S.games, d.games); if (d.me) S.me = { ...d.me, deviceId: d.me.deviceId || S.me.deviceId }; saveCourses(); saveGames(); saveMe(); toast('Données importées'); viewProfile(); } catch (err) { fwAlert('Fichier invalide'); } };
      r.readAsText(f);
    };
  }

  /* ---------- Démarrage ---------- */
  initRemote();
  if (remoteOn()) {
    pullCourses().then(() => { if (/^#\/(courses|course|game)/.test(location.hash)) route(); });
    flush();
    if (S.me.name) syncProfile();
    pullMyGames().then(pullFollowGames).then(scheduleBackup).then(replayOpenGames).then(() => setTimeout(checkTrophies, 2500));
    startPresence();
    pullCopains();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') trackPresence(); });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      flush();
      // au réveil : on recharge la partie ouverte (scores saisis par les autres pendant la veille) et on relance le direct
      const m = location.hash.match(/^#\/game\/([^/]+)/);
      if (m && S.games[m[1]]) refreshGame(m[1]).then(ok => { if (ok) liveRender(); subscribe(m[1]); });
      pullMyGames().then(pullFollowGames).then(replayOpenGames);
    });
  }
  route();
  startDetect();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
    reg.update();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update(); });
  }).catch(() => { });
  // nouvelle version installée : on recharge une fois, proprement
  if ('serviceWorker' in navigator) { let reloaded = false; navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloaded || !navigator.serviceWorker.controller) return; reloaded = true; if (!document.querySelector('.modal,.pop,.beer')) location.reload(); }); }
  window.__fairway = S; // debug
})();
