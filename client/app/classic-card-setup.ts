import { useEffect, useState } from 'react'
import { cardAllowedForPlayerCount } from '../../shared/cards/player-count-filter'
import {
  classicCardsNeededPerType,
  classicPoolMessageParams,
  compareClassicPool,
  defaultClassicDeckIds,
  type ClassicCardCounts,
  type ClassicPoolShortfall,
} from '../../shared/contract/card-edition'
import { loadCardsManifest, type CardMeta } from '../services/card-meta'

type DeckCounts = ClassicCardCounts & { deck: string }
type ClassicSetup = Parameters<typeof classicCardsNeededPerType>[0]
type Translate = (key: string, params?: Record<string, string | number>) => string

type ClassicDeckPool =
  | { status: 'loading'; selectedDeckIds: [] }
  | { status: 'unavailable'; selectedDeckIds: [] }
  | { status: 'ready'; decks: DeckCounts[]; selectedDeckIds: string[]; defaultDeckIds: string[]; shortfall: ClassicPoolShortfall | null }

const isClassicDeck = (deck: string) => /^C[A-Z]+$/.test(deck)

function countClassicDecks(cards: readonly CardMeta[], playerCount: number): DeckCounts[] {
  const decks = new Map<string, DeckCounts>()
  for (const card of cards) {
    const type = card.type === 'playerAction' ? card.playerActionCardType : card.type
    if (type !== 'occupation' && type !== 'minor') continue
    let counts = decks.get(card.deck)
    if (!counts) {
      counts = { deck: card.deck, occupation: 0, minor: 0 }
      decks.set(card.deck, counts)
    }
    if (cardAllowedForPlayerCount(card.players, playerCount)) counts[type] += 1
  }
  return [...decks.values()].sort((a, b) => a.deck.localeCompare(b.deck))
}

export function useClassicDeckPool(
  active: boolean,
  setup: ClassicSetup,
  chosenDecks: readonly string[] | undefined,
): ClassicDeckPool {
  const [cards, setCards] = useState<readonly CardMeta[] | 'unavailable'>()
  useEffect(() => {
    if (!active) return
    let current = true
    void loadCardsManifest().then(
      manifest => {
        if (current) setCards(Object.values(manifest).filter(card => isClassicDeck(card.deck)))
      },
      () => { if (current) setCards('unavailable') },
    )
    return () => { current = false }
  }, [active])

  if (cards === 'unavailable') return { status: 'unavailable', selectedDeckIds: [] }
  if (!cards) return { status: 'loading', selectedDeckIds: [] }

  const decks = countClassicDecks(cards, setup.playerCount)
  const defaultDeckIds = defaultClassicDeckIds(decks.map(entry => entry.deck))
  const chosen = chosenDecks ?? defaultDeckIds
  const selected = decks.filter(entry => chosen.includes(entry.deck) && entry.occupation + entry.minor > 0)
  const selectedDeckIds = selected.map(entry => entry.deck)
  const eligible = { occupation: 0, minor: 0 }
  for (const deck of selected) {
    eligible.occupation += deck.occupation
    eligible.minor += deck.minor
  }
  return {
    status: 'ready',
    decks,
    defaultDeckIds,
    selectedDeckIds,
    shortfall: compareClassicPool(
      selectedDeckIds.length > 0 ? selectedDeckIds : defaultDeckIds,
      setup.playerCount,
      classicCardsNeededPerType(setup),
      eligible,
    ),
  }
}

export const classicPoolMessage = (t: Translate, shortfall: ClassicPoolShortfall): string =>
  t('platform.classicPoolInsufficient', classicPoolMessageParams(shortfall))

export function classicDeckPoolNotice(t: Translate, pool: ClassicDeckPool): string | null {
  if (pool.status === 'loading') return t('platform.classicPoolLoading')
  if (pool.status === 'unavailable') return t('platform.classicPoolUnavailable')
  if (pool.selectedDeckIds.length === 0 && pool.decks.some(deck => deck.occupation + deck.minor > 0)) {
    return t('platform.classicNoDeckSelected')
  }
  return pool.shortfall && classicPoolMessage(t, pool.shortfall)
}

export function toggleClassicDeck(chosen: readonly string[], deck: string): string[] {
  return chosen.includes(deck) ? chosen.filter(entry => entry !== deck) : [...chosen, deck]
}
