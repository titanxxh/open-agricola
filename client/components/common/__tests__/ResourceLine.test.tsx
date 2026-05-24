import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ResourceLine } from '../ResourceLine'

describe('ResourceLine supply tokens', () => {
  it('renders fence and stable payment tokens', () => {
    const html = renderToStaticMarkup(
      <ResourceLine locale="en" mode="payment" resources={{ fence: 1, stable: 1 }} />,
    )

    expect(html).toContain('data-resource="fence"')
    expect(html).toContain('res-icon-fence-icon')
    expect(html).toContain('data-resource="stable"')
    expect(html).toContain('res-icon-barn')
  })

  it('does not render supply-token keys in default inventory mode', () => {
    const html = renderToStaticMarkup(
      <ResourceLine locale="en" resources={{ fence: 1, stable: 1 }} />,
    )

    expect(html).not.toContain('data-resource="fence"')
    expect(html).not.toContain('data-resource="stable"')
  })
})
