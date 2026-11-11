import type { Locale } from '../../../shared/i18n'
import { FOREST_FRAME_PARTS, SCAN_RESHUFFLE_LINE, scanBadgePath, type ScanForestEventCard } from '../../../shared/scan-cards'
import { publicAssetUrl } from '../../utils/public-asset-url'
import { roundedPath, type FrameCorner } from './framePath'
import { ScanText } from './ScanText'
import { ScanCategory, ScanPortrait } from './ScanFrame'

// Bronze-rimmed tiles on white stock: a header with the title plate (on hex stories a taller top tile
// cut around the hexagon), the art window, and a lower tile around the text panel. Wood is inlaid
// wherever a tile is wider than its rim. Edges are in face pixels; strokes sit on the printed lines.
const MID = 117.45
const SLOPE = Math.tan(Math.PI / 6)
const SIDE = 1 / Math.cos(Math.PI / 6)
const KEY = 0.6
// The hex window's outer edge. The pointed window's foot follows its lower half, and the tiles are cut
// CUT outside it.
const HEX = { top: 56.94, bottom: 198.86, waist: 127.7, half: 82.25 }
const CUT = 3
const HEADER = { left: 0.89, right: 234.09, top: 0.98, bottom: 53.67 }
const TOP_TILE = { left: 1.77, right: 233.02, top: 1.37, bottom: 103.46 }
const WINDOW = { left: 1.13, right: 233.98, top: 56.6, bottom: 148.76 }
const LOWER = { left: 1.21, right: 233.78, top: 151.98, bottom: 373.11 }
const ART_LINE = 3.65
const ART_BLEED = 2.5
const RIM = 3
const MEDALLION = { x: 191, y: 154.75, size: 38.5 }

/** Half-width at height y of the hexagon grown by g. */
const hexHalf = (y: number, g: number) => HEX.half + g * SIDE - Math.abs(y - HEX.waist) * SLOPE

const box = (b: typeof HEADER, d: number, top: number, bottom: number) => roundedPath([
  [b.left + d, b.top + d, top],
  [b.right - d, b.top + d, top],
  [b.right - d, b.bottom - d, bottom],
  [b.left + d, b.bottom - d, bottom],
])

const hexagon = (g: number, r: number) => {
  const top = HEX.top - g
  const bottom = HEX.bottom + g
  return roundedPath([
    [MID - hexHalf(top, g), top, r],
    [MID + hexHalf(top, g), top, r],
    [MID + hexHalf(HEX.waist, g), HEX.waist, r],
    [MID + hexHalf(bottom, g), bottom, r],
    [MID - hexHalf(bottom, g), bottom, r],
    [MID - hexHalf(HEX.waist, g), HEX.waist, r],
  ])
}

const pointedWindow = (d: number, corner: number, footTop: number, footBottom: number) => {
  const side = WINDOW.bottom - d
  const foot = HEX.bottom - d
  return roundedPath([
    [WINDOW.left + d, WINDOW.top + d, corner],
    [WINDOW.left + d, side, corner],
    [MID - hexHalf(side, -d), side, footTop],
    [MID - hexHalf(foot, -d), foot, footBottom],
    [MID + hexHalf(foot, -d), foot, footBottom],
    [MID + hexHalf(side, -d), side, footTop],
    [WINDOW.right - d, side, corner],
    [WINDOW.right - d, WINDOW.top + d, corner],
  ])
}

const topTile = (d: number) => {
  const bottom = TOP_TILE.bottom - d
  const cut = CUT + d
  const cutTop = HEX.top - cut
  return roundedPath([
    [TOP_TILE.left + d, TOP_TILE.top + d, 13.8],
    [TOP_TILE.right - d, TOP_TILE.top + d, 13.8],
    [TOP_TILE.right - d, bottom, 1.4],
    [MID + hexHalf(bottom, cut), bottom, 0.8],
    [MID + hexHalf(cutTop, cut), cutTop, 1.5],
    [MID - hexHalf(cutTop, cut), cutTop, 1.5],
    [MID - hexHalf(bottom, cut), bottom, 0.8],
    [TOP_TILE.left + d, bottom, 1.4],
  ])
}

const lowerTile = (d: number) => {
  const top = LOWER.top + d
  const cut = CUT + d
  const notch = HEX.bottom + cut
  return roundedPath([
    [LOWER.left + d, top, 2.4],
    [MID - hexHalf(top, cut), top, 2.5],
    [MID - hexHalf(notch, cut), notch, 1.5],
    [MID + hexHalf(notch, cut), notch, 1.5],
    [MID + hexHalf(top, cut), top, 2.5],
    [LOWER.right - d, top, 2.4],
    [LOWER.right - d, LOWER.bottom - d, 14],
    [LOWER.left + d, LOWER.bottom - d, 14],
  ])
}

