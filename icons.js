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
    tournee: `<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#fff4d6" stroke="#d98a00" stroke-width="2.5"/><path d="M15 15h15l-1.4 19a2.6 2.6 0 0 1-2.6 2.4h-7a2.6 2.6 0 0 1-2.6-2.4z" fill="#f5b400"/><path d="M30 19h2.5a4 4 0 0 1 4 4v3a4 4 0 0 1-4 4H29.4" fill="none" stroke="#d98a00" stroke-width="2.6"/><path d="M15 15h15l-1.4 19a2.6 2.6 0 0 1-2.6 2.4h-7a2.6 2.6 0 0 1-2.6-2.4z" fill="none" stroke="#d98a00" stroke-width="2.4" stroke-linejoin="round"/><path d="M13.5 15.5c0-3.5 3-5 5.5-4 1.5-2.5 5.5-2.5 7 0 2.5-1 5 .5 5 4z" fill="#fff" stroke="#d98a00" stroke-width="2" stroke-linejoin="round"/><g fill="#fff" opacity=".8"><circle cx="19" cy="25" r="1.3"/><circle cx="23.5" cy="29.5" r="1"/><circle cx="25" cy="22" r="1.1"/></g></svg>`,
    // Beau coup : pièce d'or
    gold: `<svg viewBox="0 0 48 48"><defs><linearGradient id="icGo1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3a8"/><stop offset=".45" stop-color="#f7c531"/><stop offset="1" stop-color="#b37a00"/></linearGradient><linearGradient id="icGo2" x1="1" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ffe680"/><stop offset=".5" stop-color="#e3a814"/><stop offset="1" stop-color="#a86d00"/></linearGradient></defs><circle cx="24" cy="25.5" r="21" fill="#6b4500" opacity=".35"/><circle cx="24" cy="24" r="21" fill="url(#icGo1)"/><circle cx="24" cy="24" r="16.5" fill="url(#icGo2)" stroke="#fff2b0" stroke-width="1.2" stroke-opacity=".7"/><circle cx="24" cy="24" r="18.6" fill="none" stroke="#a86d00" stroke-width="1" stroke-dasharray="1.2 1.6" opacity=".6"/><path d="M24 13.5l3.1 6.4 7 .9-5.1 4.8 1.3 6.9L24 29.2l-6.3 3.3 1.3-6.9-5.1-4.8 7-.9z" fill="#fff6c4" stroke="#b37a00" stroke-width="1.2" stroke-linejoin="round"/><path d="M11 17a14 14 0 0 1 9-7" stroke="#fff" stroke-width="2.4" stroke-linecap="round" fill="none" opacity=".7"/></svg>`,
    // Rouges : croix blanche
    croix: `<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="21" fill="#e5161d"/><circle cx="24" cy="24" r="19.5" fill="none" stroke="#fff" stroke-width="2.6"/><path d="M16.5 16.5l15 15M31.5 16.5l-15 15" stroke="#7a0c10" stroke-width="7" stroke-linecap="round" opacity=".35" transform="translate(0 1.2)"/><path d="M16.5 16.5l15 15M31.5 16.5l-15 15" stroke="#fff" stroke-width="6" stroke-linecap="round"/></svg>`,
    // Pas passé les rouges : bouton d'urgence
    urgence: `<svg viewBox="0 0 48 48"><defs><radialGradient id="icUrg" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="#ff7b72"/><stop offset=".5" stop-color="#e5161d"/><stop offset="1" stop-color="#8c0a0e"/></radialGradient><pattern id="icHaz" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#ffcc00"/><rect width="3" height="6" fill="#1a1a1a"/></pattern></defs><circle cx="24" cy="24" r="23" fill="url(#icHaz)"/><circle cx="24" cy="24" r="17.5" fill="#ffcc00" stroke="#1a1a1a" stroke-width="1.5"/><circle cx="24" cy="25.5" r="13" fill="#5a0508"/><circle cx="24" cy="23.5" r="13" fill="url(#icUrg)"/><ellipse cx="20" cy="17.5" rx="6" ry="3.2" fill="#fff" opacity=".5"/></svg>`,
    // Installer : téléphone + flèche
    install: `<svg viewBox="0 0 48 48"><rect x="12" y="3" width="24" height="42" rx="5" fill="#1f2a36"/><rect x="15" y="8" width="18" height="30" rx="2" fill="#e8f5ec"/><circle cx="24" cy="41.5" r="1.6" fill="#8a95a5"/><path d="M24 13v14M18.5 22l5.5 5.5 5.5-5.5" fill="none" stroke="#27ae60" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 32h12" stroke="#27ae60" stroke-width="3.2" stroke-linecap="round"/></svg>`,
    // Inviter : QR code
    invite: `<svg viewBox="0 0 48 48"><g fill="#1f2a36"><path d="M5 5h15v15H5zM9 9v7h7V9zM28 5h15v15H28zM32 9v7h7V9zM5 28h15v15H5zM9 32v7h7v-7z"/><rect x="11" y="11" width="3" height="3" fill="#fff"/><path d="M24 5h3v4h-3zM24 12h3v6h-3zM28 24h4v3h-4zM36 24h7v3h-7zM24 24h3v8h-3zM24 36h3v7h-3z"/></g><rect x="28" y="28" width="15" height="15" rx="3.5" fill="#27ae60"/><path d="M35.5 31.5v8M31.5 35.5h8" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>`,
    // Rejoindre : maillons propres
    join: `<svg viewBox="0 0 48 48"><g fill="none" stroke-width="5" stroke-linecap="round"><path d="M21 27l6-6" stroke="#7a8696"/><path d="M19.5 17.5l3-3a8 8 0 0 1 11.3 11.3l-3 3" stroke="#2f80ed"/><path d="M28.5 30.5l-3 3a8 8 0 0 1-11.3-11.3l3-3" stroke="#56ccf2"/></g></svg>`
  };
  window.FW_IC = (name, cls) => (I[name] || '').replace('<svg ', `<svg class="ic ${cls || ''}" aria-hidden="true" `);
})();
