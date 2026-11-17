import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { t } from '../../../../shared/i18n'
import { renderEffectPreview } from '../ActionDescription'

describe('exchange choice scoring previews', () => {
  it.each(['en', 'zh'] as const)('shows an explicit zero-point offer in %s', locale => {
    const html = renderToStaticMarkup(renderEffectPreview(locale, {
      kind: 'resourceExchange', resourcesPaid: { food: 0 }, bonusVp: 0,
    }))
    expect(html).toContain(t(locale, 'ui.interactionPaymentFree'))
    expect(html).toContain(`aria-label="0 ${t(locale, 'resources.bonusVp')}"`)
  })

  it('does not add a zero-point reward to ordinary resource exchanges', () => {
    const html = renderToStaticMarkup(renderEffectPreview('en', {
      kind: 'resourceExchange', resourcesPaid: { grain: 1 }, resourcesGained: { food: 1 },
    }))
    expect(html).toContain('aria-label="1 Food"')
    expect(html).not.toContain('data-resource="bonusVp"')
  })

  it('retains the cost and positive score of an investment', () => {
    const html = renderToStaticMarkup(renderEffectPreview('en', {
      kind: 'resourceExchange', resourcesPaid: { food: 1 }, bonusVp: 1,
    }))
    expect(html).toContain('aria-label="1 Food"')
    expect(html).toContain(`aria-label="1 ${t('en', 'resources.bonusVp')}"`)
  })
})
