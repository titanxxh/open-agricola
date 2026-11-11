export type ScanDeck = 'L' | 'X' | 'legendairy-forest'

export type ScanGroup = 'L' | 'X' | 'legendairyForest' | 'LE' | 'changelings' | 'newdale'

export type ScanCost = Partial<Record<
  'wood' | 'clay' | 'reed' | 'stone' | 'food' | 'grain' | 'vegetable' | 'sheep' | 'boar' | 'cattle',
  number
>>

export type ScanCategory =
  | 'ACTIONS_BOOSTER'
  | 'LIVESTOCK_PROVIDER'
  | 'BUILDING_RESOURCE_PROVIDER'
  | 'FARM_PLANNER'
  | 'CROP_PROVIDER'
  | 'FOOD_PROVIDER'
  | 'GOODS_PROVIDER'
  | 'POINTS_PROVIDER'

export type ScanScoreBand = { readonly points: number; readonly count: string }

type ScanBase = {
  readonly id: string
  readonly name: string
  readonly art: string
  readonly frame: string
  /** Art the original prints past its window: a transparent layer the size of the whole face, above the frame. */
  readonly overlay?: string
  readonly category?: ScanCategory
  readonly text: string
  readonly group: ScanGroup
}

export type ScanSkinCard = ScanBase & {
  readonly layout: 'occupation' | 'minor' | 'major'
  readonly deck: ScanDeck
  readonly number: string
  readonly players?: string
  readonly vp?: number
  readonly cost?: ScanCost
  readonly prerequisite?: string
  readonly isCookery?: boolean
}

export type ScanAlienArtifactCard = ScanBase & {
  readonly layout: 'alien-artifact'
  readonly deck: 'X'
  readonly number: string
  readonly vp?: number
  /** Side ornaments are arrows rather than sprigs, as on Replicator. */
  readonly passing?: boolean
  /** The bonus-points coin beside the window, as on Ley Lines. */
  readonly bonusPoints?: true
}

export type ScanIllustratedActionCard = ScanBase & {
  readonly layout: 'illustrated-action'
  readonly deck: 'X' | 'legendairy-forest'
  readonly number: string
  readonly flavor?: string
}

type ScanBandFields = {
  readonly deck: 'X'
  readonly number: string
  readonly bannerKind?: 'cost' | 'score'
  readonly bannerValue?: number
  readonly claim?: boolean
}

export type ScanSpaceMerchantCard = ScanBase & ScanBandFields & {
  readonly layout: 'space-merchant'
}

export type ScanAlienEventCard = ScanBase & ScanBandFields & {
  readonly layout: 'alien-event'
  /** The bonus-points coin under the number, as on Candy Trail. */
  readonly bonusPoints?: true
}

export type ScanForestEventCard = ScanBase & {
  readonly layout: 'event'
  readonly deck: 'legendairy-forest'
  readonly number: string
  readonly timing: 'on-draw' | 'reshuffle'
  readonly alert?: boolean
  readonly scoringByPlayers?: readonly ScanScoreBand[]
  /** Hex between brown bands, as on the unicorn stories. The pointed story window stays the default. */
  readonly window?: 'hex'
  readonly mark?: number
}

export type ScanEventCard = ScanBase & {
  readonly layout: 'landscape-event'
  readonly number: string
  readonly scope: 'all-players'
  readonly when: 'game-start'
}

export type ScanOffspringCard = ScanBase & {
  readonly layout: 'offspring'
  readonly deck: 'L'
  readonly number: string
  readonly assign: 'offspring'
  readonly feeding?: string
}

export type ScanGuestCard = ScanBase & {
  readonly layout: 'guest'
  readonly uses: 1
}

export type ScanCropCirclesCard = ScanBase & {
  readonly layout: 'crop-circles'
  readonly deck: 'X'
  readonly number: string
  readonly covers: 2
  readonly blocksBuilding: true
}

export type ScanExpansionRulesCard = ScanBase & {
  readonly layout: 'expansion-rules'
}

export type ScanCard =
  | ScanSkinCard
  | ScanAlienArtifactCard
  | ScanIllustratedActionCard
  | ScanSpaceMerchantCard
  | ScanAlienEventCard
  | ScanForestEventCard
  | ScanEventCard
  | ScanOffspringCard
  | ScanGuestCard
  | ScanCropCirclesCard
  | ScanExpansionRulesCard

export type ScanBack = { readonly id: string; readonly art: string }

export type ScanLayout = ScanCard['layout']
