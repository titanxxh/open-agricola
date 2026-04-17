import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import type { PlayerScoreSummary } from '../../../../shared/logic/scoring'
import { ScoringPad } from '../ScoringPad'

describe('ScoringPad', () => {
  it('falls back to a readable card name when card translation is missing', () => {
    const scores: PlayerScoreSummary[] = [
      {
        playerId: 'p1',
        playerName: 'Player 1',
        total: 1,
        categories: [
          {
            key: 'cards',
            total: 1,
            entries: [
              {
                type: 'card',
                cardId: 'A92_AdoptiveParents',
                cardType: 'occupation',
                score: 1,
              },
            ],
          },
        ],
      },
    ]

    const html = renderToStaticMarkup(
      <ScoringPad locale="zh" scores={scores} onClose={() => {}} />,
    )

    expect(html).toContain('· Adoptive Parents')
    expect(html).not.toContain('occupations.A92_AdoptiveParents.name')
  })
})
