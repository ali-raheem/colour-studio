/*
 * Named colours and nearest-colour search.
 *   - CSS keywords (the 148 standard web colours)
 *   - A set of artist / design names (pigment-style names, conventional hex values)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./color.js'));
  else root.Names = factory(root.Colour);
})(typeof self !== 'undefined' ? self : this, function (C) {
  'use strict';

  // [css keyword, hex]. aqua/fuchsia and the "grey" spellings are aliases, below.
  const CSS = [
    ['aliceblue', 'f0f8ff'], ['antiquewhite', 'faebd7'], ['aquamarine', '7fffd4'], ['azure', 'f0ffff'],
    ['beige', 'f5f5dc'], ['bisque', 'ffe4c4'], ['black', '000000'], ['blanchedalmond', 'ffebcd'],
    ['blue', '0000ff'], ['blueviolet', '8a2be2'], ['brown', 'a52a2a'], ['burlywood', 'deb887'],
    ['cadetblue', '5f9ea0'], ['chartreuse', '7fff00'], ['chocolate', 'd2691e'], ['coral', 'ff7f50'],
    ['cornflowerblue', '6495ed'], ['cornsilk', 'fff8dc'], ['crimson', 'dc143c'], ['cyan', '00ffff'],
    ['darkblue', '00008b'], ['darkcyan', '008b8b'], ['darkgoldenrod', 'b8860b'], ['darkgray', 'a9a9a9'],
    ['darkgreen', '006400'], ['darkkhaki', 'bdb76b'], ['darkmagenta', '8b008b'], ['darkolivegreen', '556b2f'],
    ['darkorange', 'ff8c00'], ['darkorchid', '9932cc'], ['darkred', '8b0000'], ['darksalmon', 'e9967a'],
    ['darkseagreen', '8fbc8f'], ['darkslateblue', '483d8b'], ['darkslategray', '2f4f4f'],
    ['darkturquoise', '00ced1'], ['darkviolet', '9400d3'], ['deeppink', 'ff1493'], ['deepskyblue', '00bfff'],
    ['dimgray', '696969'], ['dodgerblue', '1e90ff'], ['firebrick', 'b22222'], ['floralwhite', 'fffaf0'],
    ['forestgreen', '228b22'], ['gainsboro', 'dcdcdc'], ['ghostwhite', 'f8f8ff'], ['gold', 'ffd700'],
    ['goldenrod', 'daa520'], ['gray', '808080'], ['green', '008000'], ['greenyellow', 'adff2f'],
    ['honeydew', 'f0fff0'], ['hotpink', 'ff69b4'], ['indianred', 'cd5c5c'], ['indigo', '4b0082'],
    ['ivory', 'fffff0'], ['khaki', 'f0e68c'], ['lavender', 'e6e6fa'], ['lavenderblush', 'fff0f5'],
    ['lawngreen', '7cfc00'], ['lemonchiffon', 'fffacd'], ['lightblue', 'add8e6'], ['lightcoral', 'f08080'],
    ['lightcyan', 'e0ffff'], ['lightgoldenrodyellow', 'fafad2'], ['lightgray', 'd3d3d3'],
    ['lightgreen', '90ee90'], ['lightpink', 'ffb6c1'], ['lightsalmon', 'ffa07a'], ['lightseagreen', '20b2aa'],
    ['lightskyblue', '87cefa'], ['lightslategray', '778899'], ['lightsteelblue', 'b0c4de'],
    ['lightyellow', 'ffffe0'], ['lime', '00ff00'], ['limegreen', '32cd32'], ['linen', 'faf0e6'],
    ['magenta', 'ff00ff'], ['maroon', '800000'], ['mediumaquamarine', '66cdaa'], ['mediumblue', '0000cd'],
    ['mediumorchid', 'ba55d3'], ['mediumpurple', '9370db'], ['mediumseagreen', '3cb371'],
    ['mediumslateblue', '7b68ee'], ['mediumspringgreen', '00fa9a'], ['mediumturquoise', '48d1cc'],
    ['mediumvioletred', 'c71585'], ['midnightblue', '191970'], ['mintcream', 'f5fffa'],
    ['mistyrose', 'ffe4e1'], ['moccasin', 'ffe4b5'], ['navajowhite', 'ffdead'], ['navy', '000080'],
    ['oldlace', 'fdf5e6'], ['olive', '808000'], ['olivedrab', '6b8e23'], ['orange', 'ffa500'],
    ['orangered', 'ff4500'], ['orchid', 'da70d6'], ['palegoldenrod', 'eee8aa'], ['palegreen', '98fb98'],
    ['paleturquoise', 'afeeee'], ['palevioletred', 'db7093'], ['papayawhip', 'ffefd5'],
    ['peachpuff', 'ffdab9'], ['peru', 'cd853f'], ['pink', 'ffc0cb'], ['plum', 'dda0dd'],
    ['powderblue', 'b0e0e6'], ['purple', '800080'], ['rebeccapurple', '663399'], ['red', 'ff0000'],
    ['rosybrown', 'bc8f8f'], ['royalblue', '4169e1'], ['saddlebrown', '8b4513'], ['salmon', 'fa8072'],
    ['sandybrown', 'f4a460'], ['seagreen', '2e8b57'], ['seashell', 'fff5ee'], ['sienna', 'a0522d'],
    ['silver', 'c0c0c0'], ['skyblue', '87ceeb'], ['slateblue', '6a5acd'], ['slategray', '708090'],
    ['snow', 'fffafa'], ['springgreen', '00ff7f'], ['steelblue', '4682b4'], ['tan', 'd2b48c'],
    ['teal', '008080'], ['thistle', 'd8bfd8'], ['tomato', 'ff6347'], ['turquoise', '40e0d0'],
    ['violet', 'ee82ee'], ['wheat', 'f5deb3'], ['white', 'ffffff'], ['whitesmoke', 'f5f5f5'],
    ['yellow', 'ffff00'], ['yellowgreen', '9acd32'],
  ];

  const CSS_ALIASES = {
    aqua: '00ffff', fuchsia: 'ff00ff',
    darkgrey: 'a9a9a9', darkslategrey: '2f4f4f', dimgrey: '696969', grey: '808080',
    lightgrey: 'd3d3d3', lightslategrey: '778899', slategrey: '708090',
  };

  // [display name, hex]. Conventional values; pigment names have no single "true" hex.
  const ART = [
    ['Vermilion', 'E34234'], ['Scarlet', 'FF2400'], ['Cadmium Red', 'E30022'], ['Alizarin Crimson', 'E32636'],
    ['Carmine', '960018'], ['Burgundy', '800020'], ['Claret', '7F1734'], ['Ruby', 'E0115F'],
    ['Raspberry', 'E30B5C'], ['Cerise', 'DE3163'], ['Rose', 'FF007F'], ['Blush', 'DE5D83'],
    ['Puce', 'CC8899'], ['Mulberry', 'C54B8C'], ['Byzantium', '702963'], ['Tyrian Purple', '66023C'],
    ['Amethyst', '9966CC'], ['Royal Purple', '7851A9'], ['Lilac', 'C8A2C8'], ['Mauve', 'E0B0FF'],
    ['Eggplant', '614051'], ['Periwinkle', 'CCCCFF'], ['Ultramarine', '120A8F'], ['Cobalt Blue', '0047AB'],
    ['Sapphire', '0F52BA'], ['Lapis Lazuli', '26619C'], ['Prussian Blue', '003153'], ['Oxford Blue', '002147'],
    ['Denim', '1560BD'], ['Cerulean', '007BA7'], ['Electric Blue', '7DF9FF'], ['Robin Egg Blue', '00CCCC'],
    ['Verdigris', '43B3AE'], ['Viridian', '40826D'], ['Jade', '00A86B'], ['Emerald', '50C878'],
    ['Mint', '3EB489'], ['Celadon', 'ACE1AF'], ['Sage', '9CAF88'], ['Moss Green', '8A9A5B'],
    ['Sap Green', '507D2A'], ['Fern Green', '4F7942'], ['Hunter Green', '355E3B'],
    ['British Racing Green', '004225'], ['Pistachio', '93C572'], ['Amber', 'FFBF00'], ['Saffron', 'F4C430'],
    ['Marigold', 'EAA221'], ['Mustard', 'FFDB58'], ['Lemon Yellow', 'FFF44F'], ['Canary', 'FFFF99'],
    ['Cadmium Yellow', 'FFF600'], ['Cream', 'FFFDD0'], ['Champagne', 'F7E7CE'], ['Eggshell', 'F0EAD6'],
    ['Pearl', 'EAE0C8'], ['Sand', 'C2B280'], ['Peach', 'FFE5B4'], ['Apricot', 'FBCEB1'],
    ['Salmon Pink', 'FF91A4'], ['Coral Pink', 'F88379'], ['Cadmium Orange', 'ED872D'], ['Tangerine', 'F28500'],
    ['Pumpkin', 'FF7518'], ['Persimmon', 'EC5800'], ['Burnt Orange', 'CC5500'], ['Rust', 'B7410E'],
    ['Terra Cotta', 'E2725B'], ['Burnt Sienna', 'E97451'], ['Ochre', 'CC7722'], ['Copper', 'B87333'],
    ['Bronze', 'CD7F32'], ['Mahogany', 'C04000'], ['Raw Umber', '826644'], ['Umber', '635147'],
    ['Burnt Umber', '8A3324'], ['Sepia', '704214'], ['Bistre', '3D2B1F'], ['Coffee', '6F4E37'],
    ['Taupe', '483C32'], ['Liver', '674C47'], ['Charcoal', '36454F'], ['Gunmetal', '2A3439'],
    ['Onyx', '353839'], ['Jet', '343434'], ['Ash Grey', 'B2BEB5'], ['Platinum', 'E5E4E2'],
  ];

  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const toRgb = (hex) => {
    const n = parseInt(hex, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  };

  const all = [];
  const byKey = new Map();

  for (const [name, hex] of CSS) all.push({ name, kind: 'css', hex: '#' + hex.toUpperCase(), rgb: toRgb(hex) });
  for (const [name, hex] of ART) all.push({ name, kind: 'art', hex: '#' + hex.toUpperCase(), rgb: toRgb(hex) });
  for (const e of all) {
    e.lab = C.rgbToLab(e.rgb);
    byKey.set(norm(e.name), e.rgb);
  }
  for (const [k, hex] of Object.entries(CSS_ALIASES)) byKey.set(k, toRgb(hex));

  /** Colour for a name like "Burnt Sienna", "burntsienna" or "rebecca-purple"; null if unknown. */
  function lookup(text) {
    const rgb = byKey.get(norm(text));
    return rgb ? { ...rgb } : null;
  }

  /** The `count` closest named colours, each with a CIEDE2000 distance `dE`. */
  function nearest(rgb, count = 8) {
    const lab = C.rgbToLab(rgb);
    return all
      .map((e) => ({ ...e, dE: C.deltaE2000(lab, e.lab) }))
      .sort((a, b) => a.dE - b.dE)
      .slice(0, count);
  }

  return { all, lookup, nearest };
});
