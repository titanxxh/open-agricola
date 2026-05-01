/**
 * Transpile validated TypeScript card code to JavaScript.
 *
 * The AST validator (ast-validator.ts) must pass BEFORE calling.
 */
import ts from 'typescript'

export function compileCardCode(source: string): string {
  const result = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      strict: false,
      esModuleInterop: true,
      removeComments: true,
    },
  })
  return result.outputText
}
