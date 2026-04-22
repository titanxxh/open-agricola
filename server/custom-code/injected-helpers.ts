/**
 * JavaScript source injected into the sandbox isolate before user code runs.
 *
 * These helper functions give custom card code access to common operations
 * (leaf node factories, card state reads, farm utilities) without importing
 * from the project module tree.
 *
 * IMPORTANT: Must be valid ES5-ish JavaScript — no arrow functions, no
 * const/let. The isolate may run in restricted mode.
 */
export const HELPERS_INJECTION_SOURCE = `
// --- gainLeaf / payLeaf — leaf node factories ---
function gainLeaf(cardId, resources) {
  return { type: 'leaf', actionId: 'gain', params: resources, sourceCard: cardId };
}

function payLeaf(opts) {
  return { type: 'leaf', actionId: 'pay-resources', params: opts.cost, sourceCard: opts.cardId };
}

// --- spaceHasPlayer — read-only predicate ---
function spaceHasPlayer(space, playerId) {
  if (!space || !Array.isArray(space.takenBy)) return false;
  return space.takenBy.some(function(ref) { return ref && ref.playerId === playerId; });
}

// --- positionKey — deterministic farm tile position hash ---
function positionKey(pos) {
  if (!pos) return '?,?';
  return String(pos.x) + ',' + String(pos.y);
}

// --- getMajorCardEffect — stub (sandbox has no access to major cards) ---
function getMajorCardEffect(_cardId) {
  return null;
}

// --- getCardStack / readCardExtraData — pure reads on cardStates ---
function getCardStack(player, cardId) {
  if (!player || !player.cardStates) return [];
  var s = player.cardStates[cardId];
  if (!s || !Array.isArray(s.stack)) return [];
  return s.stack.slice();
}

function readCardExtraData(player, cardId) {
  if (!player || !player.cardStates) return {};
  var s = player.cardStates[cardId];
  if (!s || !s.extraData) return {};
  var out = {};
  for (var k in s.extraData) {
    if (Object.prototype.hasOwnProperty.call(s.extraData, k)) {
      out[k] = s.extraData[k];
    }
  }
  return out;
}
`
