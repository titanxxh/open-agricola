export const stabilizeRandomHands = (
  players: { minorHand: string[]; occupationHand: string[] }[],
): void => {
  for (const player of players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }
}
