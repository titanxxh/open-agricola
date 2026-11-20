import { describe, it, expect } from 'vitest'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  cpSync,
  existsSync,
  symlinkSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { basename, join, dirname, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { generatePrFiles } from '../code-gen'

const REPO_ROOT = resolve(__dirname, '../../..')

const resolveInstalledNodeModules = (): string => {
  const runtimeRequire = createRequire(import.meta.url)
  let current = dirname(runtimeRequire.resolve('typescript/package.json'))
  while (dirname(current) !== current) {
    if (
      basename(current) === 'node_modules' &&
      existsSync(join(current, '.bin/tsc')) &&
      existsSync(join(current, '.bin/tsx'))
    ) {
      return current
    }
    current = dirname(current)
  }
  throw new Error('could not locate installed node_modules with tsc and tsx')
}

// Slow test: copies repo into tmpdir, writes generated files, runs tsc + generate.
// Validates that the PR output from `generatePrFiles` is self-consistent for
// three card shapes (effect, empty, companion helper). The three cards use
// distinct IDs and are chained into one tree — each PR is generated against the
// previous PR's register-all / catalog — so one `tsc` and one generate cover all:
//   1. The generated tree compiles under `tsc --noEmit -p tsconfig.app.json`
//   2. Re-running `scripts/generate-register-all.ts` on the generated tree
//      produces byte-identical generated card files.
// This catches drift between `patchRegisterAll` / `patchCatalogGenerated` and
// the canonical scanner in `generate-register-all.ts`.
//
// Note: docs/community_cards.md is patched by patchCommunityCardsMarkdown but
// has no scanner equivalent in generate-register-all.ts, so it's not asserted
// or written here — diff would be vacuous.
type SnapshotMode = 'effect' | 'empty' | 'companion helper'

const SNAPSHOT_CARDS: Array<{ mode: SnapshotMode; cardId: string }> = [
  { mode: 'effect', cardId: 'CUSTOM_SnapshotEffect' },
  { mode: 'empty', cardId: 'CUSTOM_SnapshotEmpty' },
  { mode: 'companion helper', cardId: 'CUSTOM_SnapshotHelper' },
]

const snapshotEffectCode = (mode: SnapshotMode, cardId: string): string => {
  if (mode === 'effect') {
    return `import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = '${cardId}'

export const ${cardId} = defineMinorCard({
  meta: { id: CARD_ID, name: 'Snapshot Card', deck: 'community', number: 0, desc: ['Each harvest, gain 1 <FOOD>.'], cost: { wood: 1 }, vp: 0 },
  impl: { effect: { id: CARD_ID, onHarvest: () => gainLeaf(CARD_ID, { food: 1 }) } },
})`
  }
  return `import { defineMinorCard } from '../card-source'
${mode === 'companion helper' ? "import { gainLeaf } from '../helpers/pay-gain-node'\n\nconst FOOD = 1\n" : ''}
export const ${cardId} = defineMinorCard({
  meta: { id: '${cardId}', name: 'Snapshot Card', deck: 'community', number: 0, desc: [], cost: {}, vp: 0 },
  impl: ${mode === 'companion helper' ? `{ effect: { id: '${cardId}', onHarvest: () => gainLeaf('${cardId}', { food: FOOD }) } }` : '{}'},
})`
}

describe('PR files self-consistency (S9-B2)', () => {
  it(
    'generated effect, empty and companion helper cards compile under one tsc + generated card files match one generate-register-all rerun',
    { timeout: 120_000 },
    async () => {
      let register_all = readFileSync(
        join(REPO_ROOT, 'shared/cards/register-all.ts'),
        'utf-8',
      )
      let catalog_generated = readFileSync(
        join(REPO_ROOT, 'shared/cards/catalog.generated.ts'),
        'utf-8',
      )
      let community_md = readFileSync(
        join(REPO_ROOT, 'docs/community_cards.md'),
        'utf-8',
      )

      // 1. Generate PR files, chaining each card onto the previous PR's output.
      const cardFiles: Array<{ path: string; content: string }> = []
      for (const [index, { mode, cardId }] of SNAPSHOT_CARDS.entries()) {
        const files = await generatePrFiles({
          wcard: {
            id: `snap-${index + 1}`,
            card_id: cardId,
            card_type: 'minor',
            author_name: 'snapshot',
            effect_code: snapshotEffectCode(mode, cardId),
            card_json: JSON.stringify({ name: `Snapshot Card ${mode}` }),
          },
          github_login: 'snapshot',
          upstream_register_all: register_all,
          upstream_catalog_generated: catalog_generated,
          upstream_community_md: community_md,
          pr_number: 999 + index,
        })
        expect(files.map((f) => f.path).sort()).toEqual(
          [
            `shared/cards/community/${cardId}.ts`,
            'docs/community_cards.md',
            'shared/cards/catalog.generated.ts',
            'shared/cards/register-all.ts',
          ].sort(),
        )
        const byPath = (path: string) => files.find((f) => f.path === path)!
        const cardFile = byPath(`shared/cards/community/${cardId}.ts`)
        expect(cardFile.encoding).toBe('utf-8')
        cardFiles.push({ path: cardFile.path, content: cardFile.content })
        register_all = byPath('shared/cards/register-all.ts').content
        catalog_generated = byPath('shared/cards/catalog.generated.ts').content
        community_md = byPath('docs/community_cards.md').content
      }
      for (const { cardId } of SNAPSHOT_CARDS) {
        expect(register_all).toContain(cardId)
        expect(catalog_generated).toContain(cardId)
      }

      // 2. Mirror repo into tmpdir + apply files
      const tmp = mkdtempSync(join(tmpdir(), 's9-pr-snapshot-'))
      try {
        // Copy minimum needed structure (avoid node_modules — too slow).
        // Note: tsconfig.app.json copied here will be overwritten below to
        // redirect tsBuildInfoFile away from the symlinked node_modules.
        const includeDirs = [
          'shared',
          'server',
          'tsconfig.app.json',
          'tsconfig.json',
          'package.json',
          'pnpm-lock.yaml',
          'scripts',
          'public',
        ]
        for (const entry of includeDirs) {
          const src = join(REPO_ROOT, entry)
          if (!existsSync(src)) continue
          cpSync(src, join(tmp, entry), { recursive: true })
        }
        // Symlink node_modules instead of copying (saves several minutes).
        const nm = resolveInstalledNodeModules()
        symlinkSync(nm, join(tmp, 'node_modules'), 'dir')

        // Redirect tsBuildInfoFile so we don't write into the symlinked
        // node_modules of the real repo. tsconfig is JSONC (has comments),
        // so we patch the single line via regex instead of JSON.parse.
        const tscfgRaw = readFileSync(join(tmp, 'tsconfig.app.json'), 'utf-8')
        const tscfgPatched = tscfgRaw.replace(
          /"tsBuildInfoFile"\s*:\s*"[^"]*"/,
          '"tsBuildInfoFile": "./tsbuildinfo.app"',
        )
        if (tscfgPatched === tscfgRaw) {
          throw new Error(
            'tsconfig.app.json missing tsBuildInfoFile field — symlink to node_modules would be polluted',
          )
        }
        writeFileSync(join(tmp, 'tsconfig.app.json'), tscfgPatched, 'utf-8')

        // Apply generated files: the three card files plus the final chained
        // register-all / catalog.
        const finalFiles = [
          ...cardFiles,
          { path: 'shared/cards/register-all.ts', content: register_all },
          { path: 'shared/cards/catalog.generated.ts', content: catalog_generated },
        ]
        for (const f of finalFiles) {
          const dest = join(tmp, f.path)
          mkdirSync(dirname(dest), { recursive: true })
          writeFileSync(dest, f.content, 'utf-8')
        }

        // 3. Run tsc --noEmit on the app project once — exercises the full
        // shared/ + cards + community graph including all three new cards.
        execFileSync('./node_modules/.bin/tsc', [
          '--noEmit',
          '-p',
          'tsconfig.app.json',
        ], {
          cwd: tmp,
          stdio: 'inherit',
        })

        // 4. Run generate-register-all once and compare against the chained
        // generatePrFiles output.
        execFileSync('./node_modules/.bin/tsx', [
          'scripts/generate-register-all.ts',
        ], {
          cwd: tmp,
          stdio: 'pipe',
        })

        expect(readFileSync(join(tmp, 'shared/cards/register-all.ts'), 'utf-8')).toBe(register_all)
        expect(readFileSync(join(tmp, 'shared/cards/catalog.generated.ts'), 'utf-8')).toBe(catalog_generated)
      } finally {
        rmSync(tmp, { recursive: true, force: true })
      }
    },
  )
})
