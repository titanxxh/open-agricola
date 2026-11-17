import { describe, expect, it } from 'vitest'

import { t } from '..'
import { parseActionReference } from '../../contract/action-reference'
import en from '../../../output/i18n/locales/en.json'
import zh from '../../../output/i18n/locales/zh.json'
import { catalogCardDefinitions } from '../../cards/catalog.generated'

type Named = { name?: string }

const cardNameCollisions = (english: Map<string, string>, sections: Array<Record<string, Named>>) => {
  const owners = new Map<string, Set<string>>()
  for (const faces of sections) {
    for (const [id, face] of Object.entries(faces)) {
      if (!face.name) continue
      const classic = /^C[A-Z]+\d{3}_/.test(id)
      const englishName = english.get(id)
      // Deferred classic imports have no verified English face to compare yet.
      if (classic && !englishName) continue
      const key = `${classic ? 'classic' : 'revised'}:${face.name}`
      const names = owners.get(key) ?? new Set<string>()
      names.add((englishName ?? id).toLowerCase())
      owners.set(key, names)
    }
  }
  return [...owners].filter(([, names]) => names.size > 1)
    .map(([name, names]) => `${name}: ${[...names].join(' / ')}`)
}

describe('zh platform translations', () => {
  it('places every A-E and Moor card in its translation section and translates its face', () => {
    type Face = { name?: string; description?: string; rules?: string; prerequisite?: string }
    const sections: Record<'minorImprovements' | 'occupations', Record<string, Face>> = {
      minorImprovements: zh.minorImprovements,
      occupations: zh.occupations,
    }
    for (const [section, faces] of Object.entries(sections)) {
      for (const id of Object.keys(faces)) {
        const number = /^[A-E](\d{3})_/.exec(id)?.[1]
        if (number) expect(section, id).toBe(Number(number) <= 84 ? 'minorImprovements' : 'occupations')
      }
    }
    const missing: string[] = []
    for (const card of catalogCardDefinitions.filter((card) => /^[A-EM]\d{3}_/.test(card.id))) {
      const section: keyof typeof sections = card.kind === 'occupation' || card.playerActionCardType === 'occupation'
        ? 'occupations' : 'minorImprovements'
      const wrongSection = section === 'occupations' ? 'minorImprovements' : 'occupations'
      expect(sections[wrongSection]?.[card.id], `${card.id} is in the wrong section`).toBeUndefined()
      const translation = sections[section]?.[card.id]
      if (!translation?.name || !translation.description) missing.push(card.id)
      else {
        expect(translation.name, card.id).toMatch(/[\u4e00-\u9fff]/)
        expect(translation.description, card.id).toMatch(/[\u4e00-\u9fff]/)
        if (card.rules?.length) expect(translation.rules, `${card.id}.rules`).toBeTruthy()
        if (typeof card.prerequisite === 'string') expect(translation.prerequisite, `${card.id}.prerequisite`).toBeTruthy()
      }
    }
    expect(missing).toEqual([])
  })

  it('gives verified cards with different English names different Chinese names within each edition', () => {
    const english = new Map<string, string>(catalogCardDefinitions.map((card) => [card.id, card.name]))
    for (const faces of [en.minorImprovements, en.occupations, en.improvements] as Array<Record<string, Named>>) {
      for (const [id, face] of Object.entries(faces)) {
        if (face.name) english.set(id, face.name)
      }
    }
    expect(cardNameCollisions(english, [zh.minorImprovements, zh.occupations, zh.improvements])).toEqual([])
  })

  it('allows cross-edition names and deferred imports while still rejecting known collisions', () => {
    const english = new Map([['B104_SheepWalker', 'Sheep Walker'], ['CE203_Shepherd', 'Shepherd']])
    const faces = { B104_SheepWalker: { name: '牧羊人' }, CE203_Shepherd: { name: '牧羊人' }, CNL064_Sheepherder: { name: '牧羊人' } }
    expect(cardNameCollisions(english, [faces])).toEqual([])
    english.set('CNL064_Sheepherder', 'Sheepherder')
    expect(cardNameCollisions(english, [faces])).toEqual(['classic:牧羊人: shepherd / sheepherder'])
    expect(cardNameCollisions(english, [{ B104_SheepWalker: { name: '牧羊人' }, B999_Untranslated: { name: '牧羊人' } }]))
      .toEqual(['revised:牧羊人: sheep walker / b999_untranslated'])
  })

  it('labels player action cards with the name on the card face', () => {
    type Named = { name?: string }
    const faces: Record<string, Named> = { ...zh.minorImprovements, ...zh.occupations }
    const mismatched = Object.entries(zh.cards as Record<string, Named>)
      .filter(([id, label]) => label.name && faces[id]?.name && label.name !== faces[id]!.name)
      .map(([id, label]) => `${id}: ${label.name} / ${faces[id]!.name}`)
    expect(mismatched).toEqual([])
  })

  it('uses Chinese action and card references in Chinese card text', () => {
    const untranslated: string[] = []
    const visit = (value: unknown, key: string) => {
      if (typeof value === 'string') {
        for (const reference of value.matchAll(/__([^_]+)__/g)) {
          const label = parseActionReference(reference[1])?.label ?? reference[1]
          if (/[a-z]/i.test(label)) untranslated.push(`${key}: ${label}`)
        }
      } else if (value && typeof value === 'object') {
        for (const [child, entry] of Object.entries(value)) visit(entry, `${key}.${child}`)
      }
    }
    visit(zh.minorImprovements, 'minorImprovements')
    visit(zh.occupations, 'occupations')
    expect(untranslated).toEqual([])
  })

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
      ['platform.sandboxVariantFarmersOfTheMoor', '沼泽农夫', 'Farmers of the Moor'],
      ['platform.sandboxAllowIncompleteFarmersOfTheMoorMinorDeal', '允许沼泽农夫小改良池不完整', 'Allow incomplete Farmers of the Moor minor pool'],
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
