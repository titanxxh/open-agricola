/**
 * TypeScript AST validator for custom card code.
 *
 * Parses user-submitted TypeScript, walks the AST, and rejects any
 * construct that could escape the sandbox (imports, eval, process, etc.).
 *
 * NOTE: This validator is defense-in-depth — it provides helpful error
 * messages for users. The actual security boundary is isolated-vm
 * (separate V8 heap, no prototype chain escapes possible).
 */
import ts from 'typescript'

export type ValidationResult = { valid: true } | { valid: false; errors: string[] }

/** Identifiers that are completely forbidden as references. */
const DENIED_IDENTIFIERS = new Set([
  // Sandbox escapes
  'eval', 'Function', 'process', 'require', 'globalThis', 'global',
  'window', 'document', '__dirname', '__filename',
  // Network / IO
  'fetch', 'XMLHttpRequest', 'WebSocket',
  // Timers (not available in sandbox)
  'setTimeout', 'setInterval', 'setImmediate', 'clearTimeout', 'clearInterval',
  // Alternative runtimes
  'Deno', 'Bun',
  // Prototype chain manipulation (primary VM escape vector)
  'Proxy', 'Reflect',
])

/** Property names that are forbidden even in property access (obj.constructor). */
const DENIED_PROPERTY_ACCESS = new Set([
  'constructor',
  '__proto__',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
])

export function validateCardCode(source: string): ValidationResult {
  const sourceFile = ts.createSourceFile(
    'card.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS,
  )

  const errors: string[] = []

  function getLine(node: ts.Node): number {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart())
    return line + 1
  }

  function visit(node: ts.Node): void {
    // Deny import declarations
    if (ts.isImportDeclaration(node)) {
      errors.push(`line ${getLine(node)}: import declarations are not allowed`)
      return
    }

    // Deny export declarations
    if (ts.isExportDeclaration(node) || ts.isExportAssignment(node)) {
      errors.push(`line ${getLine(node)}: export declarations are not allowed`)
      return
    }

    // Deny dynamic import (import(...))
    if (node.kind === ts.SyntaxKind.ImportKeyword) {
      errors.push(`line ${getLine(node)}: dynamic import is not allowed`)
      return
    }

    // Deny require() calls
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require') {
      errors.push(`line ${getLine(node)}: require() is not allowed`)
      return
    }

    // Check identifier references against deny list
    if (ts.isIdentifier(node)) {
      const parent = node.parent
      // Skip property access names (obj.process is fine, bare process is not)
      // BUT check DENIED_PROPERTY_ACCESS for dangerous property names
      if (parent && ts.isPropertyAccessExpression(parent) && parent.name === node) {
        if (DENIED_PROPERTY_ACCESS.has(node.text)) {
          errors.push(`line ${getLine(node)}: accessing '.${node.text}' is not allowed`)
        }
      } else if (parent && (ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent)) && parent.name === node) {
        // Object literal key — OK
      } else if (parent && ts.isLabeledStatement(parent) && parent.label === node) {
        // Label — OK
      } else if (parent && ts.isBreakOrContinueStatement(parent) && parent.label === node) {
        // break/continue label — OK
      } else if (DENIED_IDENTIFIERS.has(node.text)) {
        errors.push(`line ${getLine(node)}: '${node.text}' is not allowed`)
      }
    }

    // Deny computed property access with string literals containing denied names
    // e.g., obj['constructor'], obj['__proto__']
    if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression)) {
      if (DENIED_PROPERTY_ACCESS.has(node.argumentExpression.text)) {
        errors.push(`line ${getLine(node)}: accessing ['${node.argumentExpression.text}'] is not allowed`)
      }
    }

    // Deny tagged template expressions that use denied identifiers
    if (ts.isTaggedTemplateExpression(node) && ts.isIdentifier(node.tag) && DENIED_IDENTIFIERS.has(node.tag.text)) {
      errors.push(`line ${getLine(node)}: '${node.tag.text}' is not allowed`)
    }

    // Deny class declarations (unnecessary complexity, potential prototype manipulation)
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      errors.push(`line ${getLine(node)}: class declarations are not allowed`)
      return
    }

    // Deny with statements
    if (node.kind === ts.SyntaxKind.WithStatement) {
      errors.push(`line ${getLine(node)}: 'with' statement is not allowed`)
      return
    }

    // Deny generator functions
    if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) && node.asteriskToken) {
      errors.push(`line ${getLine(node)}: generator functions are not allowed`)
      return
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)

  // Also check for syntax errors
  const diagnostics = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      strict: false,
      noEmit: false,
    },
    reportDiagnostics: true,
  }).diagnostics

  if (diagnostics && diagnostics.length > 0) {
    for (const d of diagnostics) {
      const msg = ts.flattenDiagnosticMessageText(d.messageText, '\n')
      const line = d.file && d.start !== undefined
        ? d.file.getLineAndCharacterOfPosition(d.start).line + 1
        : 0
      errors.push(`line ${line}: ${msg}`)
    }
  }

  if (errors.length === 0) return { valid: true }
  return { valid: false, errors }
}
