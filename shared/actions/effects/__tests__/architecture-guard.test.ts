import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { internalActionDefinitions } from '../../index'
import { checkEffectsFileList } from '../../../../scripts/check-effects-file-list'
import ts from 'typescript'

const effectsDir = join(process.cwd(), 'shared/actions/effects')
const cardsDir = join(process.cwd(), 'shared/cards')

const cardPresentationOffenders = (source: string, fileName: string): string[] => {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const offenders: string[] = []
  const functions = new Map<string, ts.Node>()
  const unwrap = (expression: ts.Expression): ts.Expression => ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression) || ts.isParenthesizedExpression(expression)
    ? unwrap(expression.expression) : expression
  const resolveExpression = (expression: ts.Expression, seen = new Set<string>()): ts.Expression => {
    const value = unwrap(expression)
    if (!ts.isIdentifier(value) || seen.has(value.text)) return value
    const declaration = functions.get(value.text)
    return declaration && ts.isExpression(declaration) ? resolveExpression(declaration, new Set([...seen, value.text])) : value
  }
  const name = (node: ts.PropertyName): string | undefined => ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : undefined
  const containsNumber = (node: ts.Node, seen = new Set<string>()): boolean => {
    if (ts.isNumericLiteral(node)) return true
    if (ts.isIdentifier(node) && !seen.has(node.text)) {
      const declaration = functions.get(node.text)
      if (declaration && containsNumber(declaration, new Set([...seen, node.text]))) return true
    }
    return node.getChildren(file).some(child => containsNumber(child, seen))
  }
  const property = (object: ts.ObjectLiteralExpression, key: string): ts.Expression | undefined => {
    const entry = object.properties.find(candidate => (ts.isPropertyAssignment(candidate) || ts.isShorthandPropertyAssignment(candidate)) && name(candidate.name) === key)
    return entry && ts.isPropertyAssignment(entry) ? entry.initializer : entry && ts.isShorthandPropertyAssignment(entry) ? entry.name : undefined
  }
  const inspectAnnotations = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node) && name(node.name) === 'labelParams' && containsNumber(node.initializer)) offenders.push('anytime numeric labelParams')
    if (ts.isShorthandPropertyAssignment(node) && node.name.text === 'labelParams' && containsNumber(node.name)) offenders.push('anytime numeric labelParams')
    ts.forEachChild(node, inspectAnnotations)
  }
  const collectFunctions = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) functions.set(node.name.text, node.initializer)
    if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node)
    ts.forEachChild(node, collectFunctions)
  }
  collectFunctions(file)
  const inspect = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node) && ['effectPreview', 'descriptionPreview'].includes(name(node.name) ?? '') && ts.isObjectLiteralExpression(resolveExpression(node.initializer))) offenders.push(`literal ${name(node.name)}`)
    if (ts.isShorthandPropertyAssignment(node) && ['effectPreview', 'descriptionPreview'].includes(node.name.text) && ts.isObjectLiteralExpression(resolveExpression(node.name))) offenders.push(`literal ${node.name.text}`)
    if (ts.isObjectLiteralExpression(node)) {
      const phases = property(node, 'phases')
      const phaseArray = phases ? resolveExpression(phases) : undefined
      const anytime = phaseArray && ts.isArrayLiteralExpression(phaseArray) && phaseArray.elements.some(element => {
        const value = unwrap(element)
        return ts.isStringLiteral(value) && value.text === 'anytime'
      })
      const handler = node.properties.find(entry => (ts.isPropertyAssignment(entry) || ts.isMethodDeclaration(entry)) && name(entry.name) === (anytime ? 'handler' : 'anytime'))
      if (handler) {
        if (ts.isMethodDeclaration(handler)) inspectAnnotations(handler)
        else if (ts.isPropertyAssignment(handler)) {
          const expression = unwrap(handler.initializer)
          inspectAnnotations(ts.isIdentifier(expression) ? functions.get(expression.text) ?? expression : expression)
        }
      }
    }
    ts.forEachChild(node, inspect)
  }
  inspect(file)
  return offenders
}

