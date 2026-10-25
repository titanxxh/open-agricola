import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import ts from 'typescript'
import { buildCardsManifest, type CardMeta } from './build-cards-manifest'
import { flattenDictionary } from './i18n/flatten-dictionary'
import { en } from '../shared/i18n/en'
import { zh } from '../shared/i18n/zh'

type Change = { path: string; before: string; after: string; source: string[] }
type Issue = { cardId: string; field: string; reason: string; source?: string[]; proposed?: string }
type PlanInput = {
  cards: CardMeta[]
  current: Map<string, string>
  english: Map<string, string>
  translations: Map<string, string>
}

const iconWords = new Map([
  ['FIELD', 'field'], ['STABLE', 'stable'], ['FENCE', 'fence'], ['SCORE', 'point'],
])
const normalizeEnglish = (text: string): string => text
  .normalize('NFKD').replace(/\p{M}/gu, '')
  .replace(/[’‘]/g, "'")
  .replaceAll("'", '')
  .replace(/[“”]/g, '"')
  .replace(/<([A-Z_]+)>/g, (_token, name: string) => iconWords.get(name) ?? name.toLowerCase())
  .replace(/\b(fields|stables|fences|points|vegetables|forests|moors)\b/gi, word => word.slice(0, -1))
  .replace(/[\s_]+/g, ' ')
  .trim().toLowerCase()
const signature = (text: string, pattern: RegExp): string =>
  [...text.matchAll(pattern)].map(match => match[0]).sort().join('|')
const hasChinese = (text: string): boolean => /[\u3400-\u9fff]/.test(text)
const sectionFor = (card: CardMeta): string => card.type === 'major' ? 'improvements'
  : card.type === 'occupation' || card.playerActionCardType === 'occupation' ? 'occupations' : 'minorImprovements'

export function translationProblem(english: string, chinese: string): string | undefined {
  if (!hasChinese(chinese)) return 'not-translated'
  if (signature(english, /<[A-Z_]+>/g) !== signature(chinese, /<[A-Z_]+>/g)) return 'icon-mismatch'
  const numbers = (text: string) => [...text.matchAll(/\d+(?:\.\d+)?/g)].map(match => match[0]).filter(number => number !== '1').sort().join('|')
  if (numbers(english) !== numbers(chinese)) return 'number-mismatch'
  const resourceAmounts = (text: string) => signature(text.replace(/\b(?:a|an|one)\s+(?=<)/gi, '1 ').replace(/\s+/g, ''), /\d+<(?:WOOD|CLAY|REED|STONE|FOOD|GRAIN|VEGETABLE|SHEEP|PIG|CATTLE|HORSE|FUEL)>/g)
  if (resourceAmounts(english) !== resourceAmounts(chinese)) return 'resource-amount-mismatch'
  if (signature(english, /\$?\{[^{}]+\}/g) !== signature(chinese, /\$?\{[^{}]+\}/g)) return 'placeholder-mismatch'
  if (/<(?![A-Z_]+>)[^>]+>/.test(chinese)) return 'unsupported-markup'
  return undefined
}

