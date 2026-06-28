# BGA/OA Cost-Pay Parity Report

BGA covered compute-cost cards: 39
Compared scenarios: 58
Compared card-purchase scenarios: 16
Compared construct scenarios: 18
Compared renovation scenarios: 15
Compared fencing scenarios: 6
Compared stables scenarios: 3
Differences: 4
Payment differences: 4
Source-only differences: 0
Accepted differences: 4
Unresolved differences: 0
Report-only artifacts: 0

## Accepted Differences

### E123 card-purchase top resource choices

Kind: card-purchase
Paying for: card-purchase generic major-cost fixture {wood:2, clay:2, reed:2, stone:2}
Difference type: payment-diff
Accepted reason: Accepted: E123 top-k payment choices are stateful because after-pay consumes the selected count from the card stack; OA keeps the full stateful choice set instead of pruning by resources only.

BGA:
```json
[
  {
    "resources": {
      "wood": 1,
      "reed": 1
    },
    "sources": [
      "E123_ResourceHoarder"
    ]
  }
]
```

OA:
```json
[
  {
    "resources": {
      "wood": 1,
      "clay": 1,
      "reed": 1,
      "stone": 1
    },
    "sources": [
      "E123_ResourceHoarder"
    ]
  },
  {
    "resources": {
      "wood": 1,
      "clay": 1,
      "reed": 1,
      "stone": 2
    },
    "sources": [
      "E123_ResourceHoarder"
    ]
  },
  {
    "resources": {
      "wood": 1,
      "clay": 1,
      "reed": 2,
      "stone": 2
    },
    "sources": [
      "E123_ResourceHoarder"
    ]
  },
  {
    "resources": {
      "wood": 1,
      "reed": 1,
      "stone": 1
    },
    "sources": [
      "E123_ResourceHoarder"
    ]
  },
  {
    "resources": {
      "wood": 1,
      "reed": 1
    },
    "sources": [
      "E123_ResourceHoarder"
    ]
  },
  {
    "resources": {
      "wood": 2,
      "clay": 1,
      "reed": 2,
      "stone": 2
    },
    "sources": [
      "E123_ResourceHoarder"
    ]
  },
  {
    "resources": {
      "wood": 2,
      "clay": 2,
      "reed": 2,
      "stone": 2
    },
    "sources": []
  }
]
```

### combo card-purchase basket fixed price plus stone and wood modifiers

Kind: card-purchase
Paying for: card-purchase Major_Basket with fixture cost {wood:2, reed:2, stone:2}, actionCard=C095_BasketWeaver
Difference type: payment-diff
Accepted reason: Accepted: the payable resources are equivalent; OA collapses equivalent fixed-price source-attribution rows that have no distinct payment consequence.

BGA:
```json
[
  {
    "resources": {
      "reed": 1
    },
    "sources": [
      "A143_Stonecutter",
      "C095_BasketWeaver",
      "E109_BraidMaker"
    ]
  },
  {
    "resources": {
      "reed": 1
    },
    "sources": [
      "A143_Stonecutter",
      "C095_BasketWeaver"
    ]
  },
  {
    "resources": {
      "reed": 1
    },
    "sources": [
      "A143_Stonecutter",
      "E109_BraidMaker"
    ]
  }
]
```

OA:
```json
[
  {
    "resources": {
      "reed": 1
    },
    "sources": [
      "A143_Stonecutter",
      "C095_BasketWeaver"
    ]
  }
]
```

### E123 construct top resource choices

Kind: construct
Paying for: construct clay room(s), units=1
Difference type: payment-diff
Accepted reason: Accepted: E123 use-top-k is stateful, so the no-use and use-resource paths may lead to different future card stack state even when one pays more resources.

BGA:
```json
[
  {
    "resources": {
      "clay": 4,
      "reed": 2
    },
    "sources": [
      "E123_ResourceHoarder"
    ]
  }
]
```

OA:
```json
[
  {
    "resources": {
      "clay": 4,
      "reed": 2
    },
    "sources": [
      "E123_ResourceHoarder"
    ]
  },
  {
    "resources": {
      "clay": 5,
      "reed": 2
    },
    "sources": []
  }
]
```

### E123 renovation top resource choices

Kind: renovation
Paying for: renovate-house wood -> stone, rooms=3
Difference type: payment-diff
Accepted reason: Accepted: BGA records a k=0 Resource Hoarder choice source for the no-use branch; OA treats k=0 as no card effect and omits the source.

BGA:
```json
[
  {
    "resources": {
      "reed": 1,
      "stone": 3
    },
    "sources": [
      "E123_ResourceHoarder"
    ]
  },
  {
    "resources": {
      "reed": 1,
      "stone": 3
    },
    "sources": []
  }
]
```

OA:
```json
[
  {
    "resources": {
      "reed": 1,
      "stone": 3
    },
    "sources": []
  }
]
```

## Unresolved Differences

No unresolved differences.

