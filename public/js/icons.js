// Resource and action SVG icons. Pure strings so we can inject anywhere.
(function () {
  // Minimalist line icons — single color, inherits from CSS (color: currentColor).
  const base = (body, size = 16) =>
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="color:currentColor">${body}</svg>`;

  const icons = {
    // tree
    wood:  base(`<path d="M12 3 L5 12 L9 12 L5 18 L10 18 L10 21 L14 21 L14 18 L19 18 L15 12 L19 12 Z" fill="currentColor" fill-opacity="0.15"/>`),
    // brick stack
    brick: base(`<rect x="3" y="7"  width="18" height="4" rx="0.5" fill="currentColor" fill-opacity="0.15"/><rect x="3" y="13" width="18" height="4" rx="0.5" fill="currentColor" fill-opacity="0.15"/><line x1="9" y1="7"  x2="9" y2="11"/><line x1="15" y1="7" x2="15" y2="11"/><line x1="6" y1="13" x2="6" y2="17"/><line x1="12" y1="13" x2="12" y2="17"/><line x1="18" y1="13" x2="18" y2="17"/>`),
    // sheep face
    sheep: base(`<ellipse cx="12" cy="14" rx="7" ry="5" fill="currentColor" fill-opacity="0.15"/><circle cx="15.5" cy="10.5" r="2.5" fill="currentColor"/>`),
    // wheat ears
    wheat: base(`<path d="M12 3 L12 21"/><path d="M12 7 Q8 6 7 9"/><path d="M12 7 Q16 6 17 9"/><path d="M12 11 Q8 10 7 13"/><path d="M12 11 Q16 10 17 13"/><path d="M12 15 Q8 14 7 17"/><path d="M12 15 Q16 14 17 17"/>`),
    // mountain
    ore:   base(`<path d="M3 19 L10 7 L14 13 L18 9 L21 19 Z" fill="currentColor" fill-opacity="0.15"/>`),
    // scroll (paper)
    paper: base(`<rect x="5" y="4" width="14" height="16" rx="1" fill="currentColor" fill-opacity="0.1"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="14" y2="16"/>`),
    // cloth diamond
    cloth: base(`<path d="M4 7 Q12 3 20 7 L20 17 Q12 21 4 17 Z" fill="currentColor" fill-opacity="0.1"/>`),
    // coin
    coin:  base(`<circle cx="12" cy="12" r="8" fill="currentColor" fill-opacity="0.1"/><path d="M9 10 Q12 7 15 10 Q12 12 15 14 Q12 17 9 14"/>`),
    // dev card
    dev:   base(`<rect x="5" y="3" width="14" height="18" rx="2" fill="currentColor" fill-opacity="0.1"/><circle cx="12" cy="12" r="3"/>`),
    // knight (shield)
    knight:base(`<path d="M12 3 L5 6 L5 12 Q5 17 12 21 Q19 17 19 12 L19 6 Z" fill="currentColor" fill-opacity="0.1"/>`),
    // road
    road:  base(`<path d="M3 12 L21 12" stroke-width="3"/><path d="M6 12 L8 12 M11 12 L13 12 M16 12 L18 12" stroke="rgba(255,255,255,0.6)"/>`),
    // settlement house
    settle:base(`<path d="M4 20 L4 12 L12 5 L20 12 L20 20 Z" fill="currentColor" fill-opacity="0.15"/>`),
    // city
    city:  base(`<path d="M3 20 L3 14 L8 10 L8 7 L14 7 L14 11 L20 15 L20 20 Z" fill="currentColor" fill-opacity="0.15"/>`),
  };

  window.Icons = icons;
})();
