#!/usr/bin/env tsx
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCardFile, type CardMeta } from './build-cards-manifest'

const CATALOG_DECKS = ['A', 'B', 'C', 'D', 'E', 'M', 'community'] as const
const RUNTIME_DECKS = [...CATALOG_DECKS, '__stubs__'] as const
const MAJOR_DECK = 'major'

export type RegisterAllBuildResult = {
  registerAll: string
  catalogGenerated: string
  majorGenerated: string
  majorRuntimeGenerated: string
  implCount: number
  catalogDefinitionCount: number
  majorDefinitionCount: number
}

type BuildOptions = {
  repoRoot?: string
}

type SourceExport = {
  name: string
  moduleRel: string
  filePath: string
  hasImpl: boolean
  number?: number
}

const cardSourceExportRe =
  /^export const (\w+)\s*=\s*define(?:Minor|Occupation|PlayerAction|Major)Card\s*\(/gm

const listCardFiles = (dir: string): string[] => {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) =>
      f.endsWith('.ts')
      && !f.endsWith('.test.ts')
      && f !== 'index.ts'
      && f !== 'types.ts'
      && f !== 'generated.ts'
      && f !== 'runtime.generated.ts'
      && f !== 'catalog.generated.ts'
      && f !== 'register-all.ts',
    )
    .sort()
}

const extractCardSourceExports = (source: string, moduleRel: string, filePath: string): SourceExport[] => {
  const matches = [...source.matchAll(cardSourceExportRe)]
  return matches.map((match, index) => {
    const start = match.index ?? 0
    const next = matches[index + 1]?.index ?? source.length
    return {
      name: match[1]!,
      moduleRel,
      filePath,
      hasImpl: /\bimpl\s*:/.test(source.slice(start, next)),
      number: Number(source.slice(start, next).match(/\bnumber\s*:\s*(\d+)/)?.[1] ?? Number.NaN),
    }
  })
}

const collectSources = (
  cardsRoot: string,
  decks: readonly string[],
): SourceExport[] => {
  const sources: SourceExport[] = []
  for (const deck of decks) {
    const deckDir = path.join(cardsRoot, deck)
    for (const file of listCardFiles(deckDir)) {
      const filePath = path.join(deckDir, file)
      const source = fs.readFileSync(filePath, 'utf8')
      const moduleRel = `./${deck}/${path.basename(file, '.ts')}`
      sources.push(...extractCardSourceExports(source, moduleRel, filePath))
    }
  }
  return sources.sort((a, b) => a.name.localeCompare(b.name))
}

const collectMajorSources = (cardsRoot: string): SourceExport[] => {
  const majorDir = path.join(cardsRoot, MAJOR_DECK)
  const sources: SourceExport[] = []
  for (const file of listCardFiles(majorDir)) {
    const filePath = path.join(majorDir, file)
    const source = fs.readFileSync(filePath, 'utf8')
    const moduleRel = `./major/${path.basename(file, '.ts')}`
    sources.push(...extractCardSourceExports(source, moduleRel, filePath))
  }
  return sources.sort((a, b) => {
    const aNum = Number.isFinite(a.number) ? a.number! : 999
    const bNum = Number.isFinite(b.number) ? b.number! : 999
    if (aNum !== bNum) return aNum - bNum
    return a.name.localeCompare(b.name)
  })
}

const majorImportBlock = (sources: readonly SourceExport[]) =>
  sources
    .map((source) => `import { ${source.name} } from '${source.moduleRel.replace('./major/', './')}'`)
    .join('\n')

const sourceArray = (sources: readonly SourceExport[]) =>
  sources.map((source) => `  ${source.name},`).join('\n')

const cardSourceKindFromType = (type: CardMeta['type']) => type

const cardDefinitionLiteral = (meta: CardMeta) => {
  const { type, ...definition } = meta
  return JSON.stringify({ ...definition, kind: cardSourceKindFromType(type) }, null, 2)
}

const parseSourceMetas = (sources: readonly SourceExport[]) => {
  const metas = new Map<string, CardMeta>()
  const parsedFiles = new Map<string, CardMeta[]>()
  for (const source of sources) {
    if (!parsedFiles.has(source.filePath)) {
      parsedFiles.set(
        source.filePath,
        parseCardFile(source.filePath, {
          includeLegacyConstructors: false,
          includeMajorLiterals: false,
          includeCardSources: true,
        }).metas,
      )
    }
    const meta = parsedFiles.get(source.filePath)?.find((candidate) => candidate.id === source.name)
    if (!meta) {
      throw new Error(`${source.filePath}: missing static metadata for ${source.name}`)
    }
    metas.set(source.name, meta)
  }
  return metas
}

const definitionArray = (
  sources: readonly SourceExport[],
  metas: ReadonlyMap<string, CardMeta>,
) =>
  sources.map((source) => {
    const meta = metas.get(source.name)
    if (!meta) {
      throw new Error(`${source.filePath}: missing static metadata for ${source.name}`)
    }
    return cardDefinitionLiteral(meta).split('\n').map((line) => `  ${line}`).join('\n') + ','
  }).join('\n')

