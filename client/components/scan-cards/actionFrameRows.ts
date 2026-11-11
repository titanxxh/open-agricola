/** A horizontal band of the official action frame, in its own pixels: [source top, source bottom, target top, target bottom]. */
export type ActionFrameBand = readonly [number, number, number, number]

/** Where a row of the official frame lands on the face, in frame pixels; a row repeated in several bands lands in the last. */
export const actionFrameRow = (bands: readonly ActionFrameBand[], row: number) => {
  const band = [...bands].reverse().find(([top, bottom]) => top <= row && row <= bottom)
  if (!band) throw new Error(`action frame row ${row} is not in a band`)
  const [top, bottom, y, end] = band
  return y + ((row - top) * (end - y)) / (bottom - top)
}
