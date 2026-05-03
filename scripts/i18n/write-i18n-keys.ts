import * as fs from 'node:fs'
import ts from 'typescript'

export function writeI18nKeys(
  filePath: string,
  varName: string,
  additions: Map<string, string>,
): void {
  for (const [keyPath, value] of additions) {
    const source = fs.readFileSync(filePath, 'utf8')
    const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true)
    const root = findExportedObject(sf, varName)
    if (!root) throw new Error(`Cannot find export const ${varName} = {...} in ${filePath}`)

    const parts = keyPath.split('.')
    const insertion = computeInsertion(root, parts, value, source)
    if (insertion === null) continue
    fs.writeFileSync(
      filePath,
      source.slice(0, insertion.offset) + insertion.text + source.slice(insertion.offset),
    )
  }
}

function findExportedObject(sf: ts.SourceFile, varName: string): ts.ObjectLiteralExpression | null {
  for (const stmt of sf.statements) {
    if (
      ts.isVariableStatement(stmt) &&
      stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      for (const decl of stmt.declarationList.declarations) {
        if (
          ts.isIdentifier(decl.name) &&
          decl.name.text === varName &&
          decl.initializer &&
          ts.isObjectLiteralExpression(decl.initializer)
        ) {
          return decl.initializer
        }
      }
    }
  }
  return null
}

interface Insertion {
  offset: number
  text: string
}

function computeInsertion(
  root: ts.ObjectLiteralExpression,
  pathParts: string[],
  value: string,
  source: string,
): Insertion | null {
  let cur: ts.ObjectLiteralExpression = root
  let depth = 0
  for (let i = 0; i < pathParts.length - 1; i++) {
    const segment = pathParts[i]
    const child = findProperty(cur, segment)
    if (!child) {
      const remaining = pathParts.slice(i)
      const offset = closeBracePos(cur, source)
      const text = indentPrefix(depth + 1) + renderNested(remaining, value, depth + 1) + ',\n'
      return { offset, text }
    }
    if (
      !ts.isPropertyAssignment(child) ||
      !ts.isObjectLiteralExpression(child.initializer)
    ) {
      throw new Error(`Path collision at ${pathParts.slice(0, i + 1).join('.')}`)
    }
    cur = child.initializer
    depth++
  }
  const leafName = pathParts[pathParts.length - 1]
  if (findProperty(cur, leafName)) return null
  const offset = closeBracePos(cur, source)
  const text = indentPrefix(depth + 1) + propertyText(leafName, value) + ',\n'
  return { offset, text }
}

function findProperty(obj: ts.ObjectLiteralExpression, name: string): ts.ObjectLiteralElementLike | null {
  for (const p of obj.properties) {
    if (ts.isPropertyAssignment(p) && propertyName(p.name) === name) return p
  }
  return null
}

function propertyName(node: ts.PropertyName): string {
  if (ts.isIdentifier(node)) return node.text
  if (ts.isStringLiteral(node)) return node.text
  return node.getText()
}

function closeBracePos(obj: ts.ObjectLiteralExpression, source: string): number {
  let p = obj.end - 1
  while (p > obj.pos && source[p] !== '}') p--
  return p
}

function indentPrefix(depth: number): string {
  return '  '.repeat(depth)
}

function escapeSingleQuoted(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function isSimpleIdentifier(name: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)
}

function propertyText(name: string, value: string): string {
  const keyText = isSimpleIdentifier(name) ? name : `'${escapeSingleQuoted(name)}'`
  return `${keyText}: '${escapeSingleQuoted(value)}'`
}

function renderNested(parts: string[], value: string, baseDepth: number): string {
  if (parts.length === 1) return propertyText(parts[0], value)
  const head = parts[0]
  const headText = isSimpleIdentifier(head) ? head : `'${escapeSingleQuoted(head)}'`
  const inner = renderNested(parts.slice(1), value, baseDepth + 1)
  return `${headText}: {\n${indentPrefix(baseDepth + 1)}${inner},\n${indentPrefix(baseDepth)}}`
}
