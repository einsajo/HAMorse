/**
 * The face in the set. Drawn, not an image (no assets), and lit like a
 * photograph rather than outlined like a cartoon: a pale face emerging from
 * total darkness, sculpted only by where light falls (forehead, cheekbones,
 * the bridge of the nose, the chin), so everything else is shadow.
 *
 *   - eyes: deep black sockets, two tiny glinting pupils, not quite level
 *   - the grin: far too wide, ear to ear, rows of uneven teeth, the corners
 *     torn up into the cheeks in thin scars
 *   - a film-grain skin and a slight warp, as if through cracked glass
 *
 * Used twice: half-seen in the LCD during the build-up (`backdrop`: a dark
 * oval so it reads on the amber glass), and lunging out of the black at the
 * jumpscare. `idPrefix` keeps the SVG ids unique when it is on the page twice.
 */
const TEETH: readonly (readonly [number, number, number])[] = [
  // [x, width, height] along the grin, uneven
  [92, 9, 15], [102, 10, 18], [113, 11, 20], [125, 11, 22], [137, 12, 23], [150, 12, 23],
  [163, 11, 22], [175, 11, 21], [187, 10, 19], [198, 9, 16], [208, 8, 13],
]

/** black liquid crystal running from the eyes at the jumpscare: [path, width] */
const TEARS: readonly (readonly [string, number])[] = [
  ['M96 168 C 94 200, 99 232, 92 268 C 88 292, 94 320, 90 352', 6],
  ['M104 170 C 108 196, 104 214, 110 236', 3.5],
  ['M204 160 C 207 196, 201 226, 208 262 C 212 288, 205 318, 210 344', 6.5],
  ['M196 162 C 192 184, 196 202, 190 222', 3],
]

export default function GhostFace({ idPrefix, className, backdrop = false, bleed = false }: { idPrefix: string; className?: string; backdrop?: boolean; bleed?: boolean }) {
  const id = (s: string) => `${idPrefix}-${s}`
  return (
    <svg className={className} viewBox="0 0 300 400" aria-hidden="true">
      <defs>
        {/* light falling on skin: soft, with grain */}
        <filter id={id('light')} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="9" result="soft" />
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4" result="noise" />
          <feColorMatrix in="noise" type="saturate" values="0" result="grain" />
          <feBlend in="soft" in2="grain" mode="multiply" result="grainy" />
          <feComposite in="grainy" in2="soft" operator="in" />
        </filter>
        {/* every hard edge slightly warped */}
        <filter id={id('warp')} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="11" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="7" xChannelSelector="R" yChannelSelector="G" result="w" />
          <feGaussianBlur in="w" stdDeviation="0.6" />
        </filter>
        <filter id={id('glint')} x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation="2.2" result="g" />
          <feMerge>
            <feMergeNode in="g" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={id('soft')} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
        <radialGradient id={id('skin')} cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="#e8e1d2" />
          <stop offset="55%" stopColor="#9e968a" />
          <stop offset="100%" stopColor="#2a2723" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id('dark')} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#050505" />
          <stop offset="70%" stopColor="#050505" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#050505" stopOpacity="0" />
        </radialGradient>
        <clipPath id={id('mouth')}>
          <path d="M70 262 C 110 300, 190 300, 230 262 C 205 312, 95 312, 70 262 Z" />
        </clipPath>
      </defs>

      {backdrop && <ellipse cx="150" cy="200" rx="150" ry="200" fill={`url(#${id('dark')})`} />}

      {/* where the light falls: the face is carved out of the dark */}
      <g filter={`url(#${id('light')})`} fill={`url(#${id('skin')})`}>
        <ellipse cx="150" cy="96" rx="78" ry="52" />
        <ellipse cx="88" cy="196" rx="34" ry="44" />
        <ellipse cx="212" cy="196" rx="34" ry="44" />
        <path d="M138 128 C 142 170, 140 210, 132 236 L 168 236 C 160 210, 158 170, 162 128 Z" />
        <ellipse cx="150" cy="336" rx="50" ry="32" />
        <path d="M58 250 C 100 300, 200 300, 242 250 C 230 300, 70 300, 58 250 Z" />
      </g>

      <g filter={`url(#${id('warp')})`}>
        {/* brow shadow and sunken sockets */}
        <path d="M52 140 C 80 118, 124 120, 140 144 C 128 186, 74 190, 56 164 Z" fill="#050505" opacity="0.92" />
        <path d="M248 132 C 220 112, 176 116, 160 140 C 172 180, 226 184, 244 158 Z" fill="#050505" opacity="0.92" />
        {/* the grin: far too wide (the jaw: the jumpscare stretches it open) */}
        <g className="ghostface__jaw">
        <path d="M70 262 C 110 300, 190 300, 230 262 C 205 312, 95 312, 70 262 Z" fill="#050505" />
        <g clipPath={`url(#${id('mouth')})`}>
          {TEETH.map(([x, w, h]) => (
            <rect key={x} x={x - w / 2 - 10} y={270} width={w} height={h} rx="2.5" fill="#cfc6b2" opacity="0.92" />
          ))}
          {TEETH.slice(1, -1).map(([x, w, h]) => (
            <rect key={`lo${x}`} x={x - w / 2 - 6} y={302 - h * 0.55} width={w * 0.9} height={h * 0.55} rx="2" fill="#a59c88" opacity="0.8" />
          ))}
        </g>
        </g>
        {/* the corners torn up into the cheeks */}
        <path d="M70 262 C 58 246, 52 226, 50 206" stroke="#050505" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M230 262 C 242 246, 248 226, 250 206" stroke="#050505" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M66 258 C 60 252, 57 246, 55 238" stroke="#3a1612" strokeWidth="1.4" fill="none" opacity="0.7" />
        <path d="M234 258 C 240 252, 243 246, 245 238" stroke="#3a1612" strokeWidth="1.4" fill="none" opacity="0.7" />
      </g>

      {/* nostrils: two soft shadows under the lit bridge of the nose */}
      <g filter={`url(#${id('soft')})`} fill="#050505" opacity="0.85">
        <ellipse cx="139" cy="240" rx="8" ry="4.5" transform="rotate(18 139 240)" />
        <ellipse cx="161" cy="240" rx="8" ry="4.5" transform="rotate(-18 161 240)" />
      </g>

      {/* the jumpscare: black liquid crystal running from the eyes */}
      {bleed && (
        <g className="ghostface__tears" fill="none" strokeLinecap="round">
          {TEARS.map(([d, w]) => (
            <g key={d}>
              <path d={d} stroke="#050505" strokeWidth={w} pathLength={1} />
              {/* wet: a thin oily highlight down one edge of each run */}
              <path d={d} stroke="rgba(214, 206, 246, 0.42)" strokeWidth={w * 0.22} transform={`translate(${w * 0.3} 0)`} pathLength={1} />
            </g>
          ))}
        </g>
      )}

      {/* two tiny glinting pupils, not quite level */}
      <g filter={`url(#${id('glint')})`} fill="#f6f1e6">
        <circle cx="98" cy="160" r="3.2" />
        <circle cx="203" cy="153" r="2.8" />
      </g>
    </svg>
  )
}
