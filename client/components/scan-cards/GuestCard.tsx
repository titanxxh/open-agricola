import type { Locale } from '../../../shared/i18n'
import { GUEST_FRAME_PARTS, type ScanGuestCard } from '../../../shared/scan-cards'
import { publicAssetUrl } from '../../utils/public-asset-url'
import { roundedPath } from './framePath'
import { ScanText } from './ScanText'
import { ScanPortrait } from './ScanFrame'

// The face is 235 x 374 on white stock. A gold band runs from under the window round a parchment panel;
// the window ring sits on a white disc bitten out of the band. Edges are where the printed lines run.
const RING = { cx: 117.31, cy: 126.73, inner: 68.05, outer: 70.95, disc: 75.45 }
const OUTER = { left: 0.867, right: 234.549, top: 152.058, bottom: 373.286 }
// The panel's sides and foot are straight; its top is one shallow arc that dips to y 207.3 mid-card.
const PANEL = { left: 5.775, right: 229.582, bottom: 368.326, radius: 14.12 }
const PANEL_ARC = { cx: 116.88, cy: -386.27, r: 593.59 }
const arcY = (x: number) => PANEL_ARC.cy + Math.sqrt(PANEL_ARC.r ** 2 - (x - PANEL_ARC.cx) ** 2)
const circle = (r: number) =>
  `M ${RING.cx - r} ${RING.cy} A ${r} ${r} 0 1 0 ${RING.cx + r} ${RING.cy} A ${r} ${r} 0 1 0 ${RING.cx - r} ${RING.cy} Z`
const PATHS = {
  outer: roundedPath([
    [OUTER.left, OUTER.top, 4.5],
    [OUTER.right, OUTER.top, 4.5],
    [OUTER.right, OUTER.bottom, 12.4],
    [OUTER.left, OUTER.bottom, 12.4],
  ]),
  panel: [
    `M ${PANEL.left} ${arcY(PANEL.left).toFixed(2)}`,
    `A ${PANEL_ARC.r} ${PANEL_ARC.r} 0 0 0 ${PANEL.right} ${arcY(PANEL.right).toFixed(2)}`,
    `L ${PANEL.right} ${PANEL.bottom - PANEL.radius}`,
    `A ${PANEL.radius} ${PANEL.radius} 0 0 1 ${PANEL.right - PANEL.radius} ${PANEL.bottom}`,
    `L ${PANEL.left + PANEL.radius} ${PANEL.bottom}`,
    `A ${PANEL.radius} ${PANEL.radius} 0 0 1 ${PANEL.left} ${PANEL.bottom - PANEL.radius}`,
    'Z',
  ].join(' '),
  disc: circle(RING.disc),
  ring: `${circle(RING.outer)} ${circle(RING.inner)}`,
}

const GOLD = { band: 'rgb(207 175 52)', ring: 'rgb(178 163 70)' }
// The occupation slice of card_frames.jpg: its mottled body under the band, and its leaves beside the ring.
const SLICE = { x: 4, y: 4, width: 227, height: 366, viewBox: '1264 0 632 1006' }
// The print's mottle is finer than the slice's, so its body is set small and mirrored into a 2 x 2 block,
// which meets itself without a seam.
const MOTTLE = { x: 1285, y: 545, width: 590, height: 440, scale: 0.255, left: -2, top: 150 }
const MOTTLE_TILES = ['', 'matrix(-1 0 0 1 1180 0)', 'matrix(1 0 0 -1 0 880)', 'matrix(-1 0 0 -1 1180 880)']
// Each leaf spray is the occupation one, set a little larger and further out to meet the wider ring, and
// clipped between the band and the official title box, outside the ring. On the right the slice's own
// ring keyline lands just outside this one, so the clip keeps clear of it except where the stem joins.
const LEAVES = [
  { side: 'left', transform: 'translate(-5.469 -7.625) scale(1.05)', clip: 'M 2 105 L 49.72 105 A 71 71 0 0 0 50.51 150.8 L 2 150.8 Z' },
  {
    side: 'right',
    transform: 'translate(-5.92 -7.875) scale(1.0475)',
    clip: 'M 186.37 105 L 235 105 L 235 150.8 L 185.59 150.8 A 72.4 72.4 0 0 0 187.24 145.5 L 185.78 145.5 A 71 71 0 0 0 187.88 134.5 L 189.29 134.5 A 72.4 72.4 0 0 0 186.37 105 Z',
  },
] as const
// Opacity from how dark and how golden a pixel is: the leaves and their outline are opaque, the white
// ground and its grey specks are not.
const LEAF_KEY = '1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0.603 -0.261 -3.342 0 2.8'
// The printed leaves are olive rather than the slice's yellow: a curve per channel.
const LEAF_TONE = {
  r: '0.235 0.235 0.235 0.258 0.311 0.365 0.418 0.471 0.525 0.578 0.631 0.685 0.737 0.787 0.84 0.906 1',
  g: '0.22 0.22 0.22 0.261 0.312 0.363 0.415 0.466 0.517 0.569 0.627 0.695 0.745 0.805 0.857 0.927 1',
  b: '0.18 0.186 0.223 0.274 0.314 0.354 0.39 0.435 0.49 0.546 0.607 0.673 0.738 0.804 0.869 0.935 1',
}
// The forest parchment, flattened to the panel's paler weave.
const PAPER = { slope: 0.6, intercept: [0.3472, 0.3298, 0.27] }
// The offspring sprig in both lower corners, mirrored on the right.
const SPRIG = { width: 31.43, height: 42.08, left: 7.75, leftTop: 323.75, right: 227.18, rightTop: 323.5 }
const SPRIG_TONE = 'rgb(226 228 193)'
const SCROLL = { width: 235, height: 86 }
const SHADE = [0.62, 0.59, 0.4] as const
const SHINE = { amount: 0.6, power: 4 }
const shine = {
  amplitude: SHINE.amount / (1 - 0.5 ** SHINE.power),
  offset: (-SHINE.amount * 0.5 ** SHINE.power) / (1 - 0.5 ** SHINE.power),
}

