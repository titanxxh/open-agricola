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
import { cardEffectHooks } from '../cards/card-effects'
import { isSandboxListenerAction } from './sandbox-listener-actions'
import { sandboxListenerPhases } from './sandbox-listener-phases'

export type ValidationResult = { valid: true } | { valid: false; errors: string[] }

/** Identifiers that are completely forbidden as references. */
const DENIED_IDENTIFIERS = new Set([
  // Sandbox escapes
  'eval', 'Function', 'process', 'require', 'globalThis', 'global',
  'window', 'document', '__dirname', '__filename',
  // Worker globals — reachable in the browser-local executor (which runs card
  // code with new Function, not an isolate); block the self/importScripts path
  // to fetch/IndexedDB/postMessage with same-origin privileges.
  'self', 'importScripts', 'postMessage', 'WorkerGlobalScope', 'indexedDB',
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

/** Allowed keys on CARD_IMPL.effect (hook names + meta fields). */
const ALLOWED_EFFECT_KEYS = new Set<string>([
  ...cardEffectHooks,
  'id',
  'handHooks',
  'beforeEndGameScope',
  'beforeEndGameMandatory',
])

/** Allowed values inside listener.phases arrays. */
const ALLOWED_LISTENER_PHASES = new Set<string>(sandboxListenerPhases)

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
      const declaration = parent && ts.isVariableDeclaration(parent) && parent.name === node
        ? parent
        : undefined
      const declarationList = declaration?.parent
      const isTopLevelConstDeclaration = declarationList
        && ts.isVariableDeclarationList(declarationList)
        && (declarationList.flags & ts.NodeFlags.Const) !== 0
        && ts.isVariableStatement(declarationList.parent)
        && declarationList.parent.parent === sourceFile
      const isPropertyName = parent && (
        (ts.isPropertyAccessExpression(parent) && parent.name === node)
        || ((ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent)) && parent.name === node)
      )
      if (node.text === 'CARD_IMPL') {
        if (declaration && !isTopLevelConstDeclaration) {
          errors.push(`line ${getLine(node)}: CARD_IMPL must be declared as a top-level const`)
        } else if (!isTopLevelConstDeclaration && !isPropertyName) {
          errors.push(`line ${getLine(node)}: CARD_IMPL must not be referenced outside its declaration`)
        }
      }
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

  // Validate CARD_IMPL hook/listener whitelists
  validateCardImplHooksAndPhases(sourceFile, errors)

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

/**
 * Find the CARD_IMPL variable declaration in the source and validate:
 * 1. effect keys are in the cardEffectHooks whitelist (+ meta fields)
 * 2. listener actions and phases are in their sandbox whitelists
 */
function validateCardImplHooksAndPhases(
  sourceFile: ts.SourceFile,
  errors: string[],
): void {
  function getLine(node: ts.Node): number {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart())
    return line + 1
  }

  // Walk top-level statements to find `const CARD_IMPL = { ... }`
  for (const stmt of sourceFile.statements) {
    if (!ts.isVariableStatement(stmt)) continue
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || decl.name.text !== 'CARD_IMPL') continue
      if (!decl.initializer || !ts.isObjectLiteralExpression(decl.initializer)) {
        errors.push(`line ${getLine(decl)}: CARD_IMPL must be an object literal`)
        continue
      }
      validateCardImplObject(decl.initializer, errors, getLine)
    }
  }
}

