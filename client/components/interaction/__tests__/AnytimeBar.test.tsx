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

  it('renders C115 Sower anytime label accurately in Chinese', () => {
    const actions: AnytimeAction[] = [
      {
        id: 'C115-sower-anytime',
        labelKey: 'cards.C115_Sower.anytime',
        sourceCard: 'C115_Sower',
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

    expect(html).toContain('播种者：取1芦苇或换取播种行动')
    expect(html).not.toContain('付1食物')
    expect(html).not.toContain('获1谷物')
  })
})
