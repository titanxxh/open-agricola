type IconName = { readonly nameKey: string }

/** What each inline card-text icon means, as existing language-pack names; arrows are typography only. */
const CARD_TEXT_ICON_NAMES = {
  WOOD: [{ nameKey: 'resources.wood' }],
  CLAY: [{ nameKey: 'resources.clay' }],
  REED: [{ nameKey: 'resources.reed' }],
  STONE: [{ nameKey: 'resources.stone' }],
  FOOD: [{ nameKey: 'resources.food' }],
  GRAIN: [{ nameKey: 'resources.grain' }],
  VEGETABLE: [{ nameKey: 'resources.vegetable' }],
  SHEEP: [{ nameKey: 'resources.sheep' }],
  BOAR: [{ nameKey: 'resources.boar' }],
  PIG: [{ nameKey: 'resources.boar' }],
  CATTLE: [{ nameKey: 'resources.cattle' }],
  HORSE: [{ nameKey: 'resources.horse' }],
  FUEL: [{ nameKey: 'resources.fuel' }],
  STABLE: [{ nameKey: 'resources.stable' }],
  BEGGING: [{ nameKey: 'resources.begging' }],
  SCORE: [{ nameKey: 'resources.bonusVp' }],
  ARROW: [],
  'ARROW-1X': [],
  'ARROW-2X': [],
  BAKE: [{ nameKey: 'actions.bake-bread.name' }],
  FIELD: [{ nameKey: 'ui.ruleTerrain.field' }],
  FOREST: [{ nameKey: 'ui.ruleTerrain.forest' }],
  MOOR: [{ nameKey: 'ui.ruleTerrain.moor' }],
  FENCE: [{ nameKey: 'resources.fence' }],
  GRAIN_VEG_STACK: [{ nameKey: 'resources.grain' }, { nameKey: 'resources.vegetable' }],
} as const satisfies Record<string, readonly IconName[]>

export type CardTextIconToken = keyof typeof CARD_TEXT_ICON_NAMES

const ICON_TOKEN = /<([A-Z0-9_-]+)>/g

export const isCardTextIconToken = (token: string): token is CardTextIconToken =>
  Object.hasOwn(CARD_TEXT_ICON_NAMES, token)

export const cardTextIconTokens = (text: string): string[] => [...text.matchAll(ICON_TOKEN)].map((match) => match[1])

export const cardTextIconNameKeys = (token: string): readonly string[] | undefined =>
  isCardTextIconToken(token) ? CARD_TEXT_ICON_NAMES[token].map((name) => name.nameKey) : undefined

/** Plain words for search: icons become names, `[label]` and `__emphasis__` keep only their text. */
export const searchableCardText = (text: string, iconWords: (token: CardTextIconToken) => string): string =>
  text
    .replace(ICON_TOKEN, (_, token: string) => {
      if (!isCardTextIconToken(token)) throw new Error(`Card text uses an icon without a name: <${token}>`)
      return ` ${iconWords(token)} `
    })
    .replace(/\[([^\]]*)\]/g, ' $1 ')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/__/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
