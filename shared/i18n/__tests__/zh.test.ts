import { describe, expect, it } from 'vitest'

import { t } from '..'
import { zh } from '../zh'

describe('zh platform translations', () => {
  it('uses drafting terminology for draft game setup', () => {
    expect(zh.platform.draftModeSimultaneous).toBe('轮抽')
    expect(zh.platform.draftPoolSizeLabel).toBe('轮抽池大小')
  })

  it('uses consistent Workshop sandbox terminology without changing English', () => {
    const terms = [
      ['platform.sandbox', '沙盒', 'Sandbox'],
      ['platform.openSandbox', '进入沙盒', 'Open Sandbox'],
      ['platform.resetSandbox', '重新配置沙盒', 'Reset Sandbox'],
      ['platform.resetSandboxTitle', '重新配置沙盒', 'Reset Sandbox'],
      ['platform.resetSandboxNoMine', '你还没有可加入沙盒的卡牌。', 'You do not have any cards available to add to Sandbox.'],
      ['platform.applySandbox', '应用到沙盒', 'Apply to Sandbox'],
      [
        'platform.resetSandboxEmpty',
        '当前没有额外自定义卡牌。你仍可以使用默认牌组开始沙盒测试，或点击“重新配置沙盒”继续配置。',
        'No extra custom cards are selected yet. You can still start with the default decks, or click "Reset Sandbox" to configure more cards.',
      ],
      ['platform.startSandbox', '开始沙盒测试', 'Start Sandbox'],
    ] as const

    for (const [key, chinese, english] of terms) {
      expect(t('zh', key)).toBe(chinese)
      expect(t('en', key)).toBe(english)
    }
  })

  it('uses Parent Cards terminology consistently without changing English', () => {
    expect(t('zh', 'ui.scoringParentCards')).toBe('父母卡')
    expect(t('zh', 'actions.complete-parent-father.name')).toBe('完成父亲卡')
    expect(t('en', 'ui.scoringParentCards')).toBe('Parent Cards')
    expect(t('en', 'actions.complete-parent-father.name')).toBe('Complete Father')
  })
})
