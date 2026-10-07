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
// Validates that the 4-file PR output from `generatePrFiles` is self-consistent:
//   1. The generated tree compiles under `tsc --noEmit -p tsconfig.app.json`
//   2. Re-running `scripts/generate-register-all.ts` on the generated tree
//      produces byte-identical generated card files.
// This catches drift between `patchRegisterAll` and the canonical scanner in
// `generate-register-all.ts`.
//
// Note: docs/community_cards.md is patched by patchCommunityCardsMarkdown but
// has no scanner equivalent in generate-register-all.ts, so it's not asserted
// here — diff would be vacuous.
describe('PR files self-consistency (S9-B2)', () => {
  it.each(['effect','empty'])(
    'generated %s card compiles under tsc + generated card files match generate-register-all rerun',
    { timeout: 120_000 },
    async mode => {
      const wcard = {
        id: 'snap-1',
        card_id: 'CUSTOM_SnapshotCard',
        card_type: 'minor',
        author_name: 'snapshot',
        effect_code: `const CARD_ID = 'CUSTOM_SnapshotCard'
const CARD_DEF = new MinorImprovement({ id: CARD_ID, name: 'Snapshot Card', deck: 'community', number: 0, desc: ['Each harvest, gain 1 <FOOD>.'], cost: { wood: 1 }, vp: 0 })
const CARD_IMPL = { effect: { id: CARD_ID, onHarvest: () => gainLeaf(CARD_ID, { food: 1 }) } }`,
        card_json: JSON.stringify({ name: 'Snapshot Card' }),
      }
      if (mode === 'empty') {
        wcard.effect_code = `const CARD_ID = 'CUSTOM_SnapshotCard'
const CARD_DEF = { cardType: 'minor', meta: { id: 'CUSTOM_SnapshotCard', name: 'Snapshot Card', deck: 'community', number: 0, desc: [], cost: {}, vp: 0 } }
const CARD_IMPL = {}`
      }

      const upstream_register_all = readFileSync(
        join(REPO_ROOT, 'shared/cards/register-all.ts'),
        'utf-8',
      )
      const upstream_catalog_generated = readFileSync(
        join(REPO_ROOT, 'shared/cards/catalog.generated.ts'),
        'utf-8',
      )
      const upstream_community_md = readFileSync(
        join(REPO_ROOT, 'docs/community_cards.md'),
        'utf-8',
      )

      // 1. Generate PR files
      const files = await generatePrFiles({
        wcard,
        github_login: 'snapshot',
        upstream_register_all,
        upstream_catalog_generated,
        upstream_community_md,
        pr_number: 999,
      })
      expect(files.length).toBe(4)

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
          'docs',
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

        // Apply generated files
        for (const f of files) {
          const dest = join(tmp, f.path)
          mkdirSync(dirname(dest), { recursive: true })
          writeFileSync(dest, f.content, {
            encoding: f.encoding === 'base64' ? 'base64' : 'utf-8',
          })
        }

        // 3. Run tsc --noEmit on the app project — exercises the full
        // shared/ + cards + community graph including the new card.
        execFileSync('./node_modules/.bin/tsc', [
          '--noEmit',
          '-p',
          'tsconfig.app.json',
        ], {
          cwd: tmp,
          stdio: 'inherit',
        })

        // 4. Run generate-register-all and compare against generatePrFiles output.
        execFileSync('./node_modules/.bin/tsx', [
          'scripts/generate-register-all.ts',
        ], {
          cwd: tmp,
          stdio: 'pipe',
        })

        for (const generatedPath of [
          'shared/cards/register-all.ts',
          'shared/cards/catalog.generated.ts',
        ]) {
          const regenerated = readFileSync(join(tmp, generatedPath), 'utf-8')
          const expected = files.find((f) => f.path === generatedPath)!.content
          expect(regenerated).toBe(expected)
        }
      } finally {
        rmSync(tmp, { recursive: true, force: true })
      }
    },
  )
})