function Bevel({ id, relief = 3 }: { id: string; relief?: number }) {
  return (
    <filter id={id} x="0" y="0" width="235" height="374" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
      <feGaussianBlur in="SourceAlpha" stdDeviation="0.5" result="edge" />
      <feGaussianBlur in="SourceAlpha" stdDeviation="1.2" result="tail" />
      <feComposite in="edge" in2="tail" operator="arithmetic" k2="0.7" k3="0.3" result="height" />
      <feDiffuseLighting in="height" surfaceScale={relief} diffuseConstant="1" lightingColor="#fff" result="light">
        <feDistantLight azimuth="225" elevation="30" />
      </feDiffuseLighting>
      <feComponentTransfer in="light" result="shade">
        <feFuncR type="linear" slope={2 * SHADE[0]} intercept={1 - SHADE[0]} />
        <feFuncG type="linear" slope={2 * SHADE[1]} intercept={1 - SHADE[1]} />
        <feFuncB type="linear" slope={2 * SHADE[2]} intercept={1 - SHADE[2]} />
      </feComponentTransfer>
      <feComponentTransfer in="light" result="shine">
        <feFuncR type="gamma" amplitude={shine.amplitude} exponent={SHINE.power} offset={shine.offset} />
        <feFuncG type="gamma" amplitude={shine.amplitude} exponent={SHINE.power} offset={shine.offset} />
        <feFuncB type="gamma" amplitude={shine.amplitude} exponent={SHINE.power} offset={shine.offset} />
      </feComponentTransfer>
      <feBlend in="SourceGraphic" in2="shade" mode="multiply" result="shaded" />
      <feBlend in="shaded" in2="shine" mode="screen" />
      <feComposite in2="SourceAlpha" operator="in" />
    </filter>
  )
}

function Slice({ href }: { href: string }) {
  return (
    <svg x={SLICE.x} y={SLICE.y} width={SLICE.width} height={SLICE.height} viewBox={SLICE.viewBox} preserveAspectRatio="none">
      <image href={href} width="1896" height="1006" />
    </svg>
  )
}

