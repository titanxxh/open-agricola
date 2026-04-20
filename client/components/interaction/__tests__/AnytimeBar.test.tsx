import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import type { AnytimeAction } from '../../../../shared/game/types'
import { AnytimeBar } from '../AnytimeBar'

describe('AnytimeBar', () => {
  it('falls back to the source card name when the anytime label translation is missing', () => {
    const actions: AnytimeAction[] = [
      {
        id: 'plow-builder-anytime',
        labelKey: 'cards.E91_PlowBuilder.anytime',
        sourceCard: 'E91_PlowBuilder',
      },
    ]

    const html = renderToStaticMarkup(
      <AnytimeBar
        anytimeActions={actions}
        locale="zh"
        isInteractive={true}
        takeAnytimeAction={() => {}}
      />,
    )

    expect(html).toContain('犁具建造者')
    expect(html).not.toContain('cards.E91_PlowBuilder.anytime')
  })
})
