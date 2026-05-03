import ts from 'typescript'
import * as fs from 'node:fs'

export interface StaticRef {
  key: string
  file: string
  line: number
}

export interface DynamicRef {
  template: string
  file: string
  line: number
}

export interface ExtractResult {
  static: StaticRef[]
  dynamic: DynamicRef[]
}

const KEY_PROP_NAMES = new Set([
  'nameKey',
  'descKey',
  'descriptionKey',
  'logKey',
  'promptKey',
  'titleKey',
  'labelKey',
  'i18nKey',
])

export function extractReferencesFromSource(file: string, source: string): ExtractResult {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  const out: ExtractResult = { static: [], dynamic: [] }

  const lineOf = (node: ts.Node): number =>
    sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1

  const recordArg = (arg: ts.Expression) => {
    if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
      if (arg.text === '') return
      out.static.push({ key: arg.text, file, line: lineOf(arg) })
    } else if (ts.isTemplateExpression(arg)) {
      out.dynamic.push({ template: arg.getText(sf), file, line: lineOf(arg) })
    }
  }

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 't' &&
      node.arguments.length >= 1
    ) {
      const first = node.arguments[0]
      if (
        node.arguments.length >= 2 &&
        (ts.isStringLiteral(node.arguments[1]) ||
          ts.isNoSubstitutionTemplateLiteral(node.arguments[1]) ||
          ts.isTemplateExpression(node.arguments[1]))
      ) {
        recordArg(node.arguments[1])
      } else {
        recordArg(first)
      }
    }
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
      if (KEY_PROP_NAMES.has(node.name.text)) {
        const init = node.initializer
        if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) {
          if (init.text !== '') {
            out.static.push({ key: init.text, file, line: lineOf(init) })
          }
        } else if (ts.isTemplateExpression(init)) {
          out.dynamic.push({ template: init.getText(sf), file, line: lineOf(init) })
        }
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sf)
  return out
}

export function extractReferencesFromFiles(filePaths: string[]): ExtractResult {
  const all: ExtractResult = { static: [], dynamic: [] }
  for (const f of filePaths) {
    const src = fs.readFileSync(f, 'utf8')
    const r = extractReferencesFromSource(f, src)
    all.static.push(...r.static)
    all.dynamic.push(...r.dynamic)
  }
  return all
}
