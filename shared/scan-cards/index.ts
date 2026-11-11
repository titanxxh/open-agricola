import { SCAN_BACKS, SCAN_CARDS } from './records'
import { SCAN_RESHUFFLE_LINE, scanTextArt } from './text'
import type { ScanCard, ScanDeck, ScanScoreBand, ScanSkinCard } from './types'

export type {
  ScanAlienArtifactCard,
  ScanBack,
  ScanCard,
  ScanCategory,
  ScanCropCirclesCard,
  ScanDeck,
  ScanAlienEventCard,
  ScanEventCard,
  ScanExpansionRulesCard,
  ScanGroup,
  ScanGuestCard,
  ScanIllustratedActionCard,
  ScanLayout,
  ScanForestEventCard,
  ScanOffspringCard,
  ScanScoreBand,
  ScanSkinCard,
  ScanSpaceMerchantCard,
} from './types'
export { SCAN_BACKS, SCAN_CARDS }
export { SCAN_RESHUFFLE_LINE, SCAN_TEXT_ICONS, parseScanText, scanPlainText, scanTextArt } from './text'

const byId = new Map(SCAN_CARDS.map((card) => [card.id, card]))

export const getScanCard = (id: string): ScanCard | undefined => byId.get(id)

export const isScanSkin = (card: ScanCard): card is ScanSkinCard =>
  card.layout === 'occupation' || card.layout === 'minor' || card.layout === 'major'

/** The forest scoring table, one band per line: the llama count, then the points it scores. */
const scanScoreTable = (bands: readonly ScanScoreBand[]): string =>
  bands.map((band) => `${band.count} [icon:llama] [icon:arrow] ${band.points} [icon:score]`).join('\n')

/** Everything the face prints as words, in reading order, in scan-text markup. */
export const scanPrintedText = (card: ScanCard): string => [
  card.layout === 'illustrated-action' ? card.flavor : undefined,
  card.text,
  card.layout === 'event' && card.scoringByPlayers ? scanScoreTable(card.scoringByPlayers) : undefined,
  card.layout === 'event' && card.timing === 'reshuffle' ? SCAN_RESHUFFLE_LINE : undefined,
].filter(Boolean).join('\n\n')

const BADGE_DIR: Record<ScanDeck, string> = {
  L: 'l-deck',
  X: 'x-deck',
  'legendairy-forest': 'legendairy-forest',
}

export const scanBadgePath = (deck: ScanDeck): string =>
  `/assets/${BADGE_DIR[deck]}/badges/deck.png`

/** Parts the offspring face lays over the official major slice: the plate paper and the panel-corner sprig. */
export const OFFSPRING_FRAME_PARTS = {
  parchment: '/assets/changelings/frames/parchment.jpg',
  sprig: '/assets/changelings/frames/sprig.png',
} as const

/** Parts the forest story faces lay on their bronze tiles besides the wood inlay: plate paper, the official sprigs, the number tree. */
export const FOREST_FRAME_PARTS = {
  parchment: '/assets/legendairy-forest/frames/parchment.jpg',
  sprigs: '/assets/revised/meeples.png',
  tree: '/assets/legendairy-forest/icons/tree.png',
} as const

/**
 * Parts the forest actions close their action-frame panel with: the outlines of the frame's linen and title band
 * (drawn on its pixels), the forest parchment, the number tree.
 */
export const FOREST_ACTION_FRAME_PARTS = {
  panel: '/assets/revised/action_frame_panel.png',
  title: '/assets/revised/action_frame_title.png',
  parchment: FOREST_FRAME_PARTS.parchment,
  tree: FOREST_FRAME_PARTS.tree,
} as const

/** Parts the landscape events print on their gold plate: the occupation slice for its mottle, the band scrollwork, the panel sprig. */
export const LANDSCAPE_FRAME_PARTS = {
  gold: '/assets/revised/card_frames.jpg',
  scroll: '/assets/le01-le04/frames/scroll.png',
  sprig: OFFSPRING_FRAME_PARTS.sprig,
} as const

/**
 * Parts a guest face is built from around its window and its frame, the title scroll cut from the print: the
 * occupation slice for the band mottle and the leaves, the forest parchment in the panel, the offspring sprig.
 */
export const GUEST_FRAME_PARTS = {
  gold: '/assets/revised/card_frames.jpg',
  parchment: FOREST_FRAME_PARTS.parchment,
  sprig: OFFSPRING_FRAME_PARTS.sprig,
} as const

/** Parts the alien artifacts build their green minor frame from: the minor slice, the official panel linen, the window sprigs. */
export const ALIEN_ARTIFACT_FRAME_PARTS = {
  slice: '/assets/revised/card_frames.jpg',
  linen: '/assets/revised/action_frame_bg.jpg',
  sprigLeft: '/assets/x-deck/frames/artifact-sprig-left.png',
  sprigRight: '/assets/x-deck/frames/artifact-sprig-right.png',
} as const

/** Images a face paints itself. An empty list means the face is text and chrome only. */
export const scanFaceAssets = (card: ScanCard): readonly string[] => {
  const assets: string[] = []
  if (card.art) assets.push(card.art)
  if (card.frame) assets.push(card.frame)
  if (card.overlay) assets.push(card.overlay)
  if (isScanSkin(card) || card.layout === 'illustrated-action') {
    assets.push(scanBadgePath(card.deck))
    if (card.layout === 'illustrated-action' && card.deck === 'legendairy-forest') {
      assets.push(...Object.values(FOREST_ACTION_FRAME_PARTS))
    }
  } else if (card.layout === 'alien-artifact') {
    assets.push(scanBadgePath('X'), ALIEN_ARTIFACT_FRAME_PARTS.linen)
    if (!card.passing) assets.push(ALIEN_ARTIFACT_FRAME_PARTS.sprigLeft, ALIEN_ARTIFACT_FRAME_PARTS.sprigRight)
  } else if (card.layout === 'event') {
    assets.push(scanBadgePath(card.deck), FOREST_FRAME_PARTS.parchment, FOREST_FRAME_PARTS.tree)
    if (card.window === 'hex') assets.push(FOREST_FRAME_PARTS.sprigs)
  } else if (card.layout === 'space-merchant' || card.layout === 'alien-event' || card.layout === 'crop-circles') {
    assets.push(scanBadgePath('X'))
  } else if (card.layout === 'offspring') {
    assets.push(scanBadgePath('L'), OFFSPRING_FRAME_PARTS.parchment, OFFSPRING_FRAME_PARTS.sprig)
  } else if (card.layout === 'landscape-event') {
    assets.push(LANDSCAPE_FRAME_PARTS.gold, LANDSCAPE_FRAME_PARTS.scroll, LANDSCAPE_FRAME_PARTS.sprig)
  } else if (card.layout === 'guest') {
    assets.push(GUEST_FRAME_PARTS.gold, GUEST_FRAME_PARTS.parchment, GUEST_FRAME_PARTS.sprig)
  }
  assets.push(...scanTextArt(scanPrintedText(card)))
  if (isScanSkin(card) && card.prerequisite) assets.push(...scanTextArt(card.prerequisite))
  return assets
}
