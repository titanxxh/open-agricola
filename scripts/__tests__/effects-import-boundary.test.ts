import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ALLOWED_EFFECT_FILES } from '../check-effects-file-list'

const topLevelHelperFiles = [
  'exchange-resources.ts',
  'exchange-to-trade.ts',
  'trade-applied-listener.ts',
]

const walkTsFiles = (dir: string): string[] => {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) out.push(...walkTsFiles(full))
    if (stat.isFile() && entry.endsWith('.ts')) out.push(full)
  }
  return out
}

describe('effects import boundary', () => {
  it('keeps pure trade helpers out of the top-level effects allow-list', () => {
    expect(ALLOWED_EFFECT_FILES).not.toEqual(expect.arrayContaining(topLevelHelperFiles))
  })

  it('keeps payment internals from importing top-level effects helpers', () => {
    const paymentInternalDir = path.join(process.cwd(), 'shared/actions/payment/internal')
    const offenders = walkTsFiles(paymentInternalDir)
      .filter((file) =>
        /from ['"]\.\.\/\.\.\/effects\/(?:exchange-resources|exchange-to-trade|trade-applied-listener)['"]/.test(
          readFileSync(file, 'utf8'),
        ))
      .map((file) => path.relative(process.cwd(), file))

    expect(offenders).toEqual([])
  })

  it('routes preview-cost callers through PaymentSolver instead of payment internals', () => {
    const previewInternalNames = [
      'canAffordActionPreviewCost',
      'resolveActionPreviewCost',
      'canAffordCardPreviewCostByProvider',
      'payCardPreviewCostByProvider',
      'resolveCardPreviewCostByProvider',
      'resolveCardPreviewCostDetailedByProvider',
    ]
    const checkedFiles = [
      'shared/actions/helpers/cost-preview.ts',
      'shared/actions/helpers/improvement-helpers.ts',
      'shared/actions/effects/occupation.ts',
    ]
    const offenders = checkedFiles.flatMap((file) => {
      const source = readFileSync(path.join(process.cwd(), file), 'utf8')
      const internalImportBlocks = Array.from(
        source.matchAll(/import\s+{([^}]*)}\s+from ['"][^'"]*payment\/internal['"]/g),
        (match) => match[1] ?? '',
      )
      return previewInternalNames
        .filter((name) => internalImportBlocks.some((block) => new RegExp(`\\b${name}\\b`).test(block)))
        .map((name) => `${file}:${name}`)
    })

    expect(offenders).toEqual([])
  })

  it('routes improvement purchase payment selection through PaymentSolver instead of payment internals', () => {
    const forbiddenNames = [
      'canConsumePaymentResourceProviders',
      'cardCostCandidateMetadataForSolution',
      'executePaymentSolution',
      'resolvePaymentSolutionSelection',
    ]
    const file = 'shared/actions/effects/improvement.ts'
    const source = readFileSync(path.join(process.cwd(), file), 'utf8')
    const internalImportBlocks = Array.from(
      source.matchAll(/import\s+{([^}]*)}\s+from ['"][^'"]*payment\/internal['"]/g),
      (match) => match[1] ?? '',
    )
    const offenders = forbiddenNames
      .filter((name) => internalImportBlocks.some((block) => new RegExp(`\\b${name}\\b`).test(block)))
      .map((name) => `${file}:${name}`)

    expect(offenders).toEqual([])
  })

  it('routes typed-flat payment callers through PaymentSolver instead of payment internals', () => {
    const forbiddenNames = [
      'canAffordTypedFlatCost',
      'payTypedFlatCost',
      'payTypedFlatCostDetailed',
      'resolveTypedFlatPaymentSelection',
      'executeResolvedTypedFlatPayment',
      'filterPaymentSolutionsByReserve',
    ]
    const checkedFiles = [
      'shared/actions/effects/fencing.ts',
      'shared/actions/effects/plow.ts',
      'shared/actions/effects/stables.ts',
      'shared/actions/effects/renovation.ts',
      'shared/actions/effects/occupation.ts',
      'shared/seasons/action-spaces.ts',
      'shared/seasons/hooks.ts',
      'shared/domain/farmyard.ts',
    ]
    const offenders = checkedFiles.flatMap((file) => {
      const source = readFileSync(path.join(process.cwd(), file), 'utf8')
      const internalImportBlocks = Array.from(
        source.matchAll(/import\s+{([^}]*)}\s+from ['"][^'"]*payment\/internal(?:\/typed-flat)?['"]/g),
        (match) => match[1] ?? '',
      )
      return forbiddenNames
        .filter((name) => internalImportBlocks.some((block) => new RegExp(`\\b${name}\\b`).test(block)))
        .map((name) => `${file}:${name}`)
    })

    expect(offenders).toEqual([])
  })

  it('routes production card cost candidate helpers through PaymentSolver instead of payment internals', () => {
    const forbiddenNames = [
      'discountCardCostCandidate',
      'addCardCostCandidateAttribution',
    ]
    const cardsDir = path.join(process.cwd(), 'shared/cards')
    const checkedFiles = walkTsFiles(cardsDir).filter((file) =>
      !file.includes(`${path.sep}__tests__${path.sep}`) &&
      !file.includes(`${path.sep}__stubs__${path.sep}`))
    const offenders = checkedFiles.flatMap((absFile) => {
      const source = readFileSync(absFile, 'utf8')
      const internalImportBlocks = Array.from(
        source.matchAll(/import\s+{([^}]*)}\s+from ['"][^'"]*actions\/payment\/internal['"]/g),
        (match) => match[1] ?? '',
      )
      const file = path.relative(process.cwd(), absFile)
      return forbiddenNames
        .filter((name) => internalImportBlocks.some((block) => new RegExp(`\\b${name}\\b`).test(block)))
        .map((name) => `${file}:${name}`)
    })

    expect(offenders).toEqual([])
  })

  it('keeps production code outside payment package from importing payment internals', () => {
    const roots = [
      path.join(process.cwd(), 'shared'),
      path.join(process.cwd(), 'server'),
      path.join(process.cwd(), 'client'),
    ]
    const offenders = roots.flatMap((root) => walkTsFiles(root))
      .filter((file) =>
        !file.includes(`${path.sep}__tests__${path.sep}`) &&
        !file.includes(`${path.sep}__stubs__${path.sep}`) &&
        !file.includes(`${path.sep}shared${path.sep}actions${path.sep}payment${path.sep}`))
      .flatMap((absFile) => {
        const source = readFileSync(absFile, 'utf8')
        const importsInternal = /from ['"][^'"]*payment\/internal(?:\/[^'"]*)?['"]/.test(source)
        return importsInternal ? [path.relative(process.cwd(), absFile)] : []
      })

    expect(offenders.sort()).toEqual([])
  })
})
