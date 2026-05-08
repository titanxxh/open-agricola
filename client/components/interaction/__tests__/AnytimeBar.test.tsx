import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import type { AnytimeAction } from '../../../../shared/contract/types'
import { AnytimeBar } from '../AnytimeBar'

describe('AnytimeBar', () => {
  it('falls back to the source card name when the anytime label translation is missing', () => {
    const actions: AnytimeAction[] = [
      {
        id: 'fallback-anytime',
        labelKey: 'cards.TESTONLY_FallbackPlaceholder.anytime',
        sourceCard: 'TESTONLY_FallbackPlaceholder',
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

    expect(html).toContain('TESTONLY Fallback Placeholder')
    expect(html).not.toContain('cards.TESTONLY_FallbackPlaceholder.anytime')
  })
})
