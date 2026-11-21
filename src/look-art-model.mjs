// A Folk's portrait drawn from parts: the five rank uniforms and hats, faces, hair, what it wears and what it earned.
// Flat vector art on a 128 x 128 canvas, each shape lit on its left half. Pure: no game globals.

const RANKS = {
newbie: {"defs":"<clipPath id=\"c111\"><rect x=\"64\" y=\"-10\" width=\"200\" height=\"200\"/></clipPath><clipPath id=\"c112\"><rect x=\"64\" y=\"-10\" width=\"200\" height=\"200\"/></clipPath><clipPath id=\"c113\"><rect x=\"64\" y=\"-10\" width=\"200\" height=\"200\"/></clipPath><clipPath id=\"c114\"><rect x=\"34\" y=\"0\" width=\"60\" height=\"46\"/></clipPath><clipPath id=\"c115\"><rect x=\"64\" y=\"-10\" width=\"200\" height=\"200\"/></clipPath><clipPath id=\"c116\"><rect x=\"64\" y=\"-10\" width=\"200\" height=\"200\"/></clipPath>","body":"<path fill=\"#3DBE6B\" d=\"M18,128 L18,110 Q18,92 38,86 L56,80 L72,80 L90,86 Q110,92 110,110 L110,128 Z\"/><path fill=\"#1F9A4C\" clip-path=\"url(#c111)\" d=\"M18,128 L18,110 Q18,92 38,86 L56,80 L72,80 L90,86 Q110,92 110,110 L110,128 Z\"/><path d=\"M44,84 L52,128 L56,128 L50,84 Z\" fill=\"#fff\" opacity=\"0.25\"/><rect x=\"72\" y=\"98\" width=\"18\" height=\"9\" rx=\"2\" fill=\"#fff\"/><rect x=\"75\" y=\"101.5\" width=\"12\" height=\"2\" rx=\"1\" fill=\"#1F9A4C\"/>","hat":"<path fill=\"#3DBE6B\" d=\"M38,38 A26,26 0 0 1 90,38 Z\"/><path fill=\"#1F9A4C\" clip-path=\"url(#c115)\" d=\"M38,38 A26,26 0 0 1 90,38 Z\"/><rect x=\"60.62\" y=\"12\" width=\"6.76\" height=\"15.6\" rx=\"2.6\" fill=\"#fff\" opacity=\"0.28\"/><rect fill=\"#1F9A4C\" x=\"30.2\" y=\"35.4\" width=\"67.6\" height=\"6.76\" rx=\"3.38\"/><rect fill=\"#197e3e\" clip-path=\"url(#c116)\" x=\"30.2\" y=\"35.4\" width=\"67.6\" height=\"6.76\" rx=\"3.38\"/><path d=\"M38,41 L34,46 M90,41 L94,46\" stroke=\"#F2B27E\" stroke-width=\"0\" fill=\"none\"/>"},
junior: {"defs":"<clipPath id=\"c117\"><rect x=\"84\" y=\"-10\" width=\"200\" height=\"200\"/></clipPath><clipPath id=\"c118\"><rect x=\"64\" y=\"-10\" width=\"200\" height=\"200\"/></clipPath><clipPath id=\"c119\"><rect x=\"64\" y=\"-10\" width=\"200\" height=\"200\"/></clipPath><clipPath id=\"c120\"><rect x=\"64\" y=\"-10\" width=\"200\" height=\"200\"/></clipPath><clipPath id=\"c121\"><rect x=\"64\" y=\"-10\" width=\"200\" height=\"200\"/></clipPath><clipPath id=\"c122\"><rect x=\"34\" y=\"0\" width=\"60\" height=\"47\"/></clipPath><clipPath id=\"c123\"><rect x=\"64\" y=\"-10\" width=\"200\" height=\"200\"/></clipPath><clipPath id=\"c124\"><rect x=\"64\" y=\"-10\" width=\"200\" height=\"200\"/></clipPath>","body":"<path fill=\"#4FC4D1\" d=\"M18,128 L18,110 Q18,92 38,86 L56,80 L72,80 L90,86 Q110,92 110,110 L110,128 Z\"/><path fill=\"#2E98A4\" clip-path=\"url(#c118)\" d=\"M18,128 L18,110 Q18,92 38,86 L56,80 L72,80 L90,86 Q110,92 110,110 L110,128 Z\"/><rect fill=\"#A8743F\" x=\"18\" y=\"114\" width=\"92\" height=\"12\"/><rect fill=\"#7D5230\" clip-path=\"url(#c119)\" x=\"18\" y=\"114\" width=\"92\" height=\"12\"/><rect x=\"18\" y=\"114\" width=\"92\" height=\"12\" fill=\"none\" stroke=\"#5A3920\" stroke-width=\"1.5\"/><rect x=\"58\" y=\"113\" width=\"12\" height=\"14\" rx=\"2\" fill=\"#CF9A1E\"/><rect x=\"61\" y=\"116\" width=\"6\" height=\"8\" rx=\"1\" fill=\"#F2C94C\"/><g transform=\"translate(37 119.5) rotate(-80) scale(0.82) translate(-33 -108)\"><path d=\"M30.5,124 L30.5,107.5 C26,105.5 24.5,99 27,92.5 L30.5,92.5 L30.5,97.5 L33,99.5 L35.5,97.5 L35.5,92.5 L39,92.5 C41.5,99 40,105.5 35.5,107.5 L35.5,124 Q33,126 30.5,124 Z\" fill=\"#C3CAD6\"/><rect x=\"32\" y=\"108\" width=\"2\" height=\"14\" rx=\"1\" fill=\"#8F99A8\"/></g><rect x=\"42\" y=\"113\" width=\"4.5\" height=\"14\" rx=\"1\" fill=\"#5A3920\"/><rect x=\"90\" y=\"116\" width=\"12\" height=\"10\" rx=\"2\" fill=\"#5A3920\"/>","hat":"<path fill=\"#4FC4D1\" d=\"M38,38 A26,26 0 0 1 90,38 Z\"/><path fill=\"#2E98A4\" clip-path=\"url(#c123)\" d=\"M38,38 A26,26 0 0 1 90,38 Z\"/><rect x=\"60.62\" y=\"12\" width=\"6.76\" height=\"15.6\" rx=\"2.6\" fill=\"#fff\" opacity=\"0.28\"/><rect fill=\"#2E98A4\" x=\"30.2\" y=\"35.4\" width=\"67.6\" height=\"6.76\" rx=\"3.38\"/><rect fill=\"#257c86\" clip-path=\"url(#c124)\" x=\"30.2\" y=\"35.4\" width=\"67.6\" height=\"6.76\" rx=\"3.38\"/><path d=\"M40,44 Q44,70 54,78 M88,44 Q84,70 74,78\" stroke=\"#22727b\" stroke-width=\"2\" fill=\"none\"/>"},
middle: {"defs":"<clipPath id=\"c125\"><rect x=\"64\" y=\"-10\" width=\"200\" height=\"200\"/></clipPath><clipPath id=\"c126\"><rect x=\"30\" y=\"-10\" width=\"200\" height=\"200\"/></clipPath><clipPath id=\"c127\"><rect x=\"98\" y=\"-10\" width=\"200\" height=\"200\"/></clipPath><clipPath id=\"c128\"><rect x=\"64\" y=\"-10\" width=\"200\" height=\"200\"/></clipPath><clipPath id=\"c129\"><rect x=\"64\" y=\"-10\" width=\"200\" height=\"200\"/></clipPath><clipPath id=\"c130\"><rect x=\"34\" y=\"0\" width=\"60\" height=\"46\"/></clipPath><clipPath id=\"c131\"><rect x=\"64\" y=\"-10\" width=\"200\" height=\"200\"/></clipPath><clipPath id=\"c132\"><rect x=\"64\" y=\"-10\" width=\"200\" height=\"200\"/></clipPath><clipPath id=\"c133\"><rect x=\"64\" y=\"-10\" width=\"200\" height=\"200\"/></clipPath>","body":"<path fill=\"#6B7483\" d=\"M18,128 L18,110 Q18,92 38,86 L56,80 L72,80 L90,86 Q110,92 110,110 L110,128 Z\"/><path fill=\"#515A69\" clip-path=\"url(#c125)\" d=\"M18,128 L18,110 Q18,92 38,86 L56,80 L72,80 L90,86 Q110,92 110,110 L110,128 Z\"/><path fill=\"#E6C244\" d=\"M18,128 L18,110 Q18,92 38,86 L50,82 L44,128 Z\"/><path fill=\"#CB961C\" clip-path=\"url(#c126)\" d=\"M18,128 L18,110 Q18,92 38,86 L50,82 L44,128 Z\"/><path fill=\"#E6C244\" d=\"M110,128 L110,110 Q110,92 90,86 L78,82 L84,128 Z\"/><path fill=\"#CB961C\" clip-path=\"url(#c127)\" d=\"M110,128 L110,110 Q110,92 90,86 L78,82 L84,128 Z\"/><path d=\"M22,104 L44,100 L44,108 L22,112 Z\" fill=\"#E3E7EE\"/><path d=\"M22,117 L44,113 L44,121 L22,125 Z\" fill=\"#E3E7EE\"/><path d=\"M84,104 L108,100 L108,108 L84,112 Z\" fill=\"#E3E7EE\"/><path d=\"M84,117 L108,113 L108,121 L84,125 Z\" fill=\"#E3E7EE\"/>","hat":"<path fill=\"#E6C244\" d=\"M38,38 A26,26 0 0 1 90,38 Z\"/><path fill=\"#CB961C\" clip-path=\"url(#c131)\" d=\"M38,38 A26,26 0 0 1 90,38 Z\"/><rect x=\"60.62\" y=\"12\" width=\"6.76\" height=\"15.6\" rx=\"2.6\" fill=\"#fff\" opacity=\"0.28\"/><rect fill=\"#CB961C\" x=\"30.2\" y=\"35.4\" width=\"67.6\" height=\"6.76\" rx=\"3.38\"/><rect fill=\"#a67a16\" clip-path=\"url(#c132)\" x=\"30.2\" y=\"35.4\" width=\"67.6\" height=\"6.76\" rx=\"3.38\"/><circle fill=\"#C3CAD6\" cx=\"64\" cy=\"28\" r=\"7\"/><circle fill=\"#8F99A8\" clip-path=\"url(#c133)\" cx=\"64\" cy=\"28\" r=\"7\"/><circle cx=\"64\" cy=\"28\" r=\"4\" fill=\"#fff\"/><circle cx=\"62.5\" cy=\"26.5\" r=\"1.5\" fill=\"#FFF8D6\"/>"},
senior: {"defs":"<clipPath id=\"c134\"><rect x=\"64\" y=\"-10\" width=\"200\" height=\"200\"/></clipPath><clipPath id=\"c135\"><rect x=\"90\" y=\"-10\" width=\"200\" height=\"200\"/></clipPath><clipPath id=\"c136\"><rect x=\"64\" y=\"-10\" width=\"200\" height=\"200\"/></clipPath><clipPath id=\"c137\"><rect x=\"64\" y=\"-10\" width=\"200\" height=\"200\"/></clipPath><clipPath id=\"c138\"><rect x=\"34\" y=\"0\" width=\"60\" height=\"46\"/></clipPath><clipPath id=\"c139\"><rect x=\"64\" y=\"-10\" width=\"200\" height=\"200\"/></clipPath><clipPath id=\"c140\"><rect x=\"64\" y=\"-10\" width=\"200\" height=\"200\"/></clipPath>","body":"<path fill=\"#D45F5C\" d=\"M18,128 L18,110 Q18,92 38,86 L56,80 L72,80 L90,86 Q110,92 110,110 L110,128 Z\"/><path fill=\"#A83E3C\" clip-path=\"url(#c134)\" d=\"M18,128 L18,110 Q18,92 38,86 L56,80 L72,80 L90,86 Q110,92 110,110 L110,128 Z\"/><path d=\"M56,80 L64,94 L72,80 L68,86 L60,86 Z\" fill=\"#fff\" opacity=\"0.9\"/><path d=\"M56,80 L48,92 L60,86 Z M72,80 L80,92 L68,86 Z\" fill=\"#8e3433\"/><circle fill=\"#F2C94C\" cx=\"90\" cy=\"104\" r=\"7\"/><circle fill=\"#CF9A1E\" clip-path=\"url(#c135)\" cx=\"90\" cy=\"104\" r=\"7\"/><polygon points=\"90,100 91.06,102.54 93.8,102.76 91.71,104.56 92.35,107.24 90,105.8 87.65,107.24 88.29,104.56 86.2,102.76 88.94,102.54\" fill=\"#FFF8D6\"/><rect x=\"24\" y=\"96\" width=\"10\" height=\"18\" rx=\"2\" fill=\"#35343B\"/><rect x=\"27\" y=\"84\" width=\"2\" height=\"13\" rx=\"1\" fill=\"#35343B\"/><rect x=\"26\" y=\"99\" width=\"6\" height=\"3\" rx=\"1\" fill=\"#D9534F\"/>","hat":"<path fill=\"#D45F5C\" d=\"M38,38 A26,26 0 0 1 90,38 Z\"/><path fill=\"#A83E3C\" clip-path=\"url(#c139)\" d=\"M38,38 A26,26 0 0 1 90,38 Z\"/><rect x=\"60.62\" y=\"12\" width=\"6.76\" height=\"15.6\" rx=\"2.6\" fill=\"#fff\" opacity=\"0.28\"/><rect fill=\"#A83E3C\" x=\"30.2\" y=\"35.4\" width=\"67.6\" height=\"6.76\" rx=\"3.38\"/><rect fill=\"#893231\" clip-path=\"url(#c140)\" x=\"30.2\" y=\"35.4\" width=\"67.6\" height=\"6.76\" rx=\"3.38\"/><path d=\"M40,30 A26,26 0 0 1 88,30 L86,34 A24,24 0 0 0 42,34 Z\" fill=\"#fff\" opacity=\"0.85\"/>"},
expert: {"defs":"<clipPath id=\"c141\"><rect x=\"64\" y=\"-10\" width=\"200\" height=\"200\"/></clipPath><clipPath id=\"c142\"><rect x=\"85\" y=\"-10\" width=\"200\" height=\"200\"/></clipPath><clipPath id=\"c143\"><rect x=\"64\" y=\"-10\" width=\"200\" height=\"200\"/></clipPath><clipPath id=\"c144\"><rect x=\"64\" y=\"-10\" width=\"200\" height=\"200\"/></clipPath><clipPath id=\"c145\"><rect x=\"34\" y=\"0\" width=\"60\" height=\"45\"/></clipPath><clipPath id=\"c146\"><rect x=\"64\" y=\"-10\" width=\"200\" height=\"200\"/></clipPath><clipPath id=\"c147\"><rect x=\"64\" y=\"-10\" width=\"200\" height=\"200\"/></clipPath>","body":"<path fill=\"#5A4668\" d=\"M18,128 L18,110 Q18,92 38,86 L56,80 L72,80 L90,86 Q110,92 110,110 L110,128 Z\"/><path fill=\"#3F3049\" clip-path=\"url(#c141)\" d=\"M18,128 L18,110 Q18,92 38,86 L56,80 L72,80 L90,86 Q110,92 110,110 L110,128 Z\"/><path d=\"M54,80 L64,100 L74,80 Z\" fill=\"#fff\"/><path d=\"M60,82 L64,88 L68,82 L66,104 L64,108 L62,104 Z\" fill=\"#B9A1CC\"/><rect x=\"18\" y=\"92\" width=\"14\" height=\"7\" rx=\"2\" fill=\"#F2C94C\"/><rect x=\"20\" y=\"94\" width=\"10\" height=\"3\" rx=\"1\" fill=\"#CF9A1E\"/><rect x=\"96\" y=\"92\" width=\"14\" height=\"7\" rx=\"2\" fill=\"#F2C94C\"/><rect x=\"98\" y=\"94\" width=\"10\" height=\"3\" rx=\"1\" fill=\"#CF9A1E\"/><rect x=\"82\" y=\"106\" width=\"6\" height=\"10\" fill=\"#D9534F\"/><rect x=\"85\" y=\"106\" width=\"3\" height=\"10\" fill=\"#4A90E2\"/><circle fill=\"#F2C94C\" cx=\"85\" cy=\"120\" r=\"5\"/><circle fill=\"#CF9A1E\" clip-path=\"url(#c142)\" cx=\"85\" cy=\"120\" r=\"5\"/>","hat":"<path fill=\"#B9A1CC\" d=\"M38,38 A26,26 0 0 1 90,38 Z\"/><path fill=\"#7E5F8E\" clip-path=\"url(#c146)\" d=\"M38,38 A26,26 0 0 1 90,38 Z\"/><rect x=\"60.62\" y=\"12\" width=\"6.76\" height=\"15.6\" rx=\"2.6\" fill=\"#fff\" opacity=\"0.28\"/><rect fill=\"#7E5F8E\" x=\"30.2\" y=\"35.4\" width=\"67.6\" height=\"6.76\" rx=\"3.38\"/><rect fill=\"#674d74\" clip-path=\"url(#c147)\" x=\"30.2\" y=\"35.4\" width=\"67.6\" height=\"6.76\" rx=\"3.38\"/><rect x=\"30.2\" y=\"35.4\" width=\"67.6\" height=\"3\" rx=\"1.5\" fill=\"#F2C94C\"/><polygon points=\"64,22 65.59,25.82 69.71,26.15 66.57,28.83 67.53,32.85 64,30.7 60.47,32.85 61.43,28.83 58.29,26.15 62.41,25.82\" fill=\"#F2C94C\"/>"},
};
const RANK_IDS = ['newbie', 'junior', 'middle', 'senior', 'expert'];

