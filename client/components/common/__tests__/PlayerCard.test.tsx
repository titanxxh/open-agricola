import { beforeEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { PlayerCard } from '../PlayerCard'
import {
  clearCustomCardMetadata,
  registerCustomCardMetadata,
} from '../../../../shared/cards/custom-card-metadata'
import { loadCardsManifest } from '../../../services/card-meta'
import { publicAssetUrl } from '../../../utils/public-asset-url'
import { zh } from '../../../../shared/i18n/zh'
import { getAnyCardDisplayName, translateCardText } from '../cardText'
import { resolveCardDisplayName, resolveCardRef } from '../../board/card-reference'
import { ActionLog } from '../../board/ActionLog'
// Cards-manifest is preloaded by `client/__tests__/setup-card-manifest.ts`.

describe('PlayerCard dual-type rendering (alsoCountsAs)', () => {
  beforeEach(() => {
    clearCustomCardMetadata()
  })

  it('uses the same card-local name in the face, trigger label, prompt, and log', () => {
    registerCustomCardMetadata({
      cardType: 'minor',
      cardJson: {
        id: 'CUSTOM_LocalName', name: 'English name', deck: 'CUSTOM', number: 0,
        desc: ['English description.'], implemented: true,
        locales: { zh: { name: '统一卡名', desc: ['中文说明。'] } },
      },
    })
    const html = renderToStaticMarkup(<PlayerCard locale="zh" cardId="CUSTOM_LocalName" cardType="minor" />)
    expect(html).toContain('统一卡名')
    expect(getAnyCardDisplayName('zh', 'CUSTOM_LocalName')).toBe('统一卡名')
    expect(resolveCardDisplayName('zh', 'CUSTOM_LocalName')).toBe('统一卡名')
    expect(translateCardText('zh', '{card:CUSTOM_LocalName}：继续？')).toBe('统一卡名：继续？')
    expect(getAnyCardDisplayName('en', 'CUSTOM_LocalName')).toBe('English name')
  })

  it('uses the translated Moor major description on its face', () => {
    const html = renderToStaticMarkup(<PlayerCard locale="zh" cardId="Major_Moor_HeatingOven" cardType="major" />)
    expect(html).toContain('需要供暖的房间数减少1间。')
    expect(html).toContain('res-icon-fuel')
    expect(html).not.toContain('Gain 2 fuel')
  })

  it('renders card-local Chinese names and default player names in actual log rows', () => {
    registerCustomCardMetadata({
      cardType: 'minor',
      cardJson: {
        id: 'CUSTOM_LocalLogName', name: 'Gleaner', deck: 'CUSTOM', number: 0,
        desc: ['Gain 1 wood.'], implemented: true,
        locales: { zh: { name: '拾穗者', desc: ['获得1木材。'] } },
      },
    })
    const html = renderToStaticMarkup(
      <ActionLog locale="zh" currentRound={1} log={[{
        key: 'log.cardEffectGain',
        params: { player: 'Player 1', cardId: 'CUSTOM_LocalLogName', gain: { wood: 1 } },
      }]} />,
    )
    expect(html).toContain('拾穗者')
    expect(html).toContain('玩家 1')
    expect(html).not.toContain('Gleaner')
    expect(html).not.toContain('Player 1')
  })

  it('resolves the Hammer Crusher prompt from the same card name as the face', () => {
    expect(translateCardText('zh', 'ui.interactionHammerCrusherBuild')).toBe('锤碎机：建造房间？')
    expect(translateCardText('en', 'ui.interactionHammerCrusherBuild')).toBe('Hammer Crusher: Build rooms?')
  })

  it.each([
    ['D023_PioneeringSpirit', '开拓精神'],
    ['A039_Chapel', '小教堂'],
  ])('uses the canonical name instead of the old cards namespace alias for %s', (id, name) => {
    expect(translateCardText('zh', `cards.${id}.name`)).toBe(name)
    expect(getAnyCardDisplayName('zh', id)).toBe(name)
  })

  it('uses metadata card type when an old translation is in the wrong section', () => {
    expect(resolveCardRef('en', 'A106_SlurrySpreader')?.type).toBe('occupation')
    expect(resolveCardRef('en', 'A162_ForestTallyman')?.type).toBe('occupation')
    expect(resolveCardRef('zh', 'D023_PioneeringSpirit')?.type).toBe('minor')
  })

  it.each(['zh', 'en'] as const)('renders boar icons without stray brackets in %s', (locale) => {
    for (const id of ['B179_WildBoarHunter', 'B180_GameTeaser', 'C180_Trapper', 'D180_PartTimeWorker', 'M115_OakBark']) {
      const html = renderToStaticMarkup(<PlayerCard locale={locale} cardId={id} cardType={id.startsWith('M') ? 'minor' : 'occupation'} />)
      expect(html, id).toContain('res-icon-boar')
      expect(html, id).not.toContain('&lt;')
      expect(html, id).not.toContain('&gt;')
    }
  })

  it('renders translated prerequisites with the same markup as the card description', () => {
    const html = renderToStaticMarkup(<PlayerCard locale="zh" cardId="A003_PaperKnife" cardType="minor" />)
    expect(html).toContain('手中有3张职业牌')
    expect(html).not.toContain('__职业__')
    expect(html).not.toContain('3 Occupations in Hand')
  })

  it('marks D060_LargePottery with data-also-counts-as="major"', () => {
    const html = renderToStaticMarkup(
      <PlayerCard locale="en" cardId="D060_LargePottery" cardType="minor" />,
    )
    expect(html).toContain('data-also-counts-as="major"')
  })

  it('marks D059_EarthOven with data-also-counts-as="major"', () => {
    const html = renderToStaticMarkup(
      <PlayerCard locale="en" cardId="D059_EarthOven" cardType="minor" />,
    )
    expect(html).toContain('data-also-counts-as="major"')
  })

  it('marks A060_OrientalFireplace with data-also-counts-as="major"', () => {
    const html = renderToStaticMarkup(
      <PlayerCard locale="en" cardId="A060_OrientalFireplace" cardType="minor" />,
    )
    expect(html).toContain('data-also-counts-as="major"')
  })

  it('renders D60 prerequisite separately and keeps the cost area resource-only', () => {
    const html = renderToStaticMarkup(
      <PlayerCard locale="en" cardId="D060_LargePottery" cardType="minor" />,
    )
    expect(html).toContain('Return the Pottery')
    expect(html).not.toContain('card-cost-return')
    expect(html).toContain('card-res-icon clay')
    expect(html).toContain('card-res-icon stone')
  })

  it('renders C60 prerequisite separately and keeps the cost area resource-only', () => {
    const html = renderToStaticMarkup(
      <PlayerCard locale="en" cardId="C060_SmallPottersOven" cardType="minor" />,
    )
    expect(html).toContain('Return the Clay / Stone Oven')
    expect(html).not.toContain('card-cost-return')
    expect(html).toContain('card-res-icon clay')
  })

  it('renders zero-cost returnCards as a prerequisite badge', () => {
    const html = renderToStaticMarkup(
      <PlayerCard locale="en" cardId="A060_OrientalFireplace" cardType="minor" />,
    )
    expect(html).toContain('card-prerequisite')
    expect(html).toContain('Return Fireplace/Cooking Hearth')
    expect(html).not.toContain('card-cost-return')
  })

  it('does not emit data-also-counts-as on plain (non-dual) minors', () => {
    const html = renderToStaticMarkup(
      // D34 is a plain minor with no alsoCountsAs; picking it keeps this
      // test independent of any dual-type flag regressions on other cards.
      <PlayerCard locale="en" cardId="D034_LuxuriousHostel" cardType="minor" />,
    )
    expect(html).not.toContain('data-also-counts-as=')
  })

  it('renders desc placeholders as inline icons (no literal <WOOD> text)', () => {
    // E076_LumberPile description contains <WOOD> and <STABLE> placeholders.
    const html = renderToStaticMarkup(
      <PlayerCard locale="zh" cardId="E076_LumberPile" cardType="minor" />,
    )
    expect(html).toContain('res-icon-wood')
    expect(html).toContain('res-icon-barn')
    expect(html).not.toContain('&lt;WOOD&gt;')
    expect(html).not.toContain('<WOOD>')
  })

  it('renders localized supplemental rules separately from printed text', () => {
    const english = renderToStaticMarkup(
      <PlayerCard locale="en" cardId="A094_LazySowman" cardType="occupation" />,
    )
    const chinese = renderToStaticMarkup(
      <PlayerCard locale="zh" cardId="A094_LazySowman" cardType="occupation" />,
    )

    expect(english).toContain('Each time you decline an unconditional')
    expect(english).toContain('even if it is occupied')
    expect(english).toContain('class="card-rules"')
    expect(english).toContain('Rules')
    expect(english).toContain('cannot be placed on')

    expect(chinese).toContain('每当你在回合中拒绝一次无条件')
    expect(chinese).toContain('即使被占用')
    expect(chinese).toContain('class="card-rules"')
    expect(chinese).toContain('规则补充')
    expect(chinese).toContain('此次额外放人不能选择')
    expect(chinese).not.toContain('The additional person cannot be placed on')
  })

  it.each([
    [
      'C022_BasketChair',
      'minor' as const,
      'When you play this card',
      'Only an adult person can be moved to this card',
      '只能将成人工人移到本牌',
    ],
    [
      'D151_SpinDoctor',
      'occupation' as const,
      'Immediately after each time you use',
      'No card, including this one, can allow you to use',
      '任何卡牌都不能让你使用已被占用的',
    ],
  ])('renders audited supplemental rules for %s', (
    cardId,
    cardType,
    printedText,
    englishRule,
    chineseRule,
  ) => {
    const english = renderToStaticMarkup(
      <PlayerCard locale="en" cardId={cardId} cardType={cardType} />,
    )
    const chinese = renderToStaticMarkup(
      <PlayerCard locale="zh" cardId={cardId} cardType={cardType} />,
    )

    expect(english).toContain(printedText)
    expect(english).toContain('class="card-rules"')
    expect(english).toContain(englishRule)
    expect(chinese).toContain('class="card-rules"')
    expect(chinese).toContain(chineseRule)
    expect(chinese).not.toContain(englishRule)
  })

  it('renders Moor minor resource descriptions as inline icons', () => {
    const html = renderToStaticMarkup(
      <PlayerCard locale="en" cardId="M080_AdvancePayment" cardType="minor" />,
    )

    for (const className of [
      'res-icon-fuel',
      'res-icon-food',
      'res-icon-wood',
      'res-icon-clay',
      'res-icon-reed',
      'res-icon-stone',
      'res-icon-sheep',
      'res-icon-grain',
    ]) {
      expect(html).toContain(className)
    }
    expect(html).not.toContain('1 fuel, 1 food, 1 wood')
  })

  it('renders Moor minor terrain and scoring descriptions as inline icons', () => {
    const html = renderToStaticMarkup(
      <PlayerCard locale="en" cardId="M021_PeatCuttingExpedition" cardType="minor" />,
    )

    expect(html).toContain('res-icon-moor')
    expect(html).toContain('res-icon-score')
    expect(html).toContain('res-icon-horse')
    expect(html).not.toContain('visible moors')
    expect(html).not.toContain('bonus point')
    expect(html).not.toContain('horses')
  })

  it('uses a public player56 portrait when the card numbering has one', () => {
    const html = renderToStaticMarkup(
      <PlayerCard locale="en" cardId="A169_OffSiter" cardType="occupation" />,
    )

    expect(html).toContain(publicAssetUrl('/assets/player56/A169.png'))
    expect(html).not.toContain('/assets/revised/deckA/A169.png')
    expect(html).toContain('data-n="5+"')
  })

  it('uses the public player56 portrait range beyond A169 on first render', () => {
    const html = renderToStaticMarkup(
      <PlayerCard locale="en" cardId="B180_GameTeaser" cardType="occupation" />,
    )

    expect(html).toContain(publicAssetUrl('/assets/player56/B180.png'))
    expect(html).not.toContain('/assets/revised/deckB/B180.png')
  })

  it('renders globally registered custom cards even though they are absent from the static manifest', () => {
    registerCustomCardMetadata({
      cardType: 'minor',
      cardJson: {
        id: 'CUSTOM_DebugMallet',
        name: 'Debug Mallet',
        deck: 'CUSTOM',
        number: 0,
        desc: ['Gain 1 wood.'],
        cost: { wood: 1 },
        vp: 0,
        implemented: true,
      },
    })

    const html = renderToStaticMarkup(
      <PlayerCard locale="en" cardId="CUSTOM_DebugMallet" cardType="minor" />,
    )

    expect(html).toContain('Debug Mallet')
    expect(html).toContain('Gain 1 wood.')
    expect(html).toContain('data-id="CUSTOM_DebugMallet"')
  })

  it('renders published community art and card-local Chinese metadata', () => {
    const html = renderToStaticMarkup(
      <PlayerCard
        locale="zh"
        cardId="CUSTOM_LocalisedCard"
        cardType="occupation"
        cardMeta={{
          id: 'CUSTOM_LocalisedCard',
          name: 'Localised Card',
          deck: 'community',
          number: 0,
          desc: ['English description.'],
          artUrl: '/card-art/community/CUSTOM_LocalisedCard.webp',
          locales: {
            zh: {
              name: '本地化卡',
              desc: ['中文描述。'],
              prerequisite: '中文前置条件',
            },
          },
        }}
      />,
    )
    const base = import.meta.env.BASE_URL.endsWith('/')
      ? import.meta.env.BASE_URL
      : `${import.meta.env.BASE_URL}/`

    expect(html).toContain('本地化卡')
    expect(html).toContain('中文描述。')
    expect(html).toContain('中文前置条件')
    expect(html).not.toContain('English description.')
    expect(html).toContain(`${base}card-art/community/CUSTOM_LocalisedCard.webp`)
    expect(html).not.toContain('/assets/revised/')
    // `cover` would crop a non-square image against the ~0.95:1 icon box.
    expect(html).toContain('background-size:contain')
  })

  it('fits workshop draft art inside the icon box instead of cropping it', () => {
    const html = renderToStaticMarkup(
      <PlayerCard
        locale="en"
        cardId="CUSTOM_DraftArt"
        cardType="occupation"
        artUrl="/card-art/e1a2b3.png"
        cardMeta={{
          id: 'CUSTOM_DraftArt',
          name: 'Draft Art',
          deck: 'community',
          number: 0,
          desc: [],
        }}
      />,
    )

    expect(html).toContain('/card-art/e1a2b3.png')
    expect(html).toContain('background-size:contain')
    expect(html).not.toContain('background-size:cover')
  })

  it('ignores remote art from card metadata', () => {
    const html = renderToStaticMarkup(
      <PlayerCard
        locale="en"
        cardId="CUSTOM_RemoteArt"
        cardType="occupation"
        cardMeta={{
          id: 'CUSTOM_RemoteArt',
          name: 'Remote Art',
          deck: 'community',
          number: 0,
          desc: [],
          artUrl: 'https://attacker.example/tracker.webp',
        }}
      />,
    )

    expect(html).not.toContain('attacker.example')
    expect(html).toContain('/assets/revised/')
  })

  it('renders C54 stable printed cost from card metadata', async () => {
    const manifest = await loadCardsManifest()
    const originalCost = manifest.C054_MarketBooth?.cost
    manifest.C054_MarketBooth.cost = { stable: 1 }

    try {
      const html = renderToStaticMarkup(
        <PlayerCard locale="en" cardId="C054_MarketBooth" cardType="minor" />,
      )

      expect(html).toContain('card-cost')
      expect(html).toContain('res-icon-barn')
    } finally {
      manifest.C054_MarketBooth.cost = originalCost
    }
  })

  it('renders alternative costs with a visible slash separator', () => {
    const html = renderToStaticMarkup(
      <PlayerCard locale="en" cardId="D080_BrickHammer" cardType="minor" />,
    )

    expect(html).toContain('card-cost-alt')
    expect(html).toContain('card-cost-separator')
    expect(html).toContain('card-cost-separator">/</span>')
  })

  it('renders Moor major cards with public Moor art and M numbering', () => {
    const html = renderToStaticMarkup(
      <PlayerCard locale="en" cardId="Major_Moor_HorseSlaughterhouse1" cardType="major" />,
    )

    expect(html).toContain('data-numbering="M001"')
    expect(html).toContain('data-moor-major="true"')
    expect(html).toContain('data-deck="M"')
    expect(html).toContain(publicAssetUrl('/assets/moor/major/M001.png'))
  })

  it('renders Forester Lodge with public Moor art and terrain icon text', () => {
    const html = renderToStaticMarkup(
      <PlayerCard locale="en" cardId="Major_Moor_ForestersLodge" cardType="major" />,
    )

    expect(html).toContain('data-numbering="M012"')
    expect(html).toContain(publicAssetUrl('/assets/moor/major/M012.png'))
    expect(html).toContain('res-icon-forest')
    expect(html).not.toContain('each forest')
  })

  it('renders Moor minor cards with public Moor art and M numbering', () => {
    const html = renderToStaticMarkup(
      <PlayerCard locale="en" cardId="M068_Church" cardType="minor" />,
    )

    expect(html).toContain('data-numbering="M068"')
    expect(html).toContain('data-deck="M"')
    expect(html).toContain(publicAssetUrl('/assets/moor/minor/M068.png'))
  })

  it('routes all public card art through the pinned source', () => {
    const moorMajor = renderToStaticMarkup(
      <PlayerCard locale="en" cardId="Major_Moor_HorseSlaughterhouse1" cardType="major" />,
    )
    const moorMinor = renderToStaticMarkup(
      <PlayerCard locale="en" cardId="M068_Church" cardType="minor" />,
    )
    const player56 = renderToStaticMarkup(
      <PlayerCard locale="en" cardId="A169_OffSiter" cardType="occupation" />,
    )

    expect(moorMajor).toContain(publicAssetUrl('/assets/moor/major/M001.png'))
    expect(moorMinor).toContain(publicAssetUrl('/assets/moor/minor/M068.png'))
    expect(player56).toContain(publicAssetUrl('/assets/player56/A169.png'))
  })

  it.each([
    ['B033_Mantlepiece', -3],
    ['B040_BreweryPond', -1],
    ['C083_EarlyCattle', -3],
    ['D040_Cesspit', -1],
    ['M080_AdvancePayment', -4],
    ['M085_OvenInstallation', -1],
  ])('renders printed negative VP for %s', (cardId, vp) => {
    const html = renderToStaticMarkup(
      <PlayerCard locale="en" cardId={cardId} cardType="minor" />,
    )

    expect(html).toContain(`class="card-score">${vp}</div>`)
  })

  it('renders Moor major printed marker icons from reference category sprite metadata', () => {
    const html = renderToStaticMarkup(
      <PlayerCard locale="en" cardId="Major_Moor_MuseumOfTheMoors" cardType="major" />,
    )

    expect(html).toContain('class="card-category"')
    expect(html).toContain('data-category="BUILDING_RESOURCE_PROVIDER"')
    expect(html).not.toContain('card-moor-major-marker')
    expect(html).not.toContain('/assets/moor/icons/M013-marker.png')
  })

  it('renders Museum of the Moors discount list like the scanned card', () => {
    const html = renderToStaticMarkup(
      <PlayerCard locale="en" cardId="Major_Moor_MuseumOfTheMoors" cardType="major" />,
    )

    expect(html).toContain('These major improvements cost you 1 building resource less:')
    expect(html).toContain('Well')
    expect(html).toContain('Clay Oven')
    expect(html).toContain('Joinery')
    expect(html).toContain('Stone Oven')
    expect(html).toContain('Pottery')
    expect(html).toContain('Forester')
    expect(html).toContain('Basketmaker')
    expect(html).toContain('res-icon-stone')
    expect(html).toContain('res-icon-clay')
    expect(html).toContain('res-icon-wood')
    expect(html).toContain('res-icon-reed')
  })

  it('renders Cookhouse return cost as both Fireplace and Cooking Hearth families', () => {
    const html = renderToStaticMarkup(
      <PlayerCard locale="en" cardId="Major_Moor_Cookhouse1" cardType="major" />,
    )

    expect(html).toContain('Return Fireplace/Cooking Hearth or')
  })

  it('renders current Moor oven names from i18n', () => {
    const heatingOven = renderToStaticMarkup(
      <PlayerCard locale="en" cardId="Major_Moor_HeatingOven" cardType="major" />,
    )
    const tiledOven = renderToStaticMarkup(
      <PlayerCard locale="en" cardId="Major_Moor_TiledOven" cardType="major" />,
    )

    expect(heatingOven).toContain('Heating Oven')
    expect(heatingOven).not.toContain('Furnace')
    expect(tiledOven).toContain('Tiled Oven')
    expect(tiledOven).not.toContain('Heating Stove')
  })
})

describe('PlayerCard supplemental rules', () => {
  it('uses the global translation for major-improvement rules', () => {
    const localeEntry = zh.improvements.Major_Fireplace1 as typeof zh.improvements.Major_Fireplace1 & { rules?: string }
    localeEntry.rules = '主改良规则翻译'
    try {
      const html = renderToStaticMarkup(
        <PlayerCard locale="zh" cardId="Major_Fireplace1" cardType="major" />,
      )
      expect(html).toContain('主改良规则翻译')
    } finally {
      delete localeEntry.rules
    }
  })
})