export function planBgaCardTranslations({ cards, current, english, translations }: PlanInput) {
  const changes = new Map<string, Change>()
  const issues: Issue[] = []
  const sourceFields = new Map<string, string>()
  for (const card of cards) {
    const prefix = `${sectionFor(card)}.${card.id}`
    if (card.desc) sourceFields.set(`${prefix}.description`, card.desc.join(' '))
    if (card.rules) sourceFields.set(`${prefix}.rules`, card.rules.join(' '))
    if (typeof card.prerequisite === 'string') sourceFields.set(`${prefix}.prerequisite`, card.prerequisite)
  }
  const sourceIndex = new Map<string, string[]>()
  for (const source of translations.keys()) {
    const key = normalizeEnglish(source)
    sourceIndex.set(key, [...(sourceIndex.get(key) ?? []), source])
  }
  const findSource = (text: string): string | undefined => {
    if (translations.has(text)) return text
    const matches = sourceIndex.get(normalizeEnglish(text)) ?? []
    return matches.length === 1 ? matches[0] : undefined
  }
  const propose = (path: string, after: string, source: string[]) => {
    const before = current.get(path)
    if (before !== undefined && before !== after) changes.set(path, { path, before, after, source })
  }
  const supported = cards.filter(card => ['A', 'B', 'C', 'D', 'E', 'major'].includes(card.deck))
  for (const card of supported) {
    const source = findSource(card.name)
    if (!source) { issues.push({ cardId: card.id, field: 'name', reason: 'missing-source' }); continue }
    const name = translations.get(source)!
    if (!hasChinese(name)) { issues.push({ cardId: card.id, field: 'name', reason: 'not-translated', source: [source] }); continue }
    propose(`${sectionFor(card)}.${card.id}.name`, name, [source])
  }

  // A shared Chinese title must still identify the same English card.
  for (;;) {
    const owners = new Map<string, Array<{ card: CardMeta; path: string }>>()
    for (const card of cards) {
      const path = `${sectionFor(card)}.${card.id}.name`
      const name = changes.get(path)?.after ?? current.get(path)
      if (name) owners.set(name, [...(owners.get(name) ?? []), { card, path }])
    }
    let reverted = false
    for (const [name, group] of owners) {
      if (new Set(group.map(({ card }) => card.name.toLowerCase())).size < 2) continue
      for (const { card, path } of group) {
        if (!changes.has(path)) continue
        issues.push({ cardId: card.id, field: 'name', reason: 'name-collision', proposed: name })
        changes.delete(path)
        reverted = true
      }
    }
    if (!reverted) break
  }

  const referenceCandidates = new Map<string, Set<string>>()
  const existingReferences = new Map<string, string>()
  const englishReferences = new Map<string, string>()
  const addReference = (from: string | undefined, to: string | undefined) => {
    if (!from || !to) return
    referenceCandidates.set(from, new Set([...(referenceCandidates.get(from) ?? []), to]))
  }
  for (const [path, source] of english) {
    if (path.startsWith('actions.') && path.endsWith('.name')) {
      const target = current.get(path)
      if (target && !englishReferences.has(source)) englishReferences.set(source, target)
      addReference(translations.get(source), target)
    }
  }
  for (const card of cards) {
    const path = `${sectionFor(card)}.${card.id}.name`
    const name = changes.get(path)?.after ?? current.get(path)
    if (name && !englishReferences.has(card.name)) englishReferences.set(card.name, name)
    addReference(translations.get(findSource(card.name) ?? ''), name)
    const before = current.get(path)
    if (before && name) existingReferences.set(before, name)
  }
  const references = new Map([...referenceCandidates].flatMap(([label, names]) => names.size === 1 ? [[label, [...names][0]!]] : []))
  const aliases = new Map([
    ['打出主要发展卡', '主要改良'], ['主要发展', '主要改良'],
    ['打出次要发展卡', '小改良'], ['打出主要或次要发展卡', current.get('actions.improvement.name')!],
    ['发展卡', current.get('actions.improvement.name')!],
    ['建造房间', current.get('actions.construct.name')!], ['建造木屋', '建造木房'],
    ['建造栅栏', current.get('actions.fencing.name')!], ['建造畜棚', current.get('actions.stables.name')!],
    ['增加家庭成员', current.get('actions.family-growth.name')!],
    ['生儿育女/求子心切', current.get('actions.family-growth.name')!],
    ['增加家庭成员（需要空房间）', '家庭增长（需要空房）'], ['增加家庭成员（无需空房间）', '无须房间的家庭增长'],
    ['烘焙面包', current.get('actions.bake-bread.name')!],
    ['小麦种子/蔬菜种子', `${current.get('actions.grain-seeds.name')}__/__${current.get('actions.vegetable-seeds.name')}`],
    ['打出次要发展卡/打出主要发展卡', '小改良__/__主要改良'],
  ])
  const alignReferences = (text: string, source?: string): string => {
    const local = new Map(references)
    for (const match of source?.matchAll(/__([^_]+)__/g) ?? []) {
      const target = englishReferences.get(match[1]!)
      const label = translations.get(match[1]!)
      if (label && target) local.set(label, target)
    }
    return text.replace(/__([^_]+)__/g, (original, label: string) => {
      const target = aliases.get(label) ?? local.get(label)
      return target ? `__${target}__` : original
    })
  }

  for (const card of supported) {
    const lines = card.desc ?? []
    if (!lines.length) continue
    const matched = lines.map(findSource)
    if (matched.some(source => !source)) { issues.push({ cardId: card.id, field: 'description', reason: 'missing-source' }); continue }
    const sources = matched.filter((source): source is string => source !== undefined)
    const translated = alignReferences(sources.map(source => translations.get(source)!).join(' '), lines.join(' '))
      .replaceAll('主要发展卡', '主要改良').replaceAll('次要发展卡', '小改良')
    const problem = translationProblem(lines.join(' '), translated)
      ?? ([...translated.matchAll(/__([^_]+)__/g)].some(match => /[a-z]/i.test(match[1]!)) ? 'untranslated-reference' : undefined)
    if (problem) { issues.push({ cardId: card.id, field: 'description', reason: problem, source: sources, proposed: translated }); continue }
    propose(`${sectionFor(card)}.${card.id}.description`, translated, sources)
  }

  for (const [path, before] of current) {
    const value = changes.get(path)?.after ?? before
    const context = (english.get(path) ?? sourceFields.get(path))?.replace(/\bClay\s*\/\s*Stone Oven\b/g, 'Clay Oven / Stone Oven')
    const plainNames = new Map(cards.filter(card => card.type === 'major' && context?.includes(card.name)).flatMap(card => {
      const oldName = current.get(`${sectionFor(card)}.${card.id}.name`)
      const newName = oldName ? existingReferences.get(oldName) : undefined
      const names: Array<[string, string]> = oldName && newName && oldName !== newName ? [[oldName, newName]] : []
      if (card.name === 'Cooking Hearth' && newName) names.push(['灶台', newName])
      if (card.name === 'Stone Oven' && newName) names.push(['石头烤炉', newName])
      return names
    }))
    const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const plainPattern = [...plainNames.keys()].sort((a, b) => b.length - a.length).map(escape).join('|')
    const pattern = new RegExp(`__([^_]+)__${plainPattern ? `|${plainPattern}` : ''}`, 'g')
    const aligned = changes.has(path) ? value : value.replace(pattern, (original, label: string | undefined) =>
      label ? existingReferences.has(label) ? `__${existingReferences.get(label)}__` : original : plainNames.get(original) ?? original)
    const card = cards.find(card => path.startsWith(`cards.${card.id}.`) || path.includes(`.${card.id}.`))
    if (card && path === `cards.${card.id}.name`) {
      const namePath = `${sectionFor(card)}.${card.id}.name`
      propose(path, changes.get(namePath)?.after ?? current.get(namePath) ?? value, [card.name])
    } else if (aligned !== value) {
      const change = changes.get(path)
      propose(path, aligned, change?.source ?? ['Chinese card/action reference'])
    }
  }
  return { changes: [...changes.values()].sort((a, b) => a.path.localeCompare(b.path)), issues }
}