export function buildRegisterAll(options: BuildOptions = {}): RegisterAllBuildResult {
  const repoRoot = options.repoRoot ?? process.cwd()
  const cardsRoot = path.resolve(repoRoot, 'shared', 'cards')
  const catalogSources = collectSources(cardsRoot, CATALOG_DECKS)
  const runtimeSources = collectSources(cardsRoot, RUNTIME_DECKS)
  const majorSources = collectMajorSources(cardsRoot)
  const implSources = [...runtimeSources, ...majorSources].filter((source) => source.hasImpl)
  const catalogMetas = parseSourceMetas(catalogSources)
  const majorMetas = parseSourceMetas(majorSources)

  const registerImports = implSources.map((source) =>
    `import { ${source.name} } from '${source.moduleRel}'`)
  const registerEntries = implSources.map((source) => `  '${source.name}': ${source.name}.impl,`)

  const registerAll = `// GENERATED by scripts/generate-register-all.ts. Do not edit by hand.
import type { CardImpl } from './registry'
import './catalog'

${registerImports.join('\n')}

export const ALL_CARD_IMPLS: Readonly<Record<string, CardImpl>> = {
${registerEntries.join('\n')}
}

export type AllCardImpls = typeof ALL_CARD_IMPLS
`

  const catalogGenerated = `// GENERATED by scripts/generate-register-all.ts. Do not edit by hand.
import type { CardDefinition } from '../contract/cards'

type GeneratedCatalogCardDefinition = CardDefinition & {
  kind: 'minor' | 'occupation' | 'playerAction'
}

export const catalogCardDefinitions: readonly GeneratedCatalogCardDefinition[] = [
${definitionArray(catalogSources, catalogMetas)}
]

const isMinorLike = (card: GeneratedCatalogCardDefinition) =>
  card.kind === 'minor' ||
  (card.kind === 'playerAction' && card.playerActionCardType === 'minor')

const isOccupation = (card: GeneratedCatalogCardDefinition) =>
  card.kind === 'occupation' ||
  (card.kind === 'playerAction' && card.playerActionCardType === 'occupation')

const isImplemented = (card: GeneratedCatalogCardDefinition) => card.implemented !== false

export const minorImprovementCardsList = catalogCardDefinitions
  .filter(isMinorLike)

export const occupationCardsList = catalogCardDefinitions
  .filter(isOccupation)

export const implementedMinorImprovementCardsList =
  minorImprovementCardsList.filter(isImplemented)

export const implementedOccupationCardsList =
  occupationCardsList.filter(isImplemented)

export const minorImprovementIdsList =
  implementedMinorImprovementCardsList.map((card) => card.id)

export const occupationIdsList =
  implementedOccupationCardsList.map((card) => card.id)
`

  const majorGenerated = `// GENERATED by scripts/generate-register-all.ts. Do not edit by hand.
import type { MajorCardDisplay } from './types'

export const majorCardDefinitionsList: readonly (MajorCardDisplay & { kind: 'major' })[] = [
${definitionArray(majorSources, majorMetas)}
]

export const majorImprovementIdsList =
  majorCardDefinitionsList.map((card) => card.id)
`

  const majorRuntimeGenerated = `// GENERATED by scripts/generate-register-all.ts. Do not edit by hand.
import type { CardSource } from '../card-source'
${majorImportBlock(majorSources)}

export const majorCardSources = [
${sourceArray(majorSources)}
] as const satisfies readonly CardSource<'major'>[]
`

  return {
    registerAll,
    catalogGenerated,
    majorGenerated,
    majorRuntimeGenerated,
    implCount: implSources.length,
    catalogDefinitionCount: catalogSources.length,
    majorDefinitionCount: majorSources.length,
  }
}

export function writeRegisterAll(options: BuildOptions = {}): void {
  const repoRoot = options.repoRoot ?? process.cwd()
  const cardsRoot = path.resolve(repoRoot, 'shared', 'cards')
  const result = buildRegisterAll({ repoRoot })

  const registerAllPath = path.join(cardsRoot, 'register-all.ts')
  fs.writeFileSync(registerAllPath, result.registerAll, 'utf8')
  console.log(`[generate-register-all] wrote ${result.implCount} impl entries to ${registerAllPath}`)

  const catalogGeneratedPath = path.join(cardsRoot, 'catalog.generated.ts')
  fs.writeFileSync(catalogGeneratedPath, result.catalogGenerated, 'utf8')
  console.log(`[generate-register-all] wrote ${result.catalogDefinitionCount} card defs to ${catalogGeneratedPath}`)

  const majorGeneratedPath = path.join(cardsRoot, 'major', 'generated.ts')
  fs.writeFileSync(majorGeneratedPath, result.majorGenerated, 'utf8')
  console.log(`[generate-register-all] wrote ${result.majorDefinitionCount} major defs to ${majorGeneratedPath}`)

  const majorRuntimeGeneratedPath = path.join(cardsRoot, 'major', 'runtime.generated.ts')
  fs.writeFileSync(majorRuntimeGeneratedPath, result.majorRuntimeGenerated, 'utf8')
  console.log(`[generate-register-all] wrote ${result.majorDefinitionCount} major runtime entries to ${majorRuntimeGeneratedPath}`)
}

const isCli = process.argv[1] === fileURLToPath(import.meta.url)
if (isCli) {
  writeRegisterAll()
}
