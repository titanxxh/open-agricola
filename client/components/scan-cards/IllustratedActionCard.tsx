import type { Locale } from '../../../shared/i18n'
import { FOREST_ACTION_FRAME_PARTS, type ScanIllustratedActionCard } from '../../../shared/scan-cards'
import { publicAssetUrl } from '../../utils/public-asset-url'
import { ActionFrame, ActionFrameBands } from './ActionFrame'
import { actionFrameRow, type ActionFrameBand } from './actionFrameRows'
import { ScanText } from './ScanText'
import { ScanCategory, ScanPortrait } from './ScanFrame'

// The panel closes above the art: the title band gains the vine turns of Crop Circles, a little shorter, the
// linen gains or loses rows between seams where the side posts repeat, and the bottom border and posts end there.
const closedPanel = (top: number, knot: number, middle: readonly ActionFrameBand[], bottom: number): readonly ActionFrameBand[] => [
  [0, 122, top, top + 122],
  [86, 122, top + 122, top + 157],
  [86, 122, top + 157, knot],
  ...middle,
  [740, 769, bottom, bottom + 29],
]

type Panel = { bands: readonly ActionFrameBand[]; artTop: number }

/** Where the X prints close the panel, and the face row (css px) their art starts at. */
const PANEL: Panel = {
  bands: closedPanel(0, 182.25, [[122, 311.25, 182.25, 371.5], [453, 740, 371.5, 658.5]], 658.5),
  artTop: 244,
}

/** The Forest prints close it at their own heights. */
const PANELS: Record<string, Panel> = {
  FE17_LandOfMilkAndHoney: {
    bands: closedPanel(0, 182.25, [[122, 202, 182.25, 263.07], [347, 740, 263.07, 660.1]], 660.1),
    artTop: 245,
  },
  FE18_WarriorPrincess: { bands: closedPanel(0, 182.25, [[122, 740, 182.25, 793.8]], 793.8), artTop: 295 },
  FE19_DragonsLair: { bands: closedPanel(0, 182.25, [[122, 740, 182.25, 798.2]], 798.2), artTop: 296 },
  FE20_FairyRing: {
    bands: closedPanel(0, 182.25, [[122, 188, 182.25, 248.26], [289, 422, 248.26, 381.27], [499, 740, 381.27, 622.3]], 622.3),
    artTop: 231,
  },
  FE21_TheRoadNotTaken: {
    bands: closedPanel(205, 394, [[122, 208, 394, 480.57], [462, 740, 480.57, 760.4]], 760.4),
    artTop: 0,
  },
}

// The forest prints lay the forest parchment's lower plate, a little flatter, into the panel and print the
// title band paler; each goes through its outline drawn on the official frame's own pixels.
const FOREST_PANEL = { left: 28, right: 604, top: 140, bottom: 758, source: '10 206 215 158' }
const FOREST_TONE = {
  paper: [[1, 0.0078], [0.7, 0.2898], [0.89, 0.0957]],
  title: [[1, 0.0275], [1, 0.0235], [1, 0.0706]],
} as const

function ForestPaper({ id, frame, bands }: { id: string; frame: string; bands: readonly ActionFrameBand[] }) {
  const top = actionFrameRow(bands, FOREST_PANEL.top)
  return (
    <>
      <defs>
        {(['panel', 'title'] as const).map((part) => (
          <mask key={part} id={`${id}-${part}`} maskUnits="userSpaceOnUse" x="0" y="0" width="628" height="1000">
            <ActionFrameBands href={publicAssetUrl(FOREST_ACTION_FRAME_PARTS[part])} bands={bands} />
          </mask>
        ))}
        {(['paper', 'title'] as const).map((part) => (
          <filter key={part} id={`${id}-${part}-tone`} colorInterpolationFilters="sRGB">
            <feComponentTransfer>
              {(['R', 'G', 'B'] as const).map((channel, i) => {
                const [slope, intercept] = FOREST_TONE[part][i]
                const Func = `feFunc${channel}` as const
                return <Func key={channel} type="linear" slope={slope} intercept={intercept} />
              })}
            </feComponentTransfer>
          </filter>
        ))}
      </defs>
      <g mask={`url(#${id}-title)`} filter={`url(#${id}-title-tone)`}>
        <ActionFrameBands href={frame} bands={bands} />
      </g>
      <g mask={`url(#${id}-panel)`}>
        <svg
          x={FOREST_PANEL.left}
          y={top}
          width={FOREST_PANEL.right - FOREST_PANEL.left}
          height={actionFrameRow(bands, FOREST_PANEL.bottom) - top}
          viewBox={FOREST_PANEL.source}
          preserveAspectRatio="none"
        >
          <image
            href={publicAssetUrl(FOREST_ACTION_FRAME_PARTS.parchment)}
            width="235"
            height="374"
            preserveAspectRatio="none"
            filter={`url(#${id}-paper-tone)`}
          />
        </svg>
      </g>
    </>
  )
}

export function IllustratedActionCard({ card, locale }: { card: ScanIllustratedActionCard; locale: Locale }) {
  const panel = PANELS[card.id] ?? PANEL
  const forest = card.deck === 'legendairy-forest'
  const frame = publicAssetUrl(card.frame)
  return (
    <ScanPortrait locale={locale} cardId={card.id} label={card.name} layout="illustrated-action">
      <div className="scan-illustrated scan-official-action" data-deck={card.deck}>
        <img className="scan-bottom-art" src={publicAssetUrl(card.art)} alt="" style={{ top: panel.artTop, height: 374 - panel.artTop }} />
        <ActionFrame src={frame} bands={panel.bands} className="scan-illustrated__frame">
          {forest ? <ForestPaper id={`scan-action-${card.id}`} frame={frame} bands={panel.bands} /> : null}
        </ActionFrame>
        {card.overlay ? <img className="scan-stack-over" src={publicAssetUrl(card.overlay)} alt="" /> : null}
        {forest ? <img className="scan-forest-tree" src={publicAssetUrl(FOREST_ACTION_FRAME_PARTS.tree)} alt="" /> : null}
        <h3 className="scan-title">{card.name}</h3>
        {card.flavor ? <div className="scan-flavor"><ScanText text={card.flavor} /></div> : null}
        <span className="scan-number">{card.number}</span>
        <ScanCategory category={card.category} />
        <div className="scan-copy">
          <ScanText text={card.text} />
        </div>
      </div>
    </ScanPortrait>
  )
}