const mirrored = (half: readonly FrameCorner[]): FrameCorner[] =>
  [...half, ...[...half].reverse().map(([x, y, r]): FrameCorner => [2 * MID - x, y, r])]

// Plate outlines run half a line outside the printed paper edge.
const PLATES = {
  title: roundedPath([[6.32, 6.4, 8.95], [228.54, 6.4, 8.95], [228.54, 48.35, 1.3], [6.32, 48.35, 1.3]]),
  hexTitle: roundedPath([
    [6.65, 6.69, 8.95],
    [2 * MID - 6.65, 6.69, 8.95],
    ...mirrored([[6.65, 54.82, 1], [MID - 47.35, 48.19, 0]]).reverse(),
  ]),
  panel: roundedPath([
    ...mirrored([[6.64, 200.52, 1], [MID - 42.75, 207.37, 0]]),
    [228.32, 367.82, 10.5],
    [6.64, 367.82, 10.5],
  ]),
}

const PATHS = {
  pointed: {
    upper: box(HEADER, KEY, 13.8, 0.7),
    title: PLATES.title,
    window: pointedWindow(KEY, 0.9, 2, 2.5),
    art: pointedWindow(ART_LINE, 0.6, 1.2, 1.5),
    bleed: pointedWindow(ART_BLEED, 0.6, 1.2, 1.5),
  },
  hex: {
    upper: topTile(KEY),
    title: PLATES.hexTitle,
    window: hexagon(-KEY, 1.2),
    art: hexagon(-ART_LINE, 0.8),
    bleed: hexagon(-ART_BLEED, 0.8),
  },
  lower: lowerTile(KEY),
  panel: PLATES.panel,
}

// Bronze ramp across the bevel: shadowed slope, the wood-brown flat, lit slope.
const BRONZE = { shade: [42, 39, 37], flat: [118, 86, 52], lit: [190, 170, 128], mottle: 0.12 }
const ramp = (channel: 0 | 1 | 2) => {
  const { shade, flat, lit } = BRONZE
  const stops = [shade[channel], (shade[channel] + flat[channel]) / 2, flat[channel], lit[channel], lit[channel]]
  return stops.map((c) => (c / 255).toFixed(4)).join(' ')
}

// The official minor-card sprigs from the meeples sheet, re-toned from gold to bronze by luminance.
const SPRIGS = [
  { sx: 1401, x: 0, y: 108.75, scale: 0.3775 },
  { sx: 1565, x: 189.25, y: 109.75, scale: 0.3737 },
] as const
const SPRIG = { sy: 290, width: 118, height: 104 }
const LEAF = {
  r: '0.118 0.2 0.33 0.47 0.6 0.72 0.82 0.9',
  g: '0.102 0.16 0.26 0.37 0.49 0.62 0.74 0.84',
  b: '0.086 0.11 0.17 0.24 0.32 0.43 0.56 0.68',
}

