/**
 * Extract the full TypeScript code block (CARD_DEF + CARD_IMPL) from an LLM
 * markdown response. The prompt instructs the model to wrap code in a
 * ```typescript fence; we tolerate ```ts as well.
 */

const FENCE_RE = /```(?:typescript|ts)\s*\n([\s\S]*?)```/gi

export class ExtractError extends Error {
  constructor(
    message: string,
    public readonly response: string,
  ) {
    super(message)
    this.name = 'ExtractError'
  }
}

export function extractCardCode(response: string): string {
  const blocks: string[] = []
  let match: RegExpExecArray | null
  FENCE_RE.lastIndex = 0
  while ((match = FENCE_RE.exec(response)) !== null) {
    blocks.push(match[1]!)
  }
  if (blocks.length === 0) {
    throw new ExtractError('no ```typescript or ```ts code fence found in LLM response', response)
  }
  const winner = blocks.find((b) => /\bCARD_DEF\b/.test(b) && /\bCARD_IMPL\b/.test(b))
  if (!winner) {
    throw new ExtractError(
      `no code block contained both CARD_DEF and CARD_IMPL (found ${blocks.length} block(s))`,
      response,
    )
  }
  return winner.trim()
}

/**
 * Rewrite the cardId in the extracted code so it matches the fixture's
 * expected ID. LLM tends to invent its own ID; we want a stable one for
 * registration. We do a textual replacement of any `CARD_ID = '...'` literal
 * and the `id: '...'` inside CARD_DEF.
 *
 * Returns the rewritten code. If we can't find a CARD_ID literal to rewrite,
 * we leave the code untouched (the validate step will surface the issue).
 */
export function rewriteCardId(code: string, targetId: string): string {
  const idLiteralRe = /(const\s+CARD_ID\s*=\s*['"])([^'"]+)(['"])/m
  if (idLiteralRe.test(code)) {
    return code.replace(idLiteralRe, `$1${targetId}$3`)
  }
  // Fallback: replace the first `id: '...'` field after CARD_DEF.
  const defStart = code.indexOf('CARD_DEF')
  if (defStart < 0) return code
  const window = code.slice(defStart)
  const idFieldRe = /(\bid\s*:\s*['"])([^'"]+)(['"])/
  const m = window.match(idFieldRe)
  if (!m) return code
  const newWindow = window.replace(idFieldRe, `$1${targetId}$3`)
  return code.slice(0, defStart) + newWindow
}
