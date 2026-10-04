import { describe, expect, it } from 'vitest'
import { t } from '../../../../shared/i18n'
import { ACTION_ICON_DESC, ACTION_TOOLTIP_DESC, ACTION_TOOLTIP_TEXT } from '../action-descriptions'

describe('action board description translations', () => {
  for (const [tableName, table] of Object.entries({ ACTION_ICON_DESC, ACTION_TOOLTIP_DESC })) {
    it(`translates every text token in ${tableName}`, () => {
      for (const [actionId, lines] of Object.entries(table)) {
        for (const line of lines) {
          // Numbers, punctuation and resource icons are language independent.
          expect(line.replace(/<[^>]+>|\[[^\]]+\]/g, ''), actionId).not.toMatch(/[a-z]/i)
          for (const [token, key] of line.matchAll(/\[([^\]]+)\]/g)) {
            if (!/[a-z]/i.test(key)) continue
            for (const locale of ['en', 'zh'] as const) {
              expect(t(locale, key), `${actionId}: ${token} (${locale})`).not.toBe(key)
            }
            expect(t('zh', key), `${actionId}: ${token}`).toMatch(/[\u4e00-\u9fff]/)
          }
        }
      }
    })
  }

  it('translates every full tooltip rule in both languages', () => {
    for (const [actionId, keys] of Object.entries(ACTION_TOOLTIP_TEXT)) {
      for (const key of keys) {
        for (const locale of ['en', 'zh'] as const) {
          expect(t(locale, key), `${actionId} (${locale})`).not.toBe(key)
        }
        expect(t('zh', key), actionId).toMatch(/[\u4e00-\u9fff]/)
      }
    }
  })
})