const SKINS = [
  { hi: '#F6DCC4', mid: '#E6BE9E', low: '#C3A186', ink: '#35343B', lip: '#C97B5A', dot: '#CF9C7C', scar: '#B9705F' },
  { hi: '#F4C9B8', mid: '#E3A796', low: '#C08A7B', ink: '#35343B', lip: '#BE6E58', dot: '#CE8F7E', scar: '#AE5F52' },
  { hi: '#FBD3A6', mid: '#F2B27E', low: '#CD976B', ink: '#35343B', lip: '#B9654A', dot: '#D9956B', scar: '#B4604C' },
  { hi: '#E8B98A', mid: '#D49A66', low: '#B48256', ink: '#302E35', lip: '#A9573F', dot: '#B97F50', scar: '#9A4F3A' },
  { hi: '#D6B27F', mid: '#BC9462', low: '#9E7C50', ink: '#2E2C32', lip: '#9C5A3D', dot: '#A87F52', scar: '#8A5236' },
  { hi: '#C98C63', mid: '#A86F49', low: '#8E5E3E', ink: '#2A272C', lip: '#7A3A2A', dot: '#8F5B39', scar: '#E6B596' },
  { hi: '#B27650', mid: '#925B3A', low: '#7A4B2F', ink: '#242126', lip: '#5F2D20', dot: '#7D4C30', scar: '#E0AE90' },
  { hi: '#9C6644', mid: '#7F4F32', low: '#683F27', ink: '#1E1B1F', lip: '#47231A', dot: '#6A3F27', scar: '#D9A384' },
  { hi: '#6E452E', mid: '#573522', low: '#452919', ink: '#141214', lip: '#D08A74', dot: '#4A2B1B', scar: '#C8947A' },
];
const HAIR_COLORS = [
  { hi: '#4E4D58', lo: '#383740', brow: '#2B2A30' },
  { hi: '#6A4428', lo: '#4F3220', brow: '#3F2818' },
  { hi: '#A5512F', lo: '#82391F', brow: '#6E2F19' },
  { hi: '#E0913F', lo: '#C27228', brow: '#9B5A1E' },
  { hi: '#EAC76A', lo: '#CFA544', brow: '#A9853A' },
  { hi: '#9A9BA3', lo: '#7C7D85', brow: '#6B6C74' },
  { hi: '#E4E6EA', lo: '#C6C9D0', brow: '#9FA2AA' },
  { hi: '#3FA7A0', lo: '#2C827C', brow: '#256D68' },
  { hi: '#8E62C4', lo: '#6F489F', brow: '#5B3A85' },
];
const HAIR_STYLES = ['Cropped', 'Swept fringe', 'Bob', 'Long', 'Curls', 'Braids', 'Ponytail', 'Shaved'];
const BEARDS = ['None', 'Stubble', 'Moustache', 'Goatee', 'Full beard'];
const EXTRAS = ['None', 'Freckles', 'Glasses', 'Earrings'];
const COLORS = [
  { c: '#D9483B' }, { c: '#F08A3C' }, { c: '#F2C94C' }, { c: '#3FB56A' },
  { c: '#3F8FE0' }, { c: '#9B6BE0' }, { c: '#E870A8' }, { c: '#F2F4F6' },
];

