/** Invalid execution arguments reject one command through its normal checkpoint. */
export class InvalidActionContextError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidActionContextError'
  }
}
