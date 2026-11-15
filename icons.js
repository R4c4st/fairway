/* Fairway — jeu d'icônes maison (SVG), cohérent et net à toutes les tailles */
(function () {
  // roue crantée : 10 dents, générée proprement
  function gearPath(cx, cy, rOut, rIn, teeth) {
    let d = '';
    const step = Math.PI * 2 / teeth, tw = step * 0.26;
    for (let i = 0; i < teeth; i++) {
      const a = i * step - Math.PI / 2;
      const pts = [[a - step / 2 + tw * 0.15, rIn], [a - tw, rIn], [a - tw * 0.72, rOut], [a + tw * 0.72, rOut], [a + tw, rIn], [a + step / 2 - tw * 0.15, rIn]];
      pts.forEach(([ang, r], j) => { const x = (cx + r * Math.cos(ang)).toFixed(2), y = (cy + r * Math.sin(ang)).toFixed(2); d += (i === 0 && j === 0 ? 'M' : 'L') + x + ' ' + y + ' '; });
    }
    return d + 'Z';
  }
  const GEAR = gearPath(24, 24, 21, 16.5, 10);
  const I = {
    // Parcours : green + drapeau
    parcours: `<svg viewBox="0 0 48 48"><ellipse cx="24" cy="37" rx="20" ry="7.5" fill="#3fae5f"/><ellipse cx="24" cy="36" rx="20" ry="6.5" fill="#56c271"/><ellipse cx="27.5" cy="36.5" rx="3.6" ry="1.5" fill="#1d4d2b"/><rect x="26.2" y="6" width="2.4" height="30.5" rx="1.2" fill="#f2f2f2"/><path d="M28.6 6.5 L42 11.5 L28.6 16.5 Z" fill="#e53935"/><circle cx="14" cy="34.5" r="3.2" fill="#fff"/></svg>`,
    // Stats : barres pleines, couleurs unies
    stats: `<svg viewBox="0 0 48 48"><rect x="6" y="26" width="9" height="16" rx="2.5" fill="#2f80ed"/><rect x="19.5" y="14" width="9" height="28" rx="2.5" fill="#27ae60"/><rect x="33" y="6" width="9" height="36" rx="2.5" fill="#f2994a"/></svg>`,
    // Live : pastille rouge pulsée
    live: `<svg viewBox="0 0 48 48" class="ic-live"><circle class="p1" cx="24" cy="24" r="23" fill="#ff3b30" opacity=".14"/><circle class="p2" cx="24" cy="24" r="19" fill="#ff3b30" opacity=".28"/><circle cx="24" cy="24" r="15" fill="#ff1f1f"/><text x="24" y="28.2" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-weight="900" font-size="11.5" fill="#fff" letter-spacing=".3">LIVE</text></svg>`,
    // Beau coup : gros bouton rouge
    shot: `<svg viewBox="0 0 48 48"><defs><radialGradient id="icShot" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="#ff8a80"/><stop offset=".45" stop-color="#ef2b2b"/><stop offset="1" stop-color="#9b0f12"/></radialGradient></defs><circle cx="24" cy="25.5" r="21" fill="#5c0a0c" opacity=".35"/><circle cx="24" cy="24" r="21" fill="#2a2a2e"/><circle cx="24" cy="24" r="17" fill="url(#icShot)"/><ellipse cx="19" cy="16" rx="8" ry="4.5" fill="#fff" opacity=".45"/><path d="M24 15.5l2.4 5 5.4.6-4 3.7 1.1 5.3L24 27.5l-4.9 2.6 1.1-5.3-4-3.7 5.4-.6z" fill="#fff"/></svg>`,
    // Trouver les drapeaux : signal / radar autour d'un drapeau
    signal: `<svg viewBox="0 0 48 48"><defs><linearGradient id="icSig" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#00c6ff"/><stop offset="1" stop-color="#7b5cff"/></linearGradient></defs><g fill="none" stroke="url(#icSig)" stroke-linecap="round" stroke-width="4"><path d="M3 24a24 24 0 0 1 42 0" opacity=".35"/><path d="M10 27a16 16 0 0 1 28 0" opacity=".65"/><path d="M17 30a8 8 0 0 1 14 0"/></g><rect x="22.8" y="29" width="2.4" height="15" rx="1.2" fill="#555c66"/><path d="M25.2 29.5 L34 33 L25.2 36.5 Z" fill="#e53935"/><ellipse cx="24" cy="44.5" rx="7" ry="1.8" fill="#555c66" opacity=".35"/></svg>`,
    // Ajuster précisément : roue crantée + mire
    gear: `<svg viewBox="0 0 48 48"><defs><linearGradient id="icGear" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8a95a5"/><stop offset="1" stop-color="#3d4654"/></linearGradient></defs><path d="${GEAR}" fill="url(#icGear)"/><circle cx="24" cy="24" r="10.5" fill="#fff"/><circle cx="24" cy="24" r="7" fill="none" stroke="#e53935" stroke-width="1.8"/><path d="M24 14.5v5M24 28.5v5M14.5 24h5M28.5 24h5" stroke="#e53935" stroke-width="1.8" stroke-linecap="round"/><circle cx="24" cy="24" r="1.6" fill="#e53935"/></svg>`,
    // Réglages : roue crantée simple (accueil)
    settings: `<svg viewBox="0 0 48 48"><defs><linearGradient id="icSet" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8a95a5"/><stop offset="1" stop-color="#3d4654"/></linearGradient></defs><path d="${GEAR}" fill="url(#icSet)"/><circle cx="24" cy="24" r="7.5" fill="#fff"/></svg>`,
    // La tournée : deux verres qui trinquent, trait fin ambré
    tournee: `<svg viewBox="0 0 48 48"><g fill="none" stroke="#d98a00" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"><g transform="rotate(-14 16 28)"><path d="M9 14h14l-1.6 22a3 3 0 0 1-3 2.8h-4.8a3 3 0 0 1-3-2.8z"/><path d="M10 22h12"/></g><g transform="rotate(14 32 28)"><path d="M25 14h14l-1.6 22a3 3 0 0 1-3 2.8h-4.8a3 3 0 0 1-3-2.8z"/><path d="M26 22h12"/></g><path d="M24 4v4M17 6l2 3M31 6l-2 3"/></g><g fill="#f5b400" opacity=".9"><path d="M11.3 23.3h10.4l-1.1 13.1a2 2 0 0 1-2 1.8h-4.6a2 2 0 0 1-2-1.8z" transform="rotate(-14 16 28)"/><path d="M26.3 23.3h10.4l-1.1 13.1a2 2 0 0 1-2 1.8h-4.6a2 2 0 0 1-2-1.8z" transform="rotate(14 32 28)"/></g></svg>`,
    // Rejoindre : maillons propres
    join: `<svg viewBox="0 0 48 48"><g fill="none" stroke-width="5" stroke-linecap="round"><path d="M21 27l6-6" stroke="#7a8696"/><path d="M19.5 17.5l3-3a8 8 0 0 1 11.3 11.3l-3 3" stroke="#2f80ed"/><path d="M28.5 30.5l-3 3a8 8 0 0 1-11.3-11.3l3-3" stroke="#56ccf2"/></g></svg>`
  };
  window.FW_IC = (name, cls) => (I[name] || '').replace('<svg ', `<svg class="ic ${cls || ''}" aria-hidden="true" `);
})();
