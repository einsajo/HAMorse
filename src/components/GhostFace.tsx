/**
 * The face in the set. Drawn, not an image (no assets). No head outline:
 * the flash itself is the face's pale skin, and only what is DARK is drawn:
 * uneven, sagging eye sockets with pin-prick pupils, weeping streaks of the
 * same black liquid crystal that bleeds from the LCD, brow and cheek
 * hollows, nose slits and a ragged, gaping mouth. A turbulence displacement
 * warps every edge, as if seen through cracked glass.
 *
 * Used twice: half-seen in the LCD during the build-up, and lunging out of
 * the white flash (where it is drawn huge, so it overflows the screen).
 * `idPrefix` keeps the SVG filter ids unique when it is on the page twice.
 */
export default function GhostFace({ idPrefix, className }: { idPrefix: string; className?: string }) {
  const warp = `${idPrefix}-warp`
  const hollow = `${idPrefix}-hollow`
  return (
    <svg className={className} viewBox="0 0 200 240" aria-hidden="true">
      <defs>
        <filter id={warp} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="3" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="10" xChannelSelector="R" yChannelSelector="G" result="warped" />
          <feGaussianBlur in="warped" stdDeviation="0.7" />
        </filter>
        {/* soft shadow for the hollows (brows, cheeks, temples) */}
        <filter id={hollow} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>
      {/* the skull under the skin: soft hollows */}
      <g filter={`url(#${hollow})`} fill="#050505">
        <path d="M44 70 C 60 56, 88 58, 96 74 L 92 80 C 78 70, 60 70, 46 80 Z" opacity="0.55" />
        <path d="M156 66 C 140 52, 112 56, 104 72 L 108 78 C 122 68, 140 68, 154 76 Z" opacity="0.55" />
        <path d="M40 120 C 50 150, 64 176, 76 188 L 66 190 C 52 176, 40 150, 40 120 Z" opacity="0.6" />
        <path d="M160 116 C 150 146, 136 174, 124 186 L 134 188 C 148 174, 160 146, 160 116 Z" opacity="0.6" />
        <ellipse cx="100" cy="128" rx="14" ry="9" opacity="0.35" />
      </g>
      <g filter={`url(#${warp})`} fill="#050505">
        {/* sockets: uneven, the left one sagging lower */}
        <path d="M50 92 C 54 68, 90 66, 96 92 C 96 120, 70 128, 58 116 C 52 110, 49 102, 50 92 Z" />
        <path d="M150 86 C 146 64, 112 64, 106 88 C 106 112, 128 118, 140 108 C 147 102, 151 95, 150 86 Z" />
        {/* weeping black crystal */}
        <path d="M66 120 C 64 140, 70 158, 66 186 C 65 192, 61 192, 61 186 C 62 162, 58 142, 62 120 Z" />
        <path d="M84 118 C 85 132, 82 142, 84 152 C 84 156, 80 156, 80 152 C 80 140, 81 130, 80 120 Z" />
        <path d="M130 112 C 132 128, 128 140, 131 160 C 131 165, 126 165, 126 160 C 125 142, 127 126, 126 113 Z" />
        {/* nose slits */}
        <path d="M94 134 C 92 140, 90 144, 88 148 L 92 149 C 94 145, 96 140, 97 135 Z" />
        <path d="M106 134 C 108 140, 110 144, 112 148 L 108 149 C 106 145, 104 140, 103 135 Z" />
        {/* the mouth: gaping, ragged, stretched too long */}
        <path d="M70 168 L 78 162 L 84 167 L 91 160 L 98 166 L 105 159 L 112 166 L 119 161 L 126 167 L 132 164 C 136 186, 124 222, 101 232 C 78 222, 66 188, 70 168 Z" />
      </g>
      {/* pin-prick pupils, looking straight at you (unwarped: sharp) */}
      <circle cx="75" cy="99" r="2.4" fill="#f4efe4" />
      <circle cx="127" cy="91" r="2.1" fill="#f4efe4" />
    </svg>
  )
}