function translationNodes(source: string) {
  const sf = ts.createSourceFile('zh.ts', source, ts.ScriptTarget.Latest, true)
  const nodes = new Map<string, ts.StringLiteralLike>()
  const visit = (object: ts.ObjectLiteralExpression, prefix: string[]) => {
    for (const property of object.properties) {
      if (!ts.isPropertyAssignment(property) || (!ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name))) continue
      const path = [...prefix, property.name.text]
      if (ts.isObjectLiteralExpression(property.initializer)) visit(property.initializer, path)
      else if (ts.isStringLiteralLike(property.initializer)) nodes.set(path.join('.'), property.initializer)
    }
  }
  for (const statement of sf.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === 'zh' && declaration.initializer && ts.isObjectLiteralExpression(declaration.initializer)) visit(declaration.initializer, [])
    }
  }
  return { sf, nodes }
}

export function readTranslationStrings(source: string): Map<string, string> {
  return new Map([...translationNodes(source).nodes].map(([path, node]) => [path, node.text]))
}

export function replaceTranslationStrings(source: string, replacements: Map<string, string>): string {
  const { sf, nodes } = translationNodes(source)
  const edits = [...replacements].map(([path, value]) => {
    const node = nodes.get(path)
    if (!node) throw new Error(`Cannot replace absent Chinese string ${path}`)
    const escaped = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r/g, '\\r').replace(/\n/g, '\\n')
    return { start: node.getStart(sf), end: node.end, text: `'${escaped}'` }
  })
  return edits.sort((a, b) => b.start - a.start).reduce((text, edit) => text.slice(0, edit.start) + edit.text + text.slice(edit.end), source)
}

const main = () => {
  const input = process.argv[2]
  if (!input) throw new Error('Usage: pnpm exec tsx scripts/import-bga-card-translations.ts <BGA zh-cn JSON> [--apply]')
  const rawSource = readFileSync(input, 'utf8')
  const raw: unknown = JSON.parse(rawSource)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Expected a translation dictionary')
  const translations = new Map<string, string>()
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'string') throw new Error(`Non-string translation: ${key}`)
    translations.set(key, value)
  }
  const cards = Object.values(buildCardsManifest('shared/cards')).map(entry => entry.meta)
  const plan = planBgaCardTranslations({ cards, current: flattenDictionary(zh), english: flattenDictionary(en), translations })
  const report = resolve('output/bga-card-translations.json')
  mkdirSync(dirname(report), { recursive: true })
  writeFileSync(report, JSON.stringify({ source: resolve(input), sourceSha256: createHash('sha256').update(rawSource).digest('hex'), ...plan }, null, 2) + '\n')
  const counts = new Map<string, number>()
  for (const issue of plan.issues) counts.set(`${issue.field}:${issue.reason}`, (counts.get(`${issue.field}:${issue.reason}`) ?? 0) + 1)
  console.log(JSON.stringify({ changes: plan.changes.length, changedNames: plan.changes.filter(change => change.path.endsWith('.name')).length,
    changedDescriptions: plan.changes.filter(change => change.path.endsWith('.description')).length, issues: Object.fromEntries(counts), report }, null, 2))
  if (process.argv.includes('--apply')) {
    const path = resolve('shared/i18n/zh.ts')
    writeFileSync(path, replaceTranslationStrings(readFileSync(path, 'utf8'), new Map(plan.changes.map(change => [change.path, change.after]))))
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