function validateCardImplObject(
  obj: ts.ObjectLiteralExpression,
  errors: string[],
  getLine: (node: ts.Node) => number,
): void {
  for (const prop of obj.properties) {
    if (ts.isSpreadAssignment(prop)) {
      errors.push(`line ${getLine(prop)}: CARD_IMPL must not use spread properties`)
      continue
    }
    if (ts.isComputedPropertyName(prop.name)) {
      errors.push(`line ${getLine(prop)}: CARD_IMPL properties must not use computed names`)
      continue
    }
    const propName = ts.isIdentifier(prop.name)
      ? prop.name.text
      : ts.isStringLiteral(prop.name) ? prop.name.text : undefined
    if (propName === 'listeners' && !ts.isPropertyAssignment(prop)) {
      errors.push(`line ${getLine(prop)}: CARD_IMPL.listeners must use a property assignment`)
      continue
    }
    if (!ts.isPropertyAssignment(prop)) continue
    if (!propName) continue

    if (propName === 'effect' && ts.isObjectLiteralExpression(prop.initializer)) {
      validateEffectKeys(prop.initializer, errors, getLine)
    }

    if (propName === 'listeners') {
      if (!ts.isArrayLiteralExpression(prop.initializer)) {
        errors.push(`line ${getLine(prop.initializer)}: CARD_IMPL.listeners must be an array literal`)
      } else {
        validateListenersArray(prop.initializer, errors, getLine)
      }
    }
  }
}

function validateEffectKeys(
  effectObj: ts.ObjectLiteralExpression,
  errors: string[],
  getLine: (node: ts.Node) => number,
): void {
  for (const prop of effectObj.properties) {
    if (ts.isSpreadAssignment(prop)) continue
    if (!ts.isPropertyAssignment(prop) && !ts.isMethodDeclaration(prop) && !ts.isShorthandPropertyAssignment(prop)) continue
    const name = prop.name && ts.isIdentifier(prop.name)
      ? prop.name.text
      : prop.name && ts.isStringLiteral(prop.name) ? prop.name.text : undefined
    if (!name) continue
    if (!ALLOWED_EFFECT_KEYS.has(name)) {
      errors.push(`line ${getLine(prop)}: unknown effect hook '${name}' in CARD_IMPL.effect`)
    }
  }
}

function validateListenersArray(
  arr: ts.ArrayLiteralExpression,
  errors: string[],
  getLine: (node: ts.Node) => number,
): void {
  for (const element of arr.elements) {
    if (!ts.isObjectLiteralExpression(element)) {
      errors.push(`line ${getLine(element)}: CARD_IMPL listener entries must be object literals`)
      continue
    }
    for (const prop of element.properties) {
      if (ts.isSpreadAssignment(prop)) {
        errors.push(`line ${getLine(prop)}: CARD_IMPL listener entries must not use spread properties`)
        continue
      }
      if (ts.isComputedPropertyName(prop.name)) {
        errors.push(`line ${getLine(prop)}: CARD_IMPL listener properties must not use computed names`)
        continue
      }
      const propName = ts.isIdentifier(prop.name)
        ? prop.name.text
        : ts.isStringLiteral(prop.name) ? prop.name.text : undefined
      if (propName === '__proto__') {
        errors.push(`line ${getLine(prop)}: CARD_IMPL listener properties must not set __proto__`)
        continue
      }
      if ((propName === 'actions' || propName === 'phases') && !ts.isPropertyAssignment(prop)) {
        errors.push(`line ${getLine(prop)}: listener ${propName} must use a property assignment`)
        continue
      }
      if (!ts.isPropertyAssignment(prop)) continue
      if (propName === 'actions') {
        if (!ts.isArrayLiteralExpression(prop.initializer)) {
          errors.push(`line ${getLine(prop.initializer)}: listener actions must be a string literal array`)
          continue
        }
        for (const actionElement of prop.initializer.elements) {
          if (!ts.isStringLiteral(actionElement)) {
            errors.push(`line ${getLine(actionElement)}: listener actions must contain only string literals`)
          } else if (!isSandboxListenerAction(actionElement.text)) {
            errors.push(`line ${getLine(actionElement)}: unknown listener action '${actionElement.text}' in CARD_IMPL.listeners`)
          }
        }
      }
      if (propName === 'phases' && ts.isArrayLiteralExpression(prop.initializer)) {
        for (const phaseElement of prop.initializer.elements) {
          if (!ts.isStringLiteral(phaseElement)) continue
          if (!ALLOWED_LISTENER_PHASES.has(phaseElement.text)) {
            errors.push(`line ${getLine(phaseElement)}: unknown listener phase '${phaseElement.text}' in CARD_IMPL.listeners`)
          }
        }
      }
    }
  }
}
