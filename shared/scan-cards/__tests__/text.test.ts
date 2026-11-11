import { describe, expect, it } from 'vitest'
import { SCAN_CARDS, SCAN_TEXT_ICONS, getScanCard, parseScanText, scanPlainText, scanPrintedText } from '../index'

describe('scan text markup', () => {
  it('splits paragraphs and keeps italics, small caps, breaks and icons', () => {
    expect(parseScanText('*Shrooms!*\n\n{left}{sc}Once there are\nno more{/sc}\n\n1 [icon:dog] / [icon:sheep]')).toEqual([
      { kind: 'paragraph', small: false, left: false, pile: false, inline: [{ kind: 'text', text: 'Shrooms!', italic: true, smallCaps: false }] },
      {
        kind: 'paragraph', small: false, left: true, pile: false, inline: [
          { kind: 'text', text: 'Once there are', italic: false, smallCaps: true },
          { kind: 'break' },
          { kind: 'text', text: 'no more', italic: false, smallCaps: true },
        ],
      },
      {
        kind: 'paragraph', small: false, left: false, pile: false, inline: [
          { kind: 'text', text: '1 ', italic: false, smallCaps: false },
          { kind: 'icon', name: 'dog' },
          { kind: 'text', text: ' / ', italic: false, smallCaps: false },
          { kind: 'icon', name: 'sheep' },
        ],
      },
    ])
  })

  it('reads diagrams as art blocks and rows', () => {
    expect(parseScanText('{art:/a.png|120}\n\n{row:/b.png|40}Draw 2 minor improvements.')).toEqual([
      { kind: 'art', src: '/a.png', width: 120 },
      { kind: 'row', src: '/b.png', width: 40, top: false, mid: false, inline: [{ kind: 'text', text: 'Draw 2 minor improvements.', italic: false, smallCaps: false }] },
    ])
  })

  it('gives the encyclopedia plain words for the printed text', () => {
    const troll = getScanCard('WB01_Troll')
    const witch = getScanCard('FE23_TheWitch')
    const lake = getScanCard('FE06_TheLadyOfTheLakePt2')
    expect(troll && scanPlainText(scanPrintedText(troll))).toBe(
      'Each time the Troll obtains wood with an action, you get 1 additional wood. In each feeding phase, you must feed the Troll 3 food, even as an offspring.\n'
      + 'Once per harvest:\n'
      + '1 dog / sheep / horse → 2 food')
    expect(witch && scanPlainText(witch.text)).toContain('the top 3 cards of the tree deck')
    expect(lake && scanPlainText(scanPrintedText(lake)).split('\n').at(-1)).toBe('SHUFFLE THIS CARD BACK INTO THE DECK.')
    const inquisition = getScanCard('FE26_PeruvianInquisition')
    expect(inquisition && scanPlainText(scanPrintedText(inquisition)).split('\n').slice(-5)).toEqual([
      '0 llama → -1 point', '1-3 llama → 1 point', '4-5 llama → 2 point', '6-7 llama → 3 point', '8+ llama → 4 point',
    ])
  })

  it('only prints icons the renderer draws', () => {
    const used = SCAN_CARDS.flatMap((card) => [...scanPrintedText(card).matchAll(/\[icon:([a-z0-9-]+)\]/g)].map((match) => `${card.id}: ${match[1]}`))
    expect(used.filter((entry) => !(entry.split(': ')[1] in SCAN_TEXT_ICONS))).toEqual([])
  })

  it('draws exchange rows as icons, not pasted diagrams', () => {
    const row = (id: string) => scanPlainText(getScanCard(id)?.text ?? '')
    expect(row('L084_TheHulk').split('\n').at(-1)).toBe('wood — person x→ food')
    expect(row('X02_HomemadeSpaceRocket').split('\n').slice(-3)).toEqual([
      'wood wood reed',
      'clay clay stone',
      '1x 4 point',
    ])
    expect(row('FE16_TheFireBogFlameSpurtsOven').split('\n').slice(-2)).toEqual([
      'sheep / boar / cattle / horse / llama / fairy',
      '→ food food',
    ])
    expect(row('WB02_Silicoid').split('\n').at(-1)).toBe('3 food 2x 1 point / 1 stone')
    expect(row('L085_Groom').split('\n').at(-1)).toBe('horse')
    expect(row('X01_ExtraterrestrialExcrement').split('\n').slice(0, 6)).toEqual([
      '+1 grain',
      '↓',
      'field grain',
      '+1 vegetable',
      '↓',
      'field vegetable',
    ])
    expect(getScanCard('X01_ExtraterrestrialExcrement')?.text).not.toContain('X01-diagram')
    expect(getScanCard('L085_Groom')?.text).not.toContain('L085-horse')
    expect(SCAN_CARDS.some((card) => scanPrintedText(card).includes('exchange.png') || scanPrintedText(card).includes('X02-diagram') || scanPrintedText(card).includes('wb02-harvest'))).toBe(false)
  })

  it('draws the Broch scoring chart as icons, not a scan crop', () => {
    const broch = getScanCard('L062_Broch')
    expect(broch?.text).toBe('Scoring:\n\n{pile}{sc}2{/sc} [icon:stone] {sc}1{/sc} [icon:score]\n{sc}4{/sc} [icon:stone] [icon:arrow-1x] {sc}2{/sc} [icon:score]\n{sc}6{/sc} [icon:stone] {sc}3{/sc} [icon:score]')
    expect(scanPlainText(broch?.text ?? '')).toBe('Scoring:\n2 stone 1 point\n4 stone 1x 2 point\n6 stone 3 point')
    expect(broch?.text).not.toContain('L062-scoring')
  })
})
