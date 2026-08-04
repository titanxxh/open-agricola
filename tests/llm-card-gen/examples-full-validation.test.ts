/**
 * Full validation of the 10 example cards in community-card-examples.md.
 *
 * For each example, three checks:
 *   1. Sandbox compile + execute (validateAndCompileCustomCode)
 *   2. PR file generation (generatePrFiles produces 5 syntactically valid TS files)
 *   3. Card Source file exports both UI metadata and implementation
 *
 * NOTE: We deliberately stop at "syntax + cross-ref" rather than full GameSession
 * integration because (a) each example's hook semantics are documented in markdown,
 * not formal expected-output, (b) validateAndCompileCustomCode already exercises
 * sandbox + manifest extraction, (c) full session play would require crafting
 * per-example scenario fixtures (out of scope — that's the M1..M11 fixture
 * suite's job).
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import { extractExamplesFromMarkdown, type ExtractedExample } from './examples-extract'
import { validateAndCompileCustomCode } from '../../server/custom-code/engine'
import { generatePrFiles } from '../../server/workshop-pr/code-gen'

const REPO_ROOT = resolve(__dirname, '../..')
const md = readFileSync(resolve(REPO_ROOT, 'docs/community-card-examples.md'), 'utf-8')

let examples: ExtractedExample[] = []
beforeAll(() => {
  examples = extractExamplesFromMarkdown(md)
  expect(examples).toHaveLength(10)
})

describe('community-card-examples.md — full validation (S9-B3)', () => {
  for (let i = 0; i < 10; i++) {
    const idx = i
    describe(`Example #${idx + 1}`, () => {
      const get = () => examples[idx]!

      it('compiles in sandbox (validateAndCompileCustomCode)', () => {
        const ex = get()
        const result = validateAndCompileCustomCode(ex.code, ex.id)
        if (!result.valid) {
          throw new Error(
            `[${ex.id}] sandbox validation failed:\n${result.errors.join('\n')}`,
          )
        }
        expect(result.valid).toBe(true)
      })

      it('PR generation produces 5 syntactically valid TS files', async () => {
        const ex = get()
        const wcard = {
          id: `example-${idx}`,
          card_id: ex.id,
          card_type: ex.cardType,
          author_name: 'examples',
          effect_code: ex.code,
          card_json: JSON.stringify({ name: ex.sectionTitle }),
        }
        const files = await generatePrFiles({
          wcard,
          github_login: 'examples',
          upstream_register_all: readFileSync(
            resolve(REPO_ROOT, 'shared/cards/register-all.ts'),
            'utf-8',
          ),
          upstream_catalog_generated: readFileSync(
            resolve(REPO_ROOT, 'shared/cards/catalog.generated.ts'),
            'utf-8',
          ),
          upstream_community_md: readFileSync(
            resolve(REPO_ROOT, 'docs/community_cards.md'),
            'utf-8',
          ),
          pr_number: 1000 + idx,
        })
        expect(files.length).toBe(5)
        expect(files.some((f) => f.path.includes('cards-display'))).toBe(false)
        // Parse generated TS files — ensures no syntax errors
        for (const f of files) {
          if (!f.path.endsWith('.ts')) continue
          const sf = ts.createSourceFile(
            f.path,
            f.content,
            ts.ScriptTarget.ES2022,
            false,
            ts.ScriptKind.TS,
          )
          const diagnostics =
            (sf as unknown as { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics ?? []
          if (diagnostics.length > 0) {
            const msgs = diagnostics
              .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))
              .join('\n')
            throw new Error(`[${ex.id}] ${f.path} has parse errors:\n${msgs}`)
          }
        }
      })

      it('card source file exports metadata and implementation correctly', async () => {
        const ex = get()
        const wcard = {
          id: `example-ref-${idx}`,
          card_id: ex.id,
          card_type: ex.cardType,
          effect_code: ex.code,
          card_json: JSON.stringify({ name: ex.sectionTitle }),
        }
        const files = await generatePrFiles({
          wcard,
          github_login: 'examples',
          upstream_register_all: readFileSync(
            resolve(REPO_ROOT, 'shared/cards/register-all.ts'),
            'utf-8',
          ),
          upstream_catalog_generated: readFileSync(
            resolve(REPO_ROOT, 'shared/cards/catalog.generated.ts'),
            'utf-8',
          ),
          upstream_community_md: readFileSync(
            resolve(REPO_ROOT, 'docs/community_cards.md'),
            'utf-8',
          ),
          pr_number: 2000 + idx,
        })
        const source = files.find((f) => f.path === `shared/cards/community/${ex.id}.ts`)!
        const factory = ex.cardType === 'occupation' ? 'defineOccupationCard' : 'defineMinorCard'
        expect(source.content).toContain(`export const ${ex.id} = ${factory}({`)
        expect(source.content).toContain('meta:')
        expect(source.content).toContain('impl: cardImpl')
        expect(source.content).toContain(`export const ${ex.id}_impl = ${ex.id}.impl`)
      })
    })
  }
})
