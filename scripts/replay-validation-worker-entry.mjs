// Workers inherit the image's native TypeScript preload; development falls back to tsx.
if (!globalThis[Symbol.for('open-agricola.typescript-runtime')]) {
  const { register } = await import('tsx/esm/api')
  register()
}
await import('./replay-validation-worker.ts')
