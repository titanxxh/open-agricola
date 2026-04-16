import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import type { GameState } from '../../../../shared/game/types'
import { LogPanel } from '../LogPanel'

const stripHtml = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

describe('LogPanel', () => {
  it('renders returned card in improvement log and separate card gain log', () => {
    const log: GameState['log'] = [
      {
        key: 'log.playMinorImprovement',
        params: {
          player: 'Player B',
          improvements: 'C60_SmallPottersOven',
          costResources: { clay: 2 },
          returnedCards: ['Major_ClayOven'],
        },
      },
      {
        key: 'log.cardEffectGain',
        params: {
          player: 'Player B',
          cardId: 'C60_SmallPottersOven',
          gain: { food: 5 },
        },
      },
    ]

    const html = renderToStaticMarkup(<LogPanel locale="en" log={log} />)
    const text = stripHtml(html)

    expect(text).toContain("Player B plays minor improvement: Small Potter's Oven")
    expect(text).toContain('Returns Clay Oven')
    expect(text).toContain("Player B gains")
    expect(text).toContain("from Small Potter's Oven")
    expect(html).toContain('data-resource="clay"')
    expect(html).toContain('data-amount="2"')
    expect(html).toContain('data-resource="food"')
    expect(html).toContain('data-amount="5"')
  })

  it('renders bonus VP card logs with icon chips', () => {
    const log: GameState['log'] = [
      {
        key: 'log.cardEffectBonusVp',
        params: {
          player: 'Player A',
          cardId: 'A37_Bucksaw',
        },
      },
    ]

    const html = renderToStaticMarkup(<LogPanel locale="en" log={log} />)
    const text = stripHtml(html)

    expect(text).toContain('Player A gains')
    expect(text).toContain('from Bucksaw')
    expect(html).toContain('data-resource="bonusVp"')
    expect(html).toContain('data-amount="1"')
  })

  it('linkifies action detail cards from nested effect payload', () => {
    const log: GameState['log'] = [
      {
        key: 'log.actionDetail',
        params: {
          player: 'Player A',
          action: 'actions.farm-expansion.name',
          detailParts: {
            effects: {
              improvements: ['Major_ClayOven'],
              minorImprovements: ['C60_SmallPottersOven'],
            },
          },
        },
      },
    ]

    const html = renderToStaticMarkup(<LogPanel locale="en" log={log} />)
    const text = stripHtml(html)

    expect(text).toContain('Clay Oven')
    expect(text).toContain("Small Potter's Oven")
    expect(html.match(/log-card-link/g)?.length ?? 0).toBe(2)
  })
})