const shade = (hex, f) => {
  const n = parseInt(hex.slice(1), 16);
  const part = (v) => Math.round(v * f).toString(16).padStart(2, '0');
  return `#${part(n >> 16)}${part((n >> 8) & 255)}${part(n & 255)}`;
};
/** One shape, its right half in the darker colour: the portraits' flat split shade. */
const split = (tag, attrs, light, dark) => `<${tag} fill="${light}" ${attrs}/><${tag} fill="${dark}" clip-path="url(#r)" ${attrs}/>`;
const path = (d, light, dark) => split('path', `d="${d}"`, light, dark);
/** A left-side shape and its mirror, lit on the left and shaded on the right. */
const pair = (d, light, dark) => `<path fill="${light}" d="${d}"/><path fill="${dark}" transform="matrix(-1 0 0 1 128 0)" d="${d}"/>`;
const pairDots = (list, light, dark) => list.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${light}"/><circle cx="${128 - x}" cy="${y}" r="${r}" fill="${dark}"/>`).join('');
const star = (cx, cy, R, r) => {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const k = i % 2 === 0 ? R : r;
    pts.push(`${(cx + k * Math.cos(a)).toFixed(2)},${(cy + k * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
};

const hairParts = (style, c) => {
  const cap = `<g clip-path="url(#h46)">${split('ellipse', 'cx="64" cy="52" rx="23" ry="25"', c.hi, c.lo)}</g>`;
  const none = { back: '', drape: '', side: '', front: '' };
  switch (HAIR_STYLES[style]) {
    case 'Cropped': return { ...none, front: cap };
    case 'Swept fringe': return { ...none, front: cap + path('M42,40 L86,40 Q86,47 77,47 Q67,52 54,48 Q47,52 42,47 Z', c.hi, c.lo) };
    case 'Bob': return {
      ...none,
      back: path('M40,42 Q35,62 41,75 L87,75 Q93,62 88,42 Z', c.lo, shade(c.lo, 0.88)),
      side: pair('M41,40 Q35,58 40,73 Q45,78 50,73 Q45,62 46,51 Q46,45 49,42 Z', c.hi, c.lo),
      front: path('M42,40 L86,40 L85,48 Q75,50 64,48 Q53,50 43,48 Z', c.hi, c.lo),
    };
    case 'Long': return {
      back: path('M39,40 Q30,70 33,104 Q41,110 50,104 Q50,92 53,84 L75,84 Q78,92 78,104 Q87,110 95,104 Q98,70 89,40 Z', c.hi, c.lo),
      drape: pair('M38,58 Q30,78 33,104 Q41,110 50,104 Q50,92 53,84 L52,58 Z', c.hi, c.lo),
      side: pair('M41,42 Q36,58 40,73 Q46,68 46,54 Q46,47 51,43 Z', c.hi, c.lo),
      front: pair('M64,41 L42,41 L42,53 Q51,51 64,44 Z', c.hi, c.lo),
    };
    case 'Curls': return {
      drape: '',
      side: pairDots([[39, 45, 7.5], [35, 54, 7.5], [36, 64, 7.5], [41, 72, 6]], c.hi, c.lo),
      front: pairDots([[46, 45, 4.8], [53, 44.5, 4.8], [60, 44.5, 4.8]], c.hi, c.lo) + `<circle cx="64" cy="45" r="4.2" fill="${c.hi}"/>`,
    };
    case 'Braids': {
      const links = [[39, 62, 5], [37, 70, 5.2], [36, 78, 5.2], [36, 86, 5], [37, 94, 4.6]];
      const ties = `<rect x="33" y="98" width="8" height="3.4" rx="1.4" fill="#F2F4F6"/><rect x="87" y="98" width="8" height="3.4" rx="1.4" fill="#C9CDD4"/>`;
      const tufts = pair('M33,101.5 L41,101.5 L39,108 L35,108 Z', c.hi, c.lo);
      return { drape: pairDots(links, c.hi, c.lo) + tufts + ties, side: pair('M42,42 Q37,50 39,60 L45,57 Q44,49 48,43 Z', c.hi, c.lo), front: cap };
    }
    case 'Ponytail': return {
      drape: `<path fill="${c.lo}" d="M84,42 Q107,46 106,71 Q105,90 94,100 Q93,85 92,73 Q91,58 84,54 Z"/><path fill="${c.hi}" opacity="0.55" d="M92,50 Q101,58 101,72 Q101,82 97,90 Q97,74 95,64 Q94,56 90,51 Z"/>`,
      side: '',
      front: cap,
    };
    default: return none;
  }
};

const beardPart = (kind, c, skin) => {
  const hairMoustache = (fill) => `<path d="M51,63 Q58,58 64,63 Q70,58 77,63 Q70,67.5 64,64.5 Q58,67.5 51,63 Z" fill="${fill}"/>`;
  switch (BEARDS[kind]) {
    case 'Stubble': return { art: `<path fill="${c.lo}" opacity="0.38" d="M43,59 Q45,76 64,77 Q83,76 85,59 Q81,67 73,65 Q64,61 55,65 Q47,67 43,59 Z"/>`, mouth: 65 };
    case 'Moustache': return { art: hairMoustache(c.lo), mouth: 70 };
    case 'Goatee': return { art: path('M56,71 Q64,75 72,71 L71,78 Q64,83 57,78 Z', c.hi, c.lo), mouth: 65 };
    case 'Full beard': return {
      art: path('M42,55 Q42,79 64,82 Q86,79 86,55 Q83,62 78,62 Q73,58 64,60 Q55,58 50,62 Q45,62 42,55 Z', c.hi, c.lo) + hairMoustache(shade(c.lo, 0.86)),
      mouth: 71,
      mouthColor: skin.lip,
    };
    default: return { art: '', mouth: 65 };
  }
};

// Carried on the back: drawn before the uniform, in the open space beside the head.
const gearBehind = (gear) => {
  let s = '';
  if (gear.includes('bell')) {
    s += '<path d="M100,104 L105,61 L116,61" stroke="#7D5230" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M116,61 L116,66" stroke="#5F3E24" stroke-width="2"/>';
    s += '<path d="M109,80 Q110,67 116,65 Q122,67 123,80 L125,83 L107,83 Z" fill="#F2C94C"/><path d="M116,65 Q122,67 123,80 L125,83 L116,83 Z" fill="#CF9A1E"/><circle cx="116" cy="85.5" r="2.4" fill="#A87A14"/>';
  }
  return s;
};

const gearOnBody = (gear) => {
  let s = '';
  if (gear.includes('apron')) {
    s += '<path d="M51,81 L46,95 M77,81 L82,95" stroke="#7D5230" stroke-width="3" fill="none"/>';
    s += path('M45,94 L83,94 L88,128 L40,128 Z', '#C98B4E', '#A86F3A');
    s += '<path d="M50,114 L78,114 L78,122 Q64,126 50,122 Z" fill="#7D5230" opacity="0.55"/>';
    s += '<circle cx="61" cy="103" r="3" fill="#46C774"/><circle cx="67" cy="103" r="3" fill="#2FA257"/><circle cx="61" cy="109" r="3" fill="#46C774"/><circle cx="67" cy="109" r="3" fill="#2FA257"/><circle cx="64" cy="106" r="1.5" fill="#FFF3B0"/>';
  }
  // Tucked under the arm, mostly outside the body, so it hides no badge or medal.
  if (gear.includes('ledger')) {
    s += '<g transform="rotate(6 112 118)"><rect x="103" y="107" width="19" height="25" rx="2" fill="#16696C"/><rect x="103" y="107" width="4.5" height="25" rx="1.5" fill="#0F4F52"/><rect x="110.5" y="112" width="7.5" height="7.5" rx="1" fill="none" stroke="#F2C94C" stroke-width="1.5"/><rect x="119.5" y="109" width="2.5" height="21" fill="#EFE7D2"/></g>';
  }
  return s;
};

// Held under the left arm, in front of the sleeve, the Ledger's counterpart on the other side.
const charterHeld = (gear) => !gear.includes('charter') ? '' : '<g transform="rotate(-7 15 118)"><rect x="8.5" y="102" width="13" height="32" rx="6" fill="#F0E2BE"/><rect x="8.5" y="102" width="6.5" height="32" rx="3.2" fill="#FFF3D6"/><ellipse cx="15" cy="104.6" rx="4.4" ry="2.1" fill="#CDBB8F"/><rect x="7.5" y="114" width="15" height="4.6" fill="#C23B33"/><circle cx="15" cy="116.3" r="3.8" fill="#E0564C"/></g>';

const marksOnBody = (marks, stripes, rank) => {
  let s = '';
  // A ribbon bar on the chest: clear of sleeves, radios, vest strips and epaulettes on every rank.
  if (marks.includes('service')) {
    const apprentice = rank === 'junior';
    const x = apprentice ? (marks.includes('mastery') && marks.includes('anchor') ? 83.5 : 70.5) : 69.5;
    const y = apprentice ? 106.8 : 110.5;
    s += `<rect x="${x}" y="${y}" width="11" height="6.6" rx="1.2" fill="#2A2F36"/>`;
    for (let i = 0; i < stripes; i++) s += `<rect x="${x + 5.5 + (i - (stripes - 1) / 2) * 3.1 - 0.95}" y="${y + 1.2}" width="1.9" height="4.2" rx="0.4" fill="#F2C94C"/>`;
  }
  // A band around the left arm, cut to the sleeve's outline, at the height each uniform leaves free.
  if (marks.includes('armband')) {
    const [d, cx] = { newbie: [0, 27], junior: [-2, 27], middle: [-12, 29], senior: [13, 27], expert: [0, 27] }[rank];
    s += `<g clip-path="url(#sleeve)"><path d="M14,${103 + d} Q26,${106.5 + d} 37,${104 + d} L37,${112 + d} Q26,${114.5 + d} 14,${111 + d} Z" fill="#D9483B"/><path d="M14,${109.6 + d} Q26,${113.1 + d} 37,${110.6 + d} L37,${112 + d} Q26,${114.5 + d} 14,${111 + d} Z" fill="#AD3329"/><polygon points="${star(cx, 108.6 + d, 2.7, 1.1)}" fill="#FFF3D6"/></g>`;
  }
  if (marks.includes('mastery')) s += `<circle cx="52" cy="109" r="4.6" fill="#2A2F36"/><polygon points="${star(52, 109, 3.9, 1.7)}" fill="#F2C94C"/>`;
  if (marks.includes('anchor')) {
    // Two pins stack, except on the Apprentice, whose belt takes the lower spot: there the second goes across the chest.
    const both = marks.includes('mastery');
    const x = both && rank === 'junior' ? 76 : 52;
    const y = both && rank !== 'junior' ? 119.5 : 109;
    s += `<circle cx="${x}" cy="${y}" r="4.6" fill="#1D4E89"/><path d="M${x},${y - 3.2} L${x},${y + 3.2} M${x - 2.8},${y + 1} Q${x},${y + 5} ${x + 2.8},${y + 1} M${x - 1.9},${y - 1.9} L${x + 1.9},${y - 1.9}" stroke="#fff" stroke-width="1.2" fill="none" stroke-linecap="round"/>`;
  }
  return s;
};

/** The whole portrait as an SVG string. */
function render(look) {
  const l = { rank: 'newbie', skin: 1, hair: 0, hairColor: 1, beard: 0, extra: 0, color: -1, colorAt: 'scarf', gear: [], marks: [], stripes: 2, ...look };
  const rank = RANKS[l.rank];
  const skin = SKINS[l.skin];
  const c = HAIR_COLORS[l.hairColor];
  const hair = hairParts(l.hair, c);
  const beard = beardPart(l.beard, c, skin);
  const colored = l.color >= 0 ? COLORS[l.color].c : null;
  const colorDark = colored ? shade(colored, 0.76) : null;
  const patch = l.marks.includes('patch');

  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs>${rank.defs}<clipPath id="r"><rect x="64" y="-10" width="200" height="200"/></clipPath><clipPath id="sleeve"><path d="M18,128 L18,110 Q18,92 38,86 L56,80 L72,80 L90,86 Q110,92 110,110 L110,128 Z"/></clipPath><clipPath id="h46"><rect x="34" y="0" width="60" height="46"/></clipPath></defs>`;
  // Back to front: what is carried on the back, uniform, what is worn on it, hair behind the neck, neck and neckwear, then hair falling over them.
  s += gearBehind(l.gear) + rank.body + gearOnBody(l.gear) + marksOnBody(l.marks, l.stripes, l.rank) + charterHeld(l.gear) + (hair.back ?? '');
  s += path('M54,66 L74,66 L74,82 Q64,90 54,82 Z', skin.mid, skin.low);
  if (colored && l.colorAt === 'scarf') {
    s += path('M58,91 L64,108 L70,91 Z', colored, colorDark);
    s += path('M49,78 Q64,90 79,78 L84,85 Q64,101 44,85 Z', colored, colorDark);
  }
  if (l.gear.includes('whistle')) {
    s += '<path d="M51,82 Q56,98 64,102 Q72,98 77,82" stroke="#E3E7EE" stroke-width="1.6" fill="none"/>';
    s += '<rect x="58" y="102" width="12" height="7" rx="3" fill="#F2C94C"/><rect x="64" y="102" width="6" height="7" rx="3" fill="#CF9A1E"/><circle cx="61" cy="105.5" r="1.5" fill="#6E5210"/>';
  }
  s += hair.drape;
  s += split('ellipse', 'cx="64" cy="52" rx="22" ry="24"', skin.hi, skin.mid);
  if (!['Bob', 'Long', 'Curls'].includes(HAIR_STYLES[l.hair])) s += `<ellipse cx="41" cy="54" rx="4" ry="5.5" fill="${skin.hi}"/><ellipse cx="87" cy="54" rx="4" ry="5.5" fill="${skin.mid}"/>`;
  s += hair.side;
  if (EXTRAS[l.extra] === 'Freckles') s += [[52, 60], [56, 61], [60, 60], [68, 60], [72, 61], [76, 60]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1" fill="${skin.dot}"/>`).join('');
  s += `<circle cx="56" cy="53" r="2.6" fill="${skin.ink}"/><circle cx="56.9" cy="52.1" r="0.8" fill="#fff"/>`;
  if (!patch) s += `<circle cx="72" cy="53" r="2.6" fill="${skin.ink}"/><circle cx="72.9" cy="52.1" r="0.8" fill="#fff"/>`;
  s += `<path d="M52,47 Q56,44.5 60,47 M68,47 Q72,44.5 76,47" stroke="${c.brow}" stroke-width="1.9" fill="none" stroke-linecap="round"/>`;
  s += beard.art;
  // On the cheek, clear of the eye, and above a beard so it stays visible.
  if (l.marks.includes('scar')) s += `<path d="M46.5,57 L52.5,67" stroke="${skin.scar}" stroke-width="1.5" stroke-linecap="round"/><path d="M46.8,61.3 L50.2,59.3 M48.8,64.7 L52.2,62.7" stroke="${skin.scar}" stroke-width="1.1" stroke-linecap="round"/>`;
  s += `<path d="M59,${beard.mouth} Q64,${beard.mouth + 5} 69,${beard.mouth}" stroke="${beard.mouthColor ?? skin.lip}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
  if (EXTRAS[l.extra] === 'Glasses') s += `<circle cx="56" cy="53" r="7" fill="none" stroke="#35343B" stroke-width="1.8"/><circle cx="72" cy="53" r="7" fill="none" stroke="#35343B" stroke-width="1.8"/><path d="M63,53 L65,53 M49,52 L42,50 M79,52 L86,50" stroke="#35343B" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
  if (patch) s += '<path d="M42,44 L86,60" stroke="#1B1A1E" stroke-width="1.7"/><ellipse cx="72" cy="54" rx="6.6" ry="6" fill="#1B1A1E"/><ellipse cx="70" cy="52" rx="2" ry="1.4" fill="#4A4950"/>';
  if (EXTRAS[l.extra] === 'Earrings') s += '<circle cx="41" cy="61.5" r="2.3" fill="#F2C94C"/><circle cx="87" cy="61.5" r="2.3" fill="#CF9A1E"/>';
  s += hair.front;
  let hat = rank.hat;
  if (l.gear.includes('hardhat')) {
    let n = 0;
    hat = hat.replace(/fill="#[0-9A-Fa-f]{6}"((?: clip-path="url\(#[a-z0-9]+\)")? d="M38,38 A26,26)/g, (m, rest) => `fill="${n++ === 0 ? '#FFDC5A' : '#E2A516'}"${rest}`);
  }
  s += hat;
  if (colored && l.colorAt === 'band') {
    s += split('rect', 'x="30.2" y="35.4" width="67.6" height="6.76" rx="3.38"', colored, colorDark);
    if (l.rank === 'expert') s += '<rect x="30.2" y="35.4" width="67.6" height="2.4" rx="1.2" fill="#F2C94C"/>';
  }
  if (l.gear.includes('hardhat')) s += `<polygon points="${star(83, 17, 6, 1.5)}" fill="#FFF8D6"/><polygon points="${star(92, 25, 3, 0.8)}" fill="#FFF8D6"/>`;
  return `${s}</svg>`;
}

const url = (look) => `data:image/svg+xml,${encodeURIComponent(render(look))}`;

const seeded = (text) => {
  let h = 2166136261;
  for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return () => {
    h = (h + 0x6D2B79F5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
/** The look a Folk is hired with: decided by its id, so it never changes unless the player changes it. */
const lookFrom = (id) => {
  const r = seeded(id);
  const pick = (n) => Math.floor(r() * n);
  const hairColor = (() => { const x = r(); return x < 0.24 ? 0 : x < 0.5 ? 1 : x < 0.62 ? 2 : x < 0.72 ? 3 : x < 0.84 ? 4 : x < 0.92 ? 5 : x < 0.97 ? 6 : x < 0.985 ? 7 : 8; })();
  const beard = r() < 0.55 ? 0 : 1 + pick(BEARDS.length - 1);
  const extra = r() < 0.6 ? 0 : 1 + pick(EXTRAS.length - 1);
  return { skin: pick(SKINS.length), hair: pick(HAIR_STYLES.length), hairColor, beard, extra };
};

export { RANK_IDS, SKINS, HAIR_COLORS, HAIR_STYLES, BEARDS, EXTRAS, COLORS, render, url, lookFrom };