function ForestStoryFrame({ id, hex, wood }: { id: string; hex: boolean; wood: string }) {
  const shape = hex ? PATHS.hex : PATHS.pointed
  const meeples = publicAssetUrl(FOREST_FRAME_PARTS.sprigs)
  return (
    <svg className="scan-story__frame" viewBox="0 0 235 374" aria-hidden="true">
      <defs>
        {(['wood', 'paper'] as const).map((part) => (
          <pattern key={part} id={`${id}-${part}`} patternUnits="userSpaceOnUse" width="235" height="374">
            <image
              href={publicAssetUrl(part === 'wood' ? wood : FOREST_FRAME_PARTS.parchment)}
              width="235"
              height="374"
              preserveAspectRatio="none"
            />
          </pattern>
        ))}
        <filter id={`${id}-bevel`} x="0" y="0" width="235" height="374" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceAlpha" stdDeviation="2.2" result="height" />
          <feDiffuseLighting in="height" surfaceScale="2.5" diffuseConstant="1" lightingColor="#fff" result="light">
            <feDistantLight azimuth="237" elevation="30" />
          </feDiffuseLighting>
          <feComponentTransfer in="light" result="ramp">
            <feFuncR type="table" tableValues={ramp(0)} />
            <feFuncG type="table" tableValues={ramp(1)} />
            <feFuncB type="table" tableValues={ramp(2)} />
          </feComponentTransfer>
          <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="3" seed="4" />
          <feColorMatrix type="matrix" values="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 0 0 0 0 1" result="noise" />
          <feComposite in="ramp" in2="noise" operator="arithmetic" k2="1" k3={BRONZE.mottle} k4={-BRONZE.mottle / 2} result="paint" />
          <feComposite in="paint" in2="SourceAlpha" operator="in" />
        </filter>
        <filter id={`${id}-soft`} x="0" y="0" width="235" height="374" filterUnits="userSpaceOnUse">
          <feGaussianBlur stdDeviation="0.5" />
        </filter>
        <mask id={`${id}-inlay`} maskUnits="userSpaceOnUse" x="0" y="0" width="235" height="374">
          <g filter={`url(#${id}-soft)`} fillRule="evenodd" fill="#fff" stroke="#000" strokeWidth={2 * RIM}>
            <path d={`${shape.upper} ${shape.title}`} />
            <path d={`${PATHS.lower} ${PATHS.panel}`} />
          </g>
        </mask>
        <filter id={`${id}-leaf`} x="1401" y="290" width="282" height="104" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="0.3 0.59 0.11 0 0 0.3 0.59 0.11 0 0 0.3 0.59 0.11 0 0 0 0 -1.2 0 1.2" />
          <feComponentTransfer>
            <feFuncR type="table" tableValues={LEAF.r} />
            <feFuncG type="table" tableValues={LEAF.g} />
            <feFuncB type="table" tableValues={LEAF.b} />
          </feComponentTransfer>
          <feComposite in2="SourceAlpha" operator="in" />
        </filter>
      </defs>
      <g filter={`url(#${id}-bevel)`} fillRule="evenodd">
        <path d={`${shape.upper} ${shape.title}`} />
        <path d={`${PATHS.lower} ${PATHS.panel}`} />
      </g>
      <rect width="235" height="374" fill={`url(#${id}-wood)`} mask={`url(#${id}-inlay)`} />
      {hex
        ? SPRIGS.map((sprig) => (
          <svg
            key={sprig.sx}
            x={sprig.x}
            y={sprig.y}
            width={SPRIG.width * sprig.scale}
            height={SPRIG.height * sprig.scale}
            viewBox={`${sprig.sx} ${SPRIG.sy} ${SPRIG.width} ${SPRIG.height}`}
          >
            <image href={meeples} width="2048" height="2048" filter={`url(#${id}-leaf)`} />
          </svg>
        ))
        : null}
      <path d={`${shape.window} ${shape.art}`} fillRule="evenodd" filter={`url(#${id}-bevel)`} />
      {(['title', 'panel'] as const).map((plate) => (
        <path key={plate} d={plate === 'title' ? shape.title : PATHS.panel} fill={`url(#${id}-paper)`} />
      ))}
      <path className="scan-story__outline" d={`${shape.title} ${PATHS.panel}`} />
      <path className="scan-story__line" d={shape.art} />
      <path className="scan-story__keyline" d={`${shape.upper} ${shape.window} ${PATHS.lower}`} />
      <image
        href={publicAssetUrl(scanBadgePath('legendairy-forest'))}
        x={MEDALLION.x}
        y={MEDALLION.y}
        width={MEDALLION.size}
        height={MEDALLION.size}
      />
    </svg>
  )
}

export function ForestEventCard({ card, locale }: { card: ScanForestEventCard; locale: Locale }) {
  const text = card.timing === 'reshuffle' ? `${card.text}\n\n{left}${SCAN_RESHUFFLE_LINE}` : card.text
  const hex = card.window === 'hex'
  return (
    <ScanPortrait locale={locale} cardId={card.id} label={card.name} layout="event">
      <div className="scan-story" data-deck="legendairy-forest" data-window={hex ? 'hex' : 'pointed'}>
        <img className="scan-stack-art" src={publicAssetUrl(card.art)} alt="" />
        <ForestStoryFrame id={`scan-story-${card.id}`} hex={hex} wood={card.frame} />
        {card.overlay ? <img className="scan-stack-over" src={publicAssetUrl(card.overlay)} alt="" /> : null}
        <img className="scan-forest-tree" src={publicAssetUrl(FOREST_FRAME_PARTS.tree)} alt="" />
        <span className="scan-number">{card.number}</span>
        <h3 className="scan-title">{card.name}</h3>
        {card.alert && !hex ? <span className="scan-alert">!</span> : null}
        <ScanCategory category={card.category} />
        {hex && card.mark !== undefined ? (
          <span className="scan-story__mark">{card.mark}</span>
        ) : null}
        <div className="scan-copy">
          <ScanText text={text} />
          {card.scoringByPlayers ? (
            <ul className="scan-score-table">
              {card.scoringByPlayers.map((band) => (
                <li key={band.count}>
                  <span className="scan-text__labeled res-icon res-icon-score">{band.points}</span>
                  <span className="res-icon res-icon-llama" />
                  <span className="scan-score-count">{band.count}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </ScanPortrait>
  )
}
