/* Parcours fournis avec l'appli. Les positions GPS des greens sont à placer
   (sur la carte ou sur place avec « Placer ici ») : elles sont alors partagées. */
window.BUILTIN_COURSES = [
  {
    id: 'nancy-pulnoy',
    name: 'UGOLF Grand Nancy-Pulnoy',
    city: 'Pulnoy (54)',
    center: { lat: 48.70251, lng: 6.26012 },
    tees: [
      { id: 'blanc', name: 'Blanc', color: '#f4f4f4', sss: 71.6, slope: 139 },
      { id: 'jaune', name: 'Jaune', color: '#f2c200', sss: 69.6, slope: 129 },
      { id: 'bleu', name: 'Bleu', color: '#2f6fd6', sss: null, slope: 125 },
      { id: 'rouge', name: 'Rouge', color: '#d83a3a', sss: null, slope: 122 }
    ],
    holes: [
      { n: 1, par: 5, si: 11, dist: { blanc: 439, jaune: 422, bleu: 370, rouge: 355 } },
      { n: 2, par: 4, si: 15, dist: { blanc: 343, jaune: 312, bleu: 274, rouge: 274 } },
      { n: 3, par: 4, si: 13, dist: { blanc: 355, jaune: 316, bleu: 305, rouge: 289 } },
      { n: 4, par: 5, si: 5, dist: { blanc: 453, jaune: 430, bleu: 389, rouge: 370 } },
      { n: 5, par: 3, si: 1, dist: { blanc: 187, jaune: 182, bleu: 159, rouge: 140 } },
      { n: 6, par: 4, si: 7, dist: { blanc: 276, jaune: 270, bleu: 243, rouge: 208 } },
      { n: 7, par: 4, si: 3, dist: { blanc: 390, jaune: 360, bleu: 337, rouge: 322 } },
      { n: 8, par: 3, si: 17, dist: { blanc: 140, jaune: 135, bleu: 122, rouge: 114 } },
      { n: 9, par: 5, si: 9, dist: { blanc: 508, jaune: 433, bleu: 425, rouge: 394 },
        difficulty: 4, note: "Eau sur le 2e coup. Après un bon drive, layup fer + wedge pour assurer le bogey, ne pas tenter le bois vers l'eau." },
      { n: 10, par: 4, si: 12, dist: { blanc: 345, jaune: 316, bleu: 306, rouge: 283 } },
      { n: 11, par: 4, si: 6, dist: { blanc: 326, jaune: 301, bleu: 275, rouge: 255 } },
      { n: 12, par: 5, si: 18, dist: { blanc: 436, jaune: 421, bleu: 412, rouge: 380 } },
      { n: 13, par: 3, si: 16, dist: { blanc: 163, jaune: 141, bleu: 115, rouge: 115 } },
      { n: 14, par: 4, si: 2, dist: { blanc: 310, jaune: 293, bleu: 271, rouge: 257 },
        difficulty: 4, note: 'Bois en jeu. Si tu y es : ressortir au plus sûr, ne pas sauver le par.' },
      { n: 15, par: 4, si: 4, dist: { blanc: 315, jaune: 306, bleu: 272, rouge: 259 },
        difficulty: 5, note: "Hors-limites à gauche à 3-4 m du départ, terrain qui penche à droite sur 170 m, piquets rouges. Viser la marge à droite ; fer 7/8 souple (~140 m) plutôt que driver." },
      { n: 16, par: 3, si: 8, dist: { blanc: 163, jaune: 142, bleu: 142, rouge: 136 } },
      { n: 17, par: 4, si: 14, dist: { blanc: 288, jaune: 288, bleu: 248, rouge: 248 } },
      { n: 18, par: 5, si: 10, dist: { blanc: 420, jaune: 370, bleu: 370, rouge: 324 } }
    ]
  }
];

/* Sac standard (carry en mètres, vide = club non utilisé), du Driver au LW */
window.STD_CLUBS = ['Driver', 'Bois 3', 'Bois 5', 'Bois 7', 'Hybride 3', 'Hybride 4', 'Hybride 5', 'Fer 4', 'Fer 5', 'Fer 6', 'Fer 7', 'Fer 8', 'Fer 9', 'PW', 'GW', 'SW', 'LW'];
window.DEFAULT_BAG = window.STD_CLUBS.map(club => ({ club, dist: 0 }));