function GuestFace({ card }: { card: ScanGuestCard }) {
  const id = `scan-guest-${card.id}`
  const gold = publicAssetUrl(GUEST_FRAME_PARTS.gold)
  const sprig = publicAssetUrl(GUEST_FRAME_PARTS.sprig)
  return (
    <svg className="scan-guest__face" viewBox="0 0 235 374" aria-hidden="true">
      <defs>
        <Bevel id={`${id}-bevel`} />
        {/* The ring is narrow, so it is lit more gently than the band. */}
        <Bevel id={`${id}-ring-bevel`} relief={2} />
        <clipPath id={`${id}-outer`}>
          <path d={PATHS.outer} />
        </clipPath>
        <clipPath id={`${id}-panel`}>
          <path d={PATHS.panel} />
        </clipPath>
        <clipPath id={`${id}-band`}>
          <path d={`M 0 0 H 235 V 374 H 0 Z ${PATHS.panel} ${PATHS.disc}`} clipRule="evenodd" />
        </clipPath>
        <mask id={`${id}-off-disc`} maskUnits="userSpaceOnUse" x="0" y="0" width="235" height="374">
          <rect width="235" height="374" fill="#fff" />
          <path d={PATHS.disc} fill="#000" />
        </mask>
        {LEAVES.map(({ side, clip }) => (
          <clipPath key={side} id={`${id}-leaves-${side}`}>
            <path d={clip} />
          </clipPath>
        ))}
        <filter id={`${id}-mottle`} colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="0.525 1.025 0.2 0 -0.553 0.525 1.025 0.2 0 -0.553 0.525 1.025 0.2 0 -0.553 0 0 0 1 0" />
        </filter>
        <filter id={`${id}-leaf-tone`} colorInterpolationFilters="sRGB">
          {/* Keep the leaves, drop the slice's white ground and its compression specks. */}
          <feColorMatrix type="matrix" values={LEAF_KEY} />
          <feComposite in2="SourceAlpha" operator="in" />
          <feComponentTransfer>
            <feFuncR type="table" tableValues={LEAF_TONE.r} />
            <feFuncG type="table" tableValues={LEAF_TONE.g} />
            <feFuncB type="table" tableValues={LEAF_TONE.b} />
          </feComponentTransfer>
        </filter>
        <filter id={`${id}-paper`} colorInterpolationFilters="sRGB">
          <feComponentTransfer>
            <feFuncR type="linear" slope={PAPER.slope} intercept={PAPER.intercept[0]} />
            <feFuncG type="linear" slope={PAPER.slope} intercept={PAPER.intercept[1]} />
            <feFuncB type="linear" slope={PAPER.slope} intercept={PAPER.intercept[2]} />
          </feComponentTransfer>
        </filter>
        <filter id={`${id}-sprig`} colorInterpolationFilters="sRGB">
          <feFlood floodColor={SPRIG_TONE} />
          <feComposite in2="SourceAlpha" operator="in" />
        </filter>
      </defs>
      <rect className="scan-guest__stock" width="235" height="374" />
      <g filter={`url(#${id}-bevel)`}>
        <g clipPath={`url(#${id}-outer)`}>
          <g clipPath={`url(#${id}-band)`}>
            <rect y="140" width="235" height="234" fill={GOLD.band} />
            <g className="scan-guest__mottle" transform={`translate(${MOTTLE.left} ${MOTTLE.top}) scale(${MOTTLE.scale})`}>
              {MOTTLE_TILES.map((flip) => (
                <g key={flip} transform={flip}>
                  <svg width={MOTTLE.width} height={MOTTLE.height} viewBox={`${MOTTLE.x} ${MOTTLE.y} ${MOTTLE.width} ${MOTTLE.height}`}>
                    <image href={gold} width="1896" height="1006" filter={`url(#${id}-mottle)`} />
                  </svg>
                </g>
              ))}
            </g>
          </g>
        </g>
      </g>
      <g clipPath={`url(#${id}-panel)`}>
        <image href={publicAssetUrl(GUEST_FRAME_PARTS.parchment)} width="235" height="374" preserveAspectRatio="none" filter={`url(#${id}-paper)`} />
      </g>
      <g className="scan-guest__sprig" filter={`url(#${id}-sprig)`}>
        <image href={sprig} x={SPRIG.left} y={SPRIG.leftTop} width={SPRIG.width} height={SPRIG.height} preserveAspectRatio="none" />
        <image
          href={sprig}
          transform={`translate(${SPRIG.right} 0) scale(-1 1)`}
          y={SPRIG.rightTop}
          width={SPRIG.width}
          height={SPRIG.height}
          preserveAspectRatio="none"
        />
      </g>
      <path className="scan-guest__line scan-guest__line--outer" d={PATHS.outer} mask={`url(#${id}-off-disc)`} />
      <path className="scan-guest__line scan-guest__line--disc" d={PATHS.disc} clipPath={`url(#${id}-outer)`} />
      <path className="scan-guest__line scan-guest__line--panel" d={PATHS.panel} />
      {LEAVES.map(({ side, transform }) => (
        <g key={side} className="scan-guest__leaves" clipPath={`url(#${id}-leaves-${side})`}>
          <g transform={transform} filter={`url(#${id}-leaf-tone)`}>
            <Slice href={gold} />
          </g>
        </g>
      ))}
      <image href={publicAssetUrl(card.frame)} width={SCROLL.width} height={SCROLL.height} preserveAspectRatio="none" />
      <image className="scan-stack-art" href={publicAssetUrl(card.art)} width="235" height="374" preserveAspectRatio="none" />
      <path d={PATHS.ring} fillRule="evenodd" fill={GOLD.ring} filter={`url(#${id}-ring-bevel)`} />
      <circle className="scan-guest__line scan-guest__line--ring" cx={RING.cx} cy={RING.cy} r={RING.inner} />
      <circle className="scan-guest__line scan-guest__line--ring" cx={RING.cx} cy={RING.cy} r={RING.outer} />
      {card.overlay ? (
        <image className="scan-stack-over" href={publicAssetUrl(card.overlay)} width="235" height="374" preserveAspectRatio="none" />
      ) : null}
    </svg>
  )
}

export function GuestCard({ card, locale }: { card: ScanGuestCard; locale: Locale }) {
  return (
    <ScanPortrait locale={locale} cardId={card.id} label={card.name} layout="guest">
      <div className="scan-guest">
        <GuestFace card={card} />
        <h3 className="scan-title">{card.name}</h3>
        <div className="scan-copy">
          <ScanText text={card.text} />
        </div>
      </div>
    </ScanPortrait>
  )
}
