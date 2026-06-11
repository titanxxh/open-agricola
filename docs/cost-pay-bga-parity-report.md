# BGA/OA Cost-Pay Parity Report

BGA covered compute-cost cards: 39
Compared scenarios: 58
Compared card-purchase scenarios: 16
Compared construct scenarios: 18
Compared renovation scenarios: 15
Compared fencing scenarios: 6
Compared stables scenarios: 3
Differences: 1
Payment differences: 1
Source-only differences: 0
Report-only artifacts: 0

## combo card-purchase basket fixed price plus stone and wood modifiers

Kind: card-purchase
Difference type: payment-diff

BGA:
```json
[
  {
    "resources": {
      "reed": 1,
      "stone": 1
    },
    "sources": [
      "C95_BasketWeaver",
      "E109_BraidMaker"
    ]
  },
  {
    "resources": {
      "reed": 1,
      "stone": 1
    },
    "sources": [
      "C95_BasketWeaver"
    ]
  },
  {
    "resources": {
      "reed": 1,
      "stone": 1
    },
    "sources": [
      "E109_BraidMaker"
    ]
  },
  {
    "resources": {
      "reed": 1
    },
    "sources": [
      "A143_Stonecutter",
      "C95_BasketWeaver",
      "E109_BraidMaker"
    ]
  },
  {
    "resources": {
      "reed": 1
    },
    "sources": [
      "A143_Stonecutter",
      "C95_BasketWeaver"
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
  },
  {
    "resources": {
      "reed": 2,
      "stone": 1,
      "food": 1
    },
    "sources": [
      "A143_Stonecutter",
      "D117_WoodExpert"
    ]
  },
  {
    "resources": {
      "reed": 2,
      "stone": 2,
      "food": 1
    },
    "sources": [
      "D117_WoodExpert"
    ]
  },
  {
    "resources": {
      "wood": 2,
      "reed": 2,
      "stone": 1
    },
    "sources": [
      "A143_Stonecutter"
    ]
  },
  {
    "resources": {
      "wood": 2,
      "reed": 2,
      "stone": 2
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
      "stone": 1
    },
    "sources": [
      "C95_BasketWeaver"
    ]
  },
  {
    "resources": {
      "reed": 1
    },
    "sources": [
      "A143_Stonecutter",
      "C95_BasketWeaver"
    ]
  },
  {
    "resources": {
      "reed": 2,
      "stone": 1,
      "food": 1
    },
    "sources": [
      "A143_Stonecutter",
      "D117_WoodExpert"
    ]
  },
  {
    "resources": {
      "reed": 2,
      "stone": 2,
      "food": 1
    },
    "sources": [
      "D117_WoodExpert"
    ]
  },
  {
    "resources": {
      "wood": 2,
      "reed": 2,
      "stone": 1
    },
    "sources": [
      "A143_Stonecutter"
    ]
  },
  {
    "resources": {
      "wood": 2,
      "reed": 2,
      "stone": 2
    },
    "sources": []
  }
]
```

