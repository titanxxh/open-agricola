/**
 * Transpile a Workshop Card Source module to JavaScript. The server stores the
 * output as validation evidence and never runs it (ADR 0052).
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