describe('effects architecture guard', () => {
  it('keeps native board flows out of opaque execute callbacks', () => {
    const directory = join(cardsDir, 'action')
    const offenders = readdirSync(directory).filter(file => file.endsWith('.ts')).flatMap(file => {
      const source = ts.createSourceFile(file, readFileSync(join(directory, file), 'utf8'), ts.ScriptTarget.Latest, true)
      const found: string[] = []
      const inspectExecute = (node: ts.Node) => {
        if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'flow' && ts.isObjectLiteralExpression(node.initializer)) found.push(file)
        ts.forEachChild(node, inspectExecute)
      }
      const inspect = (node: ts.Node) => {
        if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'execute') inspectExecute(node.initializer)
        else ts.forEachChild(node, inspect)
      }
      inspect(source)
      return found
    })
    expect(offenders).toEqual([])
  })
  it('keeps top-level effects limited to the approved files', () => {
    expect(checkEffectsFileList(effectsDir).ok).toBe(true)
  })

  it('keeps action registrations limited to the approved ids', () => {
    const ids = internalActionDefinitions.map((action) => action.id).sort()

    expect(ids).toEqual([
      'activate-card-effect',
      'activate-extra-turn',
      'add-animal-capacity',
      'bake-bread',
      'bonus-food',
      'bonus-grain',
      'bonus-vp',
      'bonus-wood',
      'breed',
      'build-farmhand-room',
      'claim-farmyard-goods-tokens',
      'claim-field-goods-tokens',
      'collect',
      'complete-parent-father',
      'complete-preparation',
      'construct',
      'consume-card-counter',
      'discard-card-stack',
      'draw-ordinary-cards',
      'emit-choice',
      'exchange',
      'family-growth',
      'fence',
      'field-operation',
      'future-meeples',
      'gain',
      'improvement',
      'individual-food-cost',
      'lie-animal',
      'moor-special-action-apply',
      'moor-special-action-choice',
      'moor-wood-to-fuel',
      'move-farmer-to-space',
      'occupation',
      'occupation-gate',
      'pass-minor-card-to-left',
      'pay',
      'place-farmer',
      'place-farmer-on-space',
      'plow',
      'pop-card-stack',
      'push-to-card-stack',
      'reap',
      'recall-placed-worker',
      'receive',
      'renovate-house',
      'reorganize',
      'repeat-action',
      'reserve-fence-supply',
      'resolve-timed-rule',
      'return-to-space',
      'rule-condition',
      'rule-gain',
      'rule-operation',
      'schedule-offers',
      'scheduled-offer',
      'season-summer-bread-or-sell',
      'season-summer-sell-grain',
      'selection',
      'set-first-player',
      'sow',
      'special-effect',
      'spend-worker',
      'stables',
      'store-on-card',
      'take-from-card',
      'turn-scope',
    ])
  })

  it('keeps consequence annotations out of card-owned runtime declarations', () => {
    const offenders = ['A', 'B', 'C', 'D', 'E', 'M', 'major'].flatMap(directory => readdirSync(join(cardsDir, directory))
      .filter(file => file.endsWith('.ts'))
      .flatMap(file => cardPresentationOffenders(readFileSync(join(cardsDir, directory, file), 'utf8'), file).map(reason => `${directory}/${file}: ${reason}`)))
    expect(offenders).toEqual([])
  })

  it('rejects the duplicated anytime consequence while allowing executable amounts', () => {
    expect(cardPresentationOffenders(`const listener = { phases: ['anytime' as Phase], handler: () => ({ labelParams: { food: 1 }, flow: { type: 'leaf', actionId: 'gain', params: { food: 4 } }, effectPreview: { kind: 'resourceExchange', resourcesGained: { food: 1 } } }) }`, 'duplicate.ts'))
      .toEqual(['anytime numeric labelParams', 'literal effectPreview'])
    expect(cardPresentationOffenders(`const FOOD = 1; const phases = ['anytime']; const listener = { phases, handler() { return { labelParams: { food: FOOD } } } }`, 'constant.ts')).toEqual(['anytime numeric labelParams'])
    expect(cardPresentationOffenders(`const labelParams = { food: 1 }; const effectPreview = { kind: 'resourceExchange', resourcesGained: { food: 1 } }; const listener = { phases: ['anytime'], handler: () => ({ labelParams, effectPreview }) }`, 'shorthand.ts')).toEqual(['anytime numeric labelParams', 'literal effectPreview'])
    expect(cardPresentationOffenders(`const listener = { phases: ['anytime'], handler: () => ({ flow: { type: 'leaf', actionId: 'gain', params: { food: 4 } } }) }; const timedRule = { body: { kind: 'gain', resources: { food: 4 } } }`, 'rule.ts')).toEqual([])
  })

  it('keeps card listener registry access out of top-level effect files', () => {
    const offenders = readdirSync(effectsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .filter((entry) => readFileSync(join(effectsDir, entry.name), 'utf8').includes('getRegisteredCardListeners('))
      .map((entry) => entry.name)

    expect(offenders).toEqual([])
  })
})
