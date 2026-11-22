// Blocky game-world look (ported from the In This Town kit). The scene brings its own lights and finish.
import { makeKit } from '../lib/kit3d.js'
const P = { sky: '#0b1030', ground: '#3a3f4a', main: '#c41e2c', accent: '#ffe81e', skin: '#e8bea0', dark: '#1a1c22', light: '#ffffff', extra: '#3a5a9a' }
export default { kind: '3d', palette: P, kit: (THREE) => makeKit(THREE, P, { flat: false, detail: 2, roughness: 0.6 }) }
