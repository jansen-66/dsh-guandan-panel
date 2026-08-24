(() => {
  // guandan/src/interfaces/event-bus.js
  var EventBus = class {
    constructor() {
      this._listeners = /* @__PURE__ */ new Map();
    }
    /**
     * 订阅事件
     * @param {string} event - 事件名
     * @param {Function} callback - (data) => void
     */
    on(event, callback) {
      if (!this._listeners.has(event)) {
        this._listeners.set(event, []);
      }
      this._listeners.get(event).push(callback);
    }
    /**
     * 取消订阅
     * @param {string} event
     * @param {Function} callback
     */
    off(event, callback) {
      const listeners = this._listeners.get(event);
      if (listeners) {
        const idx = listeners.indexOf(callback);
        if (idx !== -1) listeners.splice(idx, 1);
      }
    }
    /**
     * 移除某事件的所有监听器
     * @param {string} event
     */
    removeAllListeners(event) {
      this._listeners.delete(event);
    }
    /**
     * 广播事件
     * @param {string} event
     * @param {*} data
     */
    emit(event, data) {
      const listeners = this._listeners.get(event);
      if (listeners) {
        for (const cb of [...listeners]) {
          try {
            cb(data);
          } catch (e) {
            console.error(`EventBus emit error [${event}]:`, e);
          }
        }
      }
    }
  };

  // guandan/src/game-engine/card.js
  var VALUE_TO_DISPLAY = {
    3: "3",
    4: "4",
    5: "5",
    6: "6",
    7: "7",
    8: "8",
    9: "9",
    10: "10",
    11: "J",
    12: "Q",
    13: "K",
    14: "A",
    15: "\u7EA7",
    16: "\u5C0F\u738B",
    17: "\u5927\u738B"
  };
  var SUIT_HEART = "HEART";
  var SUIT_SYMBOL = {
    "CLUB": "\u2663",
    "HEART": "\u2665",
    "DIAMOND": "\u2666",
    "SPADE": "\u2660",
    "JOKER": ""
  };
  var SUIT_COLOR = {
    "CLUB": "black",
    "HEART": "red",
    "DIAMOND": "red",
    "SPADE": "black",
    "JOKER": "joker"
  };
  var BOMB_SIZE_SCALE = 100;
  var FLUSH_BASE = 550;
  var FOUR_JOKERS_VALUE = 1e4;
  var STRAIGHT_OFFSET_THRESHOLD = 8;
  var STRAIGHT_OFFSET = 4;
  var THREE_PAIRS_OFFSET_THRESHOLD = 9;
  var THREE_PAIRS_OFFSET = 2;
  var TWO_TRIPLES_OFFSET_THRESHOLD = 10;
  var TWO_TRIPLES_OFFSET = 1;
  var POS_NAMES = {
    0: "\u6211",
    1: "\u4E0B\u5BB6",
    2: "\u961F\u53CB",
    3: "\u4E0A\u5BB6"
  };
  function isWildCard(card) {
    return card.suit === SUIT_HEART && card.level_value === 15;
  }
  function sortCards(cards) {
    return [...cards].sort((a, b) => {
      const lvA = a.level_value ?? a.value;
      const lvB = b.level_value ?? b.value;
      return lvB - lvA;
    });
  }
  function sortCardsAsc(cards) {
    return [...cards].sort((a, b) => {
      const lvA = a.level_value ?? a.value;
      const lvB = b.level_value ?? b.value;
      return lvA - lvB;
    });
  }
  function getLevelValue(card) {
    return card.level_value ?? card.value;
  }
  function cloneHand(hand) {
    return hand.map((c) => ({ ...c }));
  }
  function isSubset(subset, superset) {
    const key = (c) => `${c.value},${c.suit}`;
    const subCount = {};
    const superCount = {};
    for (const c of subset) {
      subCount[key(c)] = (subCount[key(c)] || 0) + 1;
    }
    for (const c of superset) {
      superCount[key(c)] = (superCount[key(c)] || 0) + 1;
    }
    for (const k in subCount) {
      if ((superCount[k] || 0) < subCount[k]) return false;
    }
    return true;
  }
  function removeCards(hand, cardsToRemove) {
    const removed = /* @__PURE__ */ new Set();
    for (const target of cardsToRemove) {
      for (let i = 0; i < hand.length; i++) {
        if (!removed.has(i) && hand[i].value === target.value && hand[i].suit === target.suit) {
          removed.add(i);
          break;
        }
      }
    }
    return hand.filter((_, i) => !removed.has(i));
  }

  // guandan/src/game-engine/engine.js
  function getWildCards(hand) {
    const wilds = hand.filter(isWildCard);
    const nonWild = hand.filter((c) => !isWildCard(c));
    return { nonWild, wilds };
  }
  function applyOffset(mainValue, threshold, offset) {
    return mainValue > threshold ? mainValue + offset : mainValue;
  }
  function calcMainValue(cardType, cards) {
    if (!cards || cards.length === 0) return 0;
    const ctype = cardType.toUpperCase();
    const getLevelValue2 = (c) => c.level_value || c.value;
    if (ctype === "FOUR_JOKERS") return FOUR_JOKERS_VALUE;
    if (ctype === "FLUSH_STRAIGHT") {
      const wildCards = cards.filter((c) => isWildCard(c));
      if (wildCards.length > 0) {
        const nonWild = cards.filter((c) => !isWildCard(c));
        if (nonWild.length > 0) {
          const nonWildVals = nonWild.map((c) => c.value);
          let effectiveMin;
          if (nonWildVals.includes(14)) {
            effectiveMin = nonWildVals.some((v) => v <= 5) ? 1 : 10;
          } else {
            effectiveMin = Math.min(...nonWildVals);
          }
          return FLUSH_BASE + effectiveMin;
        }
      }
      const values = [...cards].sort((a, b) => a.value - b.value).map((c) => c.value);
      return FLUSH_BASE + values[0];
    }
    if (ctype === "BOMB") {
      const size = cards.length;
      const lv = getLevelValue2(cards[0]);
      return size * BOMB_SIZE_SCALE + lv;
    }
    if (ctype === "STRAIGHT") {
      const wildCards = cards.filter((c) => isWildCard(c));
      if (wildCards.length > 0) {
        const nonWild = cards.filter((c) => !isWildCard(c));
        if (nonWild.length > 0) {
          const nonWildVals = nonWild.map((c) => c.value);
          let effectiveMin;
          if (nonWildVals.includes(14)) {
            effectiveMin = nonWildVals.some((v) => v <= 5) ? 1 : 10;
          } else {
            effectiveMin = Math.min(...nonWildVals);
          }
          return applyOffset(effectiveMin, STRAIGHT_OFFSET_THRESHOLD, STRAIGHT_OFFSET);
        }
      }
      const values = [...cards].sort((a, b) => a.value - b.value).map((c) => c.value);
      if (values.length === 5 && values.includes(2) && values.includes(3) && values.includes(4) && values.includes(5) && values.includes(14)) {
        return applyOffset(1, STRAIGHT_OFFSET_THRESHOLD, STRAIGHT_OFFSET);
      }
      return applyOffset(values[0], STRAIGHT_OFFSET_THRESHOLD, STRAIGHT_OFFSET);
    }
    if (ctype === "THREE_PAIRS") {
      const wildCards = cards.filter((c) => isWildCard(c));
      if (wildCards.length > 0) {
        const nonWild = cards.filter((c) => !isWildCard(c));
        const nwCount = {};
        for (const c of nonWild) nwCount[c.value] = (nwCount[c.value] || 0) + 1;
        const wc = wildCards.length;
        let effectiveStart = 0;
        for (let start = 2; start <= 12; start++) {
          let needed = 0;
          for (let v = start; v < start + 3; v++) {
            const existing = nwCount[v] || 0;
            if (existing < 2) needed += 2 - existing;
          }
          if (needed <= wc) {
            effectiveStart = start;
            break;
          }
        }
        if (effectiveStart === 0) {
          let needed = 0;
          for (const v of [14, 2, 3]) {
            const existing = nwCount[v] || 0;
            if (existing < 2) needed += 2 - existing;
          }
          if (needed <= wc) effectiveStart = 1;
        }
        if (effectiveStart > 0) {
          return applyOffset(effectiveStart, THREE_PAIRS_OFFSET_THRESHOLD, THREE_PAIRS_OFFSET);
        }
      }
      const values = [...cards].sort((a, b) => a.value - b.value).map((c) => c.value);
      if (values.length === 6 && values.includes(2) && values.includes(3) && values.includes(14)) {
        return applyOffset(1, THREE_PAIRS_OFFSET_THRESHOLD, THREE_PAIRS_OFFSET);
      }
      return applyOffset(values[0], THREE_PAIRS_OFFSET_THRESHOLD, THREE_PAIRS_OFFSET);
    }
    if (ctype === "TWO_TRIPLES") {
      const values = [...cards].sort((a, b) => a.value - b.value).map((c) => c.value);
      if (values.length === 6 && values.includes(2) && values.includes(14)) {
        return applyOffset(1, TWO_TRIPLES_OFFSET_THRESHOLD, TWO_TRIPLES_OFFSET);
      }
      return applyOffset(values[0], TWO_TRIPLES_OFFSET_THRESHOLD, TWO_TRIPLES_OFFSET);
    }
    if (ctype === "TRIPLE_WITH_PAIR") {
      const count = {};
      for (const c of cards) {
        const v = getLevelValue2(c);
        count[v] = (count[v] || 0) + 1;
      }
      for (const v in count) {
        if (count[v] >= 3) return Number(v);
      }
      return Math.max(...cards.map((c) => getLevelValue2(c)));
    }
    return Math.max(...cards.map((c) => getLevelValue2(c)));
  }
  function _hasStraight(hand) {
    const eligible = [];
    for (const card of hand) {
      if (card.suit === "JOKER") continue;
      eligible.push(card.value);
    }
    if (eligible.length < 5) return false;
    const unique = [...new Set(eligible)].sort((a, b) => a - b);
    let consecutive = 1;
    for (let i = 1; i < unique.length; i++) {
      if (unique[i] === unique[i - 1] + 1) {
        consecutive++;
        if (consecutive >= 5) return true;
      } else {
        consecutive = 1;
      }
    }
    return unique.includes(14) && unique.includes(2) && unique.includes(3) && unique.includes(4) && unique.includes(5);
  }
  function _hasFlushStraight(hand) {
    const bySuit = {};
    for (const card of hand) {
      if (card.suit && card.suit !== "JOKER") {
        if (!bySuit[card.suit]) bySuit[card.suit] = [];
        if (card.value < 16) bySuit[card.suit].push(card.value);
      }
    }
    for (const suit in bySuit) {
      const values = [...new Set(bySuit[suit])].sort((a, b) => a - b);
      let consecutive = 1;
      for (let i = 1; i < values.length; i++) {
        if (values[i] === values[i - 1] + 1) {
          consecutive++;
          if (consecutive >= 5) return true;
        } else {
          consecutive = 1;
        }
      }
      if (values.includes(14) && values.includes(2) && values.includes(3) && values.includes(4) && values.includes(5)) return true;
    }
    return false;
  }
  function _hasConsecutivePairs(hand, minGroups) {
    const count = {};
    for (const c of hand) count[c.value] = (count[c.value] || 0) + 1;
    const pairs = [...Object.entries(count)].filter(([, v]) => v >= 2).map(([k]) => Number(k)).sort((a, b) => a - b);
    if (pairs.length < minGroups) return false;
    let consecutive = 1;
    for (let i = 1; i < pairs.length; i++) {
      if (pairs[i] === pairs[i - 1] + 1) {
        consecutive++;
        if (consecutive >= minGroups) return true;
      } else {
        consecutive = 1;
      }
    }
    return false;
  }
  function _hasTripleWithPair(hand) {
    const count = {};
    for (const c of hand) count[c.value] = (count[c.value] || 0) + 1;
    const tripleValues = Object.entries(count).filter(([, v]) => v >= 3).map(([k]) => Number(k));
    const pairValues = Object.entries(count).filter(([, v]) => v >= 2).map(([k]) => Number(k));
    for (const tv of tripleValues) {
      for (const pv of pairValues) {
        if (tv !== pv) return true;
      }
    }
    return false;
  }
  function _calculateStructureScore(hand) {
    let score = 0;
    if (_hasStraight(hand)) score += 5;
    if (_hasFlushStraight(hand)) score += 8;
    if (_hasConsecutivePairs(hand, 3)) score += 6;
    else if (_hasConsecutivePairs(hand, 2)) score += 2;
    if (_hasTripleWithPair(hand)) score += 4;
    return Math.min(score, 30);
  }
  function evaluateHand(hand) {
    let score = 0;
    const breakdown = {};
    const wildCount = hand.filter(isWildCard).length;
    const isWild = (card) => isWildCard(card);
    for (const card of hand) {
      if (isWild(card)) {
        score += 3;
        breakdown["WILD"] = (breakdown["WILD"] || 0) + 3;
        continue;
      }
      if (card.suit === "JOKER") {
        const lv2 = card.rank === "BIG_JOKER" ? 17 : 16;
        if (lv2 === 17) {
          score += 5;
          breakdown["BIG_JOKER"] = 5;
        } else {
          score += 4;
          breakdown["SMALL_JOKER"] = 4;
        }
        continue;
      }
      if (card.level_value === 15) {
        score += 4;
        breakdown["LEVEL"] = (breakdown["LEVEL"] || 0) + 4;
        continue;
      }
      const lv = getLevelValue(card);
      if (lv === 14) {
        score += 3;
        breakdown["A"] = (breakdown["A"] || 0) + 3;
      } else if (lv === 13) {
        score += 2.5;
        breakdown["K"] = (breakdown["K"] || 0) + 2.5;
      } else if (lv === 12) {
        score += 2;
        breakdown["Q"] = (breakdown["Q"] || 0) + 2;
      } else if (lv === 11) {
        score += 1.5;
        breakdown["J"] = (breakdown["J"] || 0) + 1.5;
      }
    }
    const count = {};
    for (const c of hand) count[c.value] = (count[c.value] || 0) + 1;
    for (const val in count) {
      const n = count[val];
      if (n >= 4) {
        const actualNum = n + Math.min(wildCount, Math.max(0, 4 - n));
        if (actualNum === 8) score += 20;
        else if (actualNum === 7) score += 18;
        else if (actualNum === 6) score += 15;
        else if (actualNum === 5) score += 12;
        else if (actualNum === 4) score += 8;
      }
    }
    score += wildCount * 3;
    const structureScore = _calculateStructureScore(hand);
    score += structureScore;
    if (structureScore > 0) breakdown["structure"] = structureScore;
    let singletonCount = 0;
    for (const v in count) if (count[v] === 1) singletonCount++;
    const effectiveSingleton = Math.max(singletonCount - wildCount * 2, 0);
    score += effectiveSingleton * -2;
    return {
      total: Math.max(Math.round(score), -50),
      breakdown,
      structureScore
    };
  }
  function findAllBombs(hand) {
    const bombs = [];
    const count = {};
    for (const c of hand) count[c.value] = (count[c.value] || 0) + 1;
    for (const val in count) {
      const n = count[val];
      if (n >= 4) {
        const bombCards = hand.filter((c) => c.value == val).slice(0, n);
        const lv = getLevelValue(bombCards[0]);
        bombs.push({
          type: "BOMB",
          cards: bombCards,
          main_value: n * BOMB_SIZE_SCALE + lv,
          card_count: n,
          is_bomb: true,
          bomb_size: n
        });
      }
    }
    return bombs;
  }
  function findAllFourJokers(hand) {
    const bigJokers = hand.filter((c) => c.suit === "JOKER" && c.rank === "BIG_JOKER");
    const smallJokers = hand.filter((c) => c.suit === "JOKER" && c.rank === "SMALL_JOKER");
    if (bigJokers.length >= 2 && smallJokers.length >= 2) {
      return [{
        type: "FOUR_JOKERS",
        cards: [...bigJokers.slice(0, 2), ...smallJokers.slice(0, 2)],
        main_value: FOUR_JOKERS_VALUE,
        card_count: 4,
        is_bomb: true,
        bomb_size: 4
      }];
    }
    return [];
  }
  function findAllSingles(hand) {
    const seen = /* @__PURE__ */ new Set();
    const singles = [];
    const sorted = sortCards([...hand]);
    for (const card of sorted) {
      const key = `${card.value},${card.suit}`;
      if (!seen.has(key)) {
        seen.add(key);
        singles.push({
          type: "SINGLE",
          cards: [card],
          main_value: getLevelValue(card),
          card_count: 1,
          is_bomb: false
        });
      }
    }
    return singles;
  }
  function findAllPairs(hand) {
    const pairs = [];
    const count = {};
    for (const c of hand) count[c.value] = (count[c.value] || 0) + 1;
    const values = Object.keys(count).map(Number).filter((v) => count[v] >= 2);
    values.sort((a, b) => {
      const lvA = a === 15 ? 15 : a;
      const lvB = b === 15 ? 15 : b;
      return lvA - lvB;
    });
    for (const val of values) {
      const pairCards = hand.filter((c) => c.value === val).slice(0, 2);
      pairs.push({
        type: "PAIR",
        cards: pairCards,
        main_value: getLevelValue(pairCards[0]),
        card_count: 2,
        is_bomb: false
      });
    }
    return pairs;
  }
  function findAllTriples(hand) {
    const triples = [];
    const count = {};
    for (const c of hand) count[c.value] = (count[c.value] || 0) + 1;
    const values = Object.keys(count).map(Number).filter((v) => count[v] >= 3);
    values.sort((a, b) => a - b);
    for (const val of values) {
      const tripleCards = hand.filter((c) => c.value === val).slice(0, 3);
      triples.push({
        type: "TRIPLE",
        cards: tripleCards,
        main_value: getLevelValue(tripleCards[0]),
        card_count: 3,
        is_bomb: false
      });
    }
    return triples;
  }
  function findAllStraights(hand) {
    const straights = [];
    const { nonWild } = getWildCards(hand);
    const bySuit = {};
    for (const card of nonWild) {
      if (card.suit === "JOKER") continue;
      if (!bySuit[card.suit]) bySuit[card.suit] = [];
      bySuit[card.suit].push(card.value);
    }
    for (const suit in bySuit) {
      const values = [...new Set(bySuit[suit])].sort((a, b) => a - b);
      if (values.length < 5) continue;
      let i = 0;
      while (i < values.length) {
        let j = i;
        while (j + 1 < values.length && values[j + 1] === values[j] + 1) j++;
        const len = j - i + 1;
        if (len >= 5) {
          for (let start = i; start <= j - 4; start++) {
            const segment = values.slice(start, start + 5);
            const cards = [];
            for (const v of segment) {
              const found = hand.find((c) => c.suit === suit && c.value === v && !isWildCard(c));
              if (found) cards.push(found);
            }
            if (cards.length === 5) {
              const rawMv = segment[0];
              straights.push({
                type: "STRAIGHT",
                cards,
                main_value: applyOffset(rawMv, STRAIGHT_OFFSET_THRESHOLD, STRAIGHT_OFFSET),
                card_count: 5,
                is_bomb: false
              });
            }
          }
        }
        i = j + 1;
      }
    }
    const a2345 = [];
    for (const suit in bySuit) {
      if ([14, 2, 3, 4, 5].every((v) => bySuit[suit].includes(v))) {
        const cards = [];
        for (const v of [14, 2, 3, 4, 5]) {
          const found = hand.find((c) => c.suit === suit && c.value === v && !isWildCard(c));
          if (found) cards.push(found);
        }
        if (cards.length === 5) {
          a2345.push({
            type: "STRAIGHT",
            cards,
            main_value: applyOffset(1, STRAIGHT_OFFSET_THRESHOLD, STRAIGHT_OFFSET),
            card_count: 5,
            is_bomb: false
          });
        }
      }
    }
    return [...straights, ...a2345];
  }
  function findAllFlushes(hand) {
    const flushes = [];
    const { nonWild } = getWildCards(hand);
    const bySuit = {};
    for (const card of nonWild) {
      if (card.suit === "JOKER") continue;
      if (!bySuit[card.suit]) bySuit[card.suit] = [];
      bySuit[card.suit].push(card);
    }
    for (const suit in bySuit) {
      const suitCards = bySuit[suit].sort((a, b) => a.value - b.value);
      const values = suitCards.map((c) => c.value);
      let i = 0;
      while (i < values.length) {
        let j = i;
        while (j + 1 < values.length && values[j + 1] === values[j] + 1) j++;
        const len = j - i + 1;
        if (len >= 5) {
          for (let start = i; start <= j - 4; start++) {
            const flushValues = values.slice(start, start + 5);
            const flushCards = [];
            for (const fv of flushValues) {
              const found = suitCards.find((c) => c.value === fv);
              if (found) flushCards.push(found);
            }
            if (flushCards.length === 5) {
              flushes.push({
                type: "FLUSH_STRAIGHT",
                cards: flushCards,
                main_value: FLUSH_BASE + flushValues[0],
                card_count: 5,
                is_bomb: true
              });
            }
          }
        }
        i = j + 1;
      }
    }
    for (const suit in bySuit) {
      const vals = bySuit[suit].map((c) => c.value);
      if ([14, 2, 3, 4, 5].every((v) => vals.includes(v))) {
        const cards = [];
        for (const v of [14, 2, 3, 4, 5]) {
          const found = hand.find((c) => c.suit === suit && c.value === v && !isWildCard(c));
          if (found) cards.push(found);
        }
        if (cards.length === 5) {
          flushes.push({
            type: "FLUSH_STRAIGHT",
            cards,
            main_value: FLUSH_BASE + 1,
            card_count: 5,
            is_bomb: true
          });
        }
      }
    }
    return flushes;
  }
  function findAllConsecutiveTriples(hand) {
    const results = [];
    const count = {};
    for (const c of hand) count[c.value] = (count[c.value] || 0) + 1;
    const pairValues = Object.keys(count).map(Number).filter((v) => count[v] >= 2).sort((a, b) => a - b);
    let i = 0;
    while (i < pairValues.length - 2) {
      if (pairValues[i + 1] === pairValues[i] + 1 && pairValues[i + 2] === pairValues[i] + 2) {
        const cards = [];
        for (const v of pairValues.slice(i, i + 3)) {
          cards.push(...hand.filter((c) => c.value === v).slice(0, 2));
        }
        const rawMv = pairValues[i];
        results.push({
          type: "THREE_PAIRS",
          cards,
          main_value: applyOffset(rawMv, THREE_PAIRS_OFFSET_THRESHOLD, THREE_PAIRS_OFFSET),
          card_count: 6,
          is_bomb: false
        });
        i++;
      } else {
        i++;
      }
    }
    if ((count[14] || 0) >= 2 && (count[2] || 0) >= 2 && (count[3] || 0) >= 2) {
      const cards = [
        ...hand.filter((c) => c.value === 14).slice(0, 2),
        ...hand.filter((c) => c.value === 2).slice(0, 2),
        ...hand.filter((c) => c.value === 3).slice(0, 2)
      ];
      results.push({
        type: "THREE_PAIRS",
        cards,
        main_value: applyOffset(1, THREE_PAIRS_OFFSET_THRESHOLD, THREE_PAIRS_OFFSET),
        card_count: 6,
        is_bomb: false
      });
    }
    const { nonWild, wilds } = getWildCards(hand);
    if (wilds.length > 0) {
      const nwCount = {};
      for (const c of nonWild) nwCount[c.value] = (nwCount[c.value] || 0) + 1;
      for (let start = 2; start <= 12; start++) {
        let needed = 0;
        for (let v = start; v < start + 3; v++) {
          const existing = nwCount[v] || 0;
          if (existing < 2) needed += 2 - existing;
        }
        if (needed <= wilds.length) {
          const cards = [];
          const remWilds = [...wilds];
          for (let v = start; v < start + 3; v++) {
            const existingCards = nonWild.filter((c) => c.value === v).slice(0, 2);
            cards.push(...existingCards);
            const short = 2 - existingCards.length;
            cards.push(...remWilds.splice(0, short));
          }
          results.push({
            type: "THREE_PAIRS",
            cards,
            main_value: applyOffset(start, THREE_PAIRS_OFFSET_THRESHOLD, THREE_PAIRS_OFFSET),
            card_count: 6,
            is_bomb: false
          });
        }
      }
      {
        let needed = 0;
        for (const v of [14, 2, 3]) {
          const existing = nwCount[v] || 0;
          if (existing < 2) needed += 2 - existing;
        }
        if (needed <= wilds.length) {
          const cards = [];
          const remWilds = [...wilds];
          for (const v of [14, 2, 3]) {
            const existingCards = nonWild.filter((c) => c.value === v).slice(0, 2);
            cards.push(...existingCards);
            const short = 2 - existingCards.length;
            cards.push(...remWilds.splice(0, short));
          }
          results.push({
            type: "THREE_PAIRS",
            cards,
            main_value: applyOffset(1, THREE_PAIRS_OFFSET_THRESHOLD, THREE_PAIRS_OFFSET),
            card_count: 6,
            is_bomb: false
          });
        }
      }
    }
    const tripleValues = Object.keys(count).map(Number).filter((v) => count[v] >= 3).sort((a, b) => a - b);
    i = 0;
    while (i < tripleValues.length - 1) {
      if (tripleValues[i + 1] === tripleValues[i] + 1) {
        const cards = [];
        for (const v of tripleValues.slice(i, i + 2)) {
          cards.push(...hand.filter((c) => c.value === v).slice(0, 3));
        }
        const rawMv = tripleValues[i];
        results.push({
          type: "TWO_TRIPLES",
          cards,
          main_value: applyOffset(rawMv, TWO_TRIPLES_OFFSET_THRESHOLD, TWO_TRIPLES_OFFSET),
          card_count: 6,
          is_bomb: false
        });
        i++;
      } else {
        i++;
      }
    }
    if ((count[14] || 0) >= 3 && (count[2] || 0) >= 3) {
      const cards = [
        ...hand.filter((c) => c.value === 14).slice(0, 3),
        ...hand.filter((c) => c.value === 2).slice(0, 3)
      ];
      results.push({
        type: "TWO_TRIPLES",
        cards,
        main_value: applyOffset(1, TWO_TRIPLES_OFFSET_THRESHOLD, TWO_TRIPLES_OFFSET),
        card_count: 6,
        is_bomb: false
      });
    }
    return results;
  }
  function addWildCardCandidates(hand, lastPlay = null) {
    const { nonWild, wilds } = getWildCards(hand);
    const wildCount = wilds.length;
    if (wildCount === 0) return [];
    const nonJokerNonWild = nonWild.filter((c) => c.suit !== "JOKER");
    const candidates = [];
    const count = {};
    for (const c of nonJokerNonWild) count[c.value] = (count[c.value] || 0) + 1;
    const maxLv = (v) => {
      const cards = nonJokerNonWild.filter((c) => c.value === v);
      return cards.length > 0 ? getLevelValue(cards[0]) : v;
    };
    for (const val in count) {
      if (count[val] >= 1 && wildCount >= 1) {
        const singleCard = nonJokerNonWild.find((c) => c.value == val);
        const pairCards = [singleCard, wilds[0]];
        const lv = maxLv(val);
        if (!lastPlay || lv > (lastPlay.main_value || 0)) {
          candidates.push({
            type: "PAIR",
            cards: pairCards,
            main_value: lv,
            card_count: 2,
            is_bomb: false,
            uses_wild: true
          });
        }
      }
    }
    for (const val in count) {
      const valCards = nonJokerNonWild.filter((c) => c.value == val);
      if (count[val] >= 2 && wildCount >= 1) {
        const tripleCards = [...valCards.slice(0, 2), wilds[0]];
        const lv = maxLv(val);
        if (!lastPlay || lv > (lastPlay.main_value || 0)) {
          candidates.push({
            type: "TRIPLE",
            cards: tripleCards,
            main_value: lv,
            card_count: 3,
            is_bomb: false,
            uses_wild: true
          });
        }
      }
      if (count[val] >= 1 && wildCount >= 2) {
        const tripleCards = [...valCards.slice(0, 1), wilds[0], wilds[1]];
        const lv = maxLv(val);
        if (!lastPlay || lv > (lastPlay.main_value || 0)) {
          candidates.push({
            type: "TRIPLE",
            cards: tripleCards,
            main_value: lv,
            card_count: 3,
            is_bomb: false,
            uses_wild: true
          });
        }
      }
    }
    const bySuit = {};
    for (const card of nonJokerNonWild) {
      if (card.suit && card.suit !== "JOKER") {
        bySuit[card.suit] = bySuit[card.suit] || [];
        bySuit[card.suit].push(card.value);
      }
    }
    for (const suit in bySuit) {
      const values = [...new Set(bySuit[suit])].sort((a, b) => a - b);
      if (values.length < 3) continue;
      let i = 0;
      while (i < values.length) {
        let j = i;
        while (j + 1 < values.length && values[j + 1] === values[j] + 1) j++;
        const consecutiveLen = j - i + 1;
        if (consecutiveLen >= 3) {
          for (let start = i; start <= j - 3 + 2; start++) {
            let end = Math.min(start + 5, j + 1);
            if (end <= start + 2) continue;
            const straightValues = values.slice(start, end);
            const needed = 5 - straightValues.length;
            if (needed <= wildCount) {
              const straightCards = bySuit[suit].filter((v) => straightValues.includes(v)).slice(0, straightValues.length).map((v) => nonWild.find((c) => c.value === v));
              const allCards = [...straightCards, ...wilds.slice(0, needed)];
              const lv = straightValues[straightValues.length - 1];
              if (!lastPlay || lv > (lastPlay.main_value || 0)) {
                candidates.push({
                  type: "STRAIGHT",
                  cards: allCards,
                  main_value: lv,
                  card_count: 5,
                  is_bomb: false,
                  uses_wild: true
                });
              }
            }
          }
        }
        i = j + 1;
      }
    }
    return candidates;
  }
  function findTripleWithPair(hand) {
    const results = [];
    const triples = findAllTriples(hand);
    const pairs = findAllPairs(hand);
    for (const triple of triples) {
      const tripleValue = triple.main_value;
      for (const pair of pairs) {
        const pairValue = pair.main_value;
        if (tripleValue === pairValue) continue;
        results.push({
          cards: [...triple.cards, ...pair.cards],
          triple_main_value: tripleValue,
          pair_main_value: pairValue,
          main_value: tripleValue,
          pair_score: pairValue,
          type: "TRIPLE_WITH_PAIR",
          card_count: triple.cards.length + pair.cards.length,
          is_bomb: false
        });
      }
    }
    return results;
  }
  function generateBeatCandidates(hand, lastPlay) {
    const lastType = (lastPlay.type || "").toUpperCase();
    const lastValue = lastPlay.main_value || 0;
    const candidates = [];
    if (lastType === "SINGLE") {
      for (const single of findAllSingles(hand)) {
        if (single.main_value > lastValue) {
          candidates.push({ type: "SINGLE", cards: single.cards, main_value: single.main_value, card_count: 1, is_bomb: false });
        }
      }
    } else if (lastType === "PAIR") {
      for (const pair of findAllPairs(hand)) {
        if (pair.main_value > lastValue) {
          candidates.push({ type: "PAIR", cards: pair.cards, main_value: pair.main_value, card_count: 2, is_bomb: false });
        }
      }
    } else if (lastType === "TRIPLE") {
      for (const triple of findAllTriples(hand)) {
        if (triple.main_value > lastValue) {
          candidates.push({ type: "TRIPLE", cards: triple.cards, main_value: triple.main_value, card_count: 3, is_bomb: false });
        }
      }
    } else if (lastType === "STRAIGHT") {
      for (const straight of findAllStraights(hand)) {
        if (straight.main_value > lastValue) {
          candidates.push({ type: "STRAIGHT", cards: straight.cards, main_value: straight.main_value, card_count: straight.cards.length, is_bomb: false });
        }
      }
    } else if (lastType === "THREE_PAIRS") {
      for (const ct of findAllConsecutiveTriples(hand)) {
        if (ct.type === "THREE_PAIRS" && ct.main_value > lastValue) {
          candidates.push({ type: "THREE_PAIRS", cards: ct.cards, main_value: ct.main_value, card_count: ct.cards.length, is_bomb: false });
        }
      }
    } else if (lastType === "TWO_TRIPLES") {
      for (const ct of findAllConsecutiveTriples(hand)) {
        if (ct.type === "TWO_TRIPLES" && ct.main_value > lastValue) {
          candidates.push({ type: "TWO_TRIPLES", cards: ct.cards, main_value: ct.main_value, card_count: ct.cards.length, is_bomb: false });
        }
      }
    } else if (lastType === "TRIPLE_WITH_PAIR") {
      for (const triple of findAllTriples(hand)) {
        if (triple.main_value > lastValue) {
          const tripleVals = new Set(triple.cards.map((c) => c.value));
          for (const pair of findAllPairs(hand)) {
            const pairVals = new Set(pair.cards.map((c) => c.value));
            const hasOverlap = [...tripleVals].some((v) => pairVals.has(v));
            if (!hasOverlap) {
              candidates.push({
                type: "TRIPLE_WITH_PAIR",
                cards: [...triple.cards, ...pair.cards],
                main_value: triple.main_value,
                pair_score: pair.main_value,
                card_count: triple.cards.length + pair.cards.length,
                is_bomb: false
              });
            }
          }
        }
      }
    }
    if (!["FLUSH_STRAIGHT", "FOUR_JOKERS"].includes(lastType)) {
      for (const bomb of findAllBombs(hand)) {
        if (bomb.main_value > lastValue) {
          candidates.push({ type: "BOMB", cards: bomb.cards, main_value: bomb.main_value, card_count: bomb.card_count, is_bomb: true, bomb_size: bomb.bomb_size });
        }
      }
      for (const flush of findAllFlushes(hand)) {
        candidates.push({ type: "FLUSH_STRAIGHT", cards: flush.cards, main_value: flush.main_value, card_count: 5, is_bomb: true });
      }
      for (const fk of findAllFourJokers(hand)) {
        candidates.push({ type: "FOUR_JOKERS", cards: fk.cards, main_value: fk.main_value, card_count: 4, is_bomb: true });
      }
    }
    const wildCandidates = addWildCardCandidates(hand, lastPlay);
    for (const wc of wildCandidates) {
      if (wc.main_value > lastValue && wc.type.toUpperCase() === lastType) {
        candidates.push(wc);
      }
    }
    if (candidates.length === 0) return [];
    candidates.sort((a, b) => a.main_value - b.main_value);
    return candidates;
  }
  var EnhancedHandAnalyzer = class {
    constructor() {
    }
    /**
     * 评估手牌质量
     * @param {Array} hand 手牌数组
     * @returns {Object} 评估结果 { total, breakdown }
     */
    evaluateHand(hand) {
      let score = 0;
      const breakdown = {};
      for (const card of hand) {
        if (card.suit === "JOKER") {
          score += card.rank === "BIG_JOKER" ? 5 : 4;
          breakdown[card.rank] = (breakdown[card.rank] || 0) + (card.rank === "BIG_JOKER" ? 5 : 4);
          continue;
        }
        if (card.level_value === 15) {
          score += 4;
          continue;
        }
        const lv = getLevelValue(card);
        if (lv === 14) {
          score += 3;
          breakdown["A"] = (breakdown["A"] || 0) + 3;
        } else if (lv === 13) {
          score += 2.5;
          breakdown["K"] = (breakdown["K"] || 0) + 2.5;
        } else if (lv === 12) {
          score += 2;
          breakdown["Q"] = (breakdown["Q"] || 0) + 2;
        } else if (lv === 11) {
          score += 1.5;
          breakdown["J"] = (breakdown["J"] || 0) + 1.5;
        }
      }
      const count = {};
      for (const c of hand) count[c.value] = (count[c.value] || 0) + 1;
      for (const val in count) {
        const n = count[val];
        if (n >= 8) score += 20;
        else if (n >= 7) score += 18;
        else if (n >= 6) score += 15;
        else if (n >= 5) score += 12;
        else if (n >= 4) score += 8;
        else if (n >= 3) score += 2;
      }
      score = Math.min(score, 80);
      const structureScore = _calculateStructureScore(hand);
      score += structureScore;
      if (structureScore > 0) breakdown["structure"] = structureScore;
      let singletonCount = 0;
      for (const v in count) if (count[v] === 1) singletonCount++;
      const wildCount = hand.filter(isWildCard).length;
      const effectiveSingleton = Math.max(singletonCount - wildCount * 2, 0);
      score += effectiveSingleton * -2;
      return {
        total: Math.max(Math.round(score), -50),
        breakdown,
        structureScore
      };
    }
    /**
     * 生成所有可能的候选牌型（初始）
     * @param {Array} hand 当前手牌
     * @param {Object} lastPlay 上家出牌信息 (可选)
     * @returns {Promise<Array>} 候选牌型数组
     */
    async generateCandidates(hand, lastPlay = null) {
      if (lastPlay) {
        return generateBeatCandidates(hand, lastPlay);
      }
      const candidates = [];
      candidates.push(...findAllBombs(hand));
      candidates.push(...findAllFourJokers(hand));
      candidates.push(...findAllSingles(hand));
      candidates.push(...findAllPairs(hand));
      candidates.push(...findAllTriples(hand));
      candidates.push(...findAllStraights(hand));
      candidates.push(...findAllFlushes(hand));
      candidates.push(...findAllConsecutiveTriples(hand));
      candidates.push(...findTripleWithPair(hand));
      const wildCands = addWildCardCandidates(hand, null);
      candidates.push(...wildCands);
      candidates.sort((a, b) => {
        if (a.main_value !== b.main_value) return a.main_value - b.main_value;
        return (a.pair_score || 0) - (b.pair_score || 0);
      });
      return candidates;
    }
    /**
     * 获取当前局面下，在选定候选之后，剩下的牌能组成的候选
     * 与 Python hand_evaluator.py:373 一致：先精确匹配，未匹配时尝试拆 TRIPLE+PAIR
     * @param {Array} allCandidates
     * @param {Object} selected
     * @param {Array} hand
     * @returns {Array}
     */
    getRemainingCandidates(allCandidates, selected, hand) {
      const playCards = selected.cards || [];
      if (!playCards || playCards.length === 0) return allCandidates;
      for (let i = 0; i < allCandidates.length; i++) {
        const cand = allCandidates[i];
        const candCards = cand.cards || [];
        if (this._cardsMatchSubset(candCards, playCards)) {
          const removed = [...allCandidates.slice(0, i), ...allCandidates.slice(i + 1)];
          const totalRemainingCards = removed.reduce((s, c) => s + (c.cards?.length || 0), 0);
          const expectedRemaining = (hand?.length || 0) - playCards.length;
          if (totalRemainingCards === expectedRemaining) {
            return removed;
          }
        }
      }
      const pairCands = allCandidates.filter((c) => c.type === "PAIR");
      if (pairCands.length > 0) {
        const sortedPairs = [...pairCands].sort((a, b) => a.main_value - b.main_value);
        for (const pairCand of sortedPairs) {
          const pairCards = [...pairCand.cards || []];
          if (!this._cardsMatchSubset(pairCards, playCards)) continue;
          const remainingPlay = [...playCards];
          for (const pc of pairCards) {
            const idx = remainingPlay.findIndex(
              (c) => c.value === pc.value && c.suit === pc.suit
            );
            if (idx >= 0) remainingPlay.splice(idx, 1);
          }
          const rest = allCandidates.filter((c) => c !== pairCand);
          for (const tripleCand of rest) {
            if (tripleCand.type !== "TRIPLE") continue;
            const tripleCards = tripleCand.cards || [];
            if (!this._cardsMatchSubset(tripleCards, remainingPlay)) continue;
            const result = rest.filter((c) => c !== tripleCand);
            const totalRemainingCards = result.reduce((s, c) => s + (c.cards?.length || 0), 0);
            const expectedRemaining = (hand?.length || 0) - playCards.length;
            if (totalRemainingCards === expectedRemaining) {
              return result;
            }
          }
        }
      }
      return allCandidates;
    }
    /**
     * 模拟出一张牌被出的后的手牌
     * 与 Python enhanced_min_beat.py:453 一致：先匹配非JOKER，再匹配JOKER
     */
    applyPlay(hand, playedCards) {
      const remaining = [];
      const used = /* @__PURE__ */ new Set();
      const jokerCount = playedCards.filter((c) => c.suit === "JOKER").length;
      const nonJokerValues = playedCards.filter((c) => c.suit !== "JOKER").map((c) => c.value);
      const jokerIndices = [];
      const nonJokerIndices = [];
      for (let i = 0; i < hand.length; i++) {
        if (hand[i].suit === "JOKER") {
          jokerIndices.push(i);
        } else {
          nonJokerIndices.push(i);
        }
      }
      for (const v of nonJokerValues) {
        for (const i of nonJokerIndices) {
          if (!used.has(i) && hand[i].value === v) {
            used.add(i);
            break;
          }
        }
      }
      const usedNonJokerCount = [...used].filter((i) => nonJokerIndices.includes(i)).length;
      for (const j of jokerIndices) {
        if (used.size - usedNonJokerCount < jokerCount) {
          used.add(j);
        }
      }
      for (let i = 0; i < hand.length; i++) {
        if (!used.has(i)) {
          remaining.push(hand[i]);
        }
      }
      return remaining;
    }
    /**
     * 辅助：检查 subsetCards 是否为 superCards 的子集
     * 与 Python cache_manager._update_cache_after_play 匹配逻辑一致
     */
    _cardsMatchSubset(subsetCards, superCards) {
      if (subsetCards.length > superCards.length) return false;
      const remaining = [...superCards];
      for (const card of subsetCards) {
        const idx = remaining.findIndex(
          (c) => c.value === card.value && c.suit === card.suit
        );
        if (idx < 0) return false;
        remaining.splice(idx, 1);
      }
      return true;
    }
  };

  // guandan/src/ai-player/two-player-strategy.js
  var TwoPlayerStrategy = class {
    /**
     * @param {Object} opts
     * @param {Object} opts.parent   - EnhancedMinBeatStrategy 实例
     * @param {Function} opts.groupOther   - groupOther 函数
     * @param {Function} opts.calcMainValue - calcMainValue 函数
     */
    constructor({ parent, groupOther: groupOther2, calcMainValue: calcMainValue2 }) {
      this.p = parent;
      this._groupOther = groupOther2;
      this._calcMainValue = calcMainValue2;
    }
    // ===== 快捷访问父策略资源（保持 getter 确保总是读到最新值） =====
    get _analyzer() {
      return this.p.analyzer;
    }
    get _tracker() {
      return this.p.tracker;
    }
    get _lastHand() {
      return this.p._lastHand;
    }
    _buildFromHand(h) {
      return this.p._buildCandidatesFromHand(h);
    }
    _filterBeat(c, lp, tm) {
      return this.p._filterBeatCandidates(c, lp, tm, { quiet: true });
    }
    _fallback(h) {
      return this.p._fallbackPlaySingle(h);
    }
    get _groupsCache() {
      return this.p._groupsCache;
    }
    get _myName() {
      return `[${this.p.position}#]`;
    }
    // ===== 1v1 决策入口 =====
    /**
     * decide() 中的 1v1 分支代理
     * @param {Array} myHand      - 己方当前手牌
     * @param {Object|null} lastPlay - 上家出牌信息（null = 首发）
     * @returns {Promise<Object>} { action, cards, type }
     */
    async decide(myHand, lastPlay, filteredCands) {
      const opp = this._deduceOpponentHand(myHand);
      const result = await this._tryAllCandidates(filteredCands, myHand, opp.cards, lastPlay);
      if (result) return result;
      return null;
    }
    // ===== 场景检测 =====
    /**
     * 检测是否进入 1v1 明牌场景
     */
    isTwoPlayerMode() {
      const t = this._tracker;
      if (!t || !t.playerCounts) return false;
      const alive = t.playerCounts.filter((c) => c > 0);
      if (alive.length === 2) return true;
      const myHand = this.p._lastHand || [];
      if (myHand.length > 10) return false;
      const outsideTotal = t.playerCounts.reduce((s, c) => s + c, 0);
      return outsideTotal < 25;
    }
    // ===== 手牌推算 =====
    /**
     * 推算对手手牌的精确牌值分布，同时产出牌数组供后续直接使用
     * @returns {{ countMap: Map<number,number>, cards: Array }}
     */
    _deduceOpponentHand(myHand) {
      const countMap = /* @__PURE__ */ new Map();
      const cards = [];
      const levelCardValue = this._tracker?.levelCardValue ?? 2;
      const myHandCount = {};
      for (const card of myHand) {
        const v = card.value;
        myHandCount[v] = (myHandCount[v] || 0) + 1;
      }
      const remaining = this._tracker.remaining || {};
      for (const [valueStr, totalRemaining] of Object.entries(remaining)) {
        const value = Number(valueStr);
        const oppCount = totalRemaining - (myHandCount[value] || 0);
        if (oppCount > 0) {
          countMap.set(value, oppCount);
          for (let i = 0; i < oppCount; i++) {
            const lv = value === levelCardValue ? 15 : value;
            cards.push({ value, suit: "UNKNOWN", level_value: lv, display: `?${value}` });
          }
        }
      }
      return { countMap, cards };
    }
    // ===== 对手压牌模拟 =====
    /**
     * 模拟对手的最优压牌选择：直接从原始手牌在线生成可压牌型，选最小代价
     */
    async _simulateOpponentBeat(hand, lastType, lastMv) {
      const beatCands = await this._analyzer.generateCandidates(hand, {
        type: lastType,
        main_value: lastMv
      });
      if (!beatCands || beatCands.length === 0) return null;
      beatCands.sort((a, b) => (a.main_value || 0) - (b.main_value || 0));
      return beatCands[0];
    }
    // ===== A/B/C 循环模拟 =====
    /**
     * 模拟一条完整的博弈路径，直到己方清牌（成功）或接不上（失败）。
     *
     * 流程：
     *   A: 己方出牌 → B: 对手回应（过→回A，压→C）→ C: 己方接牌（接上→回B，接不上→失败）
     *
     * @param {Object} candidate - 首轮己方出的牌（仅 lastPlay 为 null 时使用）
     * @param {Array} myHand - 己方手牌副本
     * @param {Array} opponentCards - 对手手牌副本
     * @param {Object|null} lastPlay - 当前轮出牌信息（null = 自己先出）
     * @returns {Object|null} 成功返回 { action, cards, type }，失败返回 null
     */
    async _simulateToVictory(candidate, myHand, opponentCards, lastPlay) {
      let myHandCopy = [...myHand];
      let oppHandCopy = [...opponentCards];
      let path = [];
      if (!lastPlay) {
        if (candidate) {
          myHandCopy = this._analyzer.applyPlay(myHandCopy, candidate.cards);
          path.push({ who: "\u51FA", type: candidate.type, cards: candidate.cards.map((c) => c.display).join("") });
          if (myHandCopy.length === 0) return path;
          lastPlay = candidate;
        }
      } else {
        const myCands = await this._buildFromHand(myHandCopy);
        const valid = this._filterBeat(myCands, lastPlay, false);
        if (valid.length === 0) return null;
        valid.sort((a, b) => (a.main_value || 0) - (b.main_value || 0));
        const chosen = valid[0];
        myHandCopy = this._analyzer.applyPlay(myHandCopy, chosen.cards);
        path.push({ who: "\u51FA", type: chosen.type, cards: chosen.cards.map((c) => c.display).join("") });
        if (myHandCopy.length === 0) return path;
        lastPlay = chosen;
      }
      while (true) {
        if (!lastPlay) {
          const myAllCands = await this._buildFromHand(myHandCopy);
          if (myAllCands.length === 0) return null;
          myAllCands.sort((a, b) => (a.main_value || 0) - (b.main_value || 0));
          const chosen2 = myAllCands[0];
          myHandCopy = this._analyzer.applyPlay(myHandCopy, chosen2.cards);
          path.push({ who: "\u51FA", type: chosen2.type, cards: chosen2.cards.map((c) => c.display).join("") });
          if (myHandCopy.length === 0) return path;
          lastPlay = chosen2;
          continue;
        }
        const oppBeat = await this._simulateOpponentBeat(oppHandCopy, lastPlay.type, lastPlay.main_value);
        if (!oppBeat) {
          lastPlay = null;
          continue;
        }
        oppHandCopy = this._analyzer.applyPlay(oppHandCopy, oppBeat.cards);
        path.push({ who: "\u56DE", type: oppBeat.type, cards: oppBeat.cards.map((c) => c.display).join("") });
        if (oppHandCopy.length === 0) return null;
        lastPlay = oppBeat;
        const myCands = await this._buildFromHand(myHandCopy);
        const valid = this._filterBeat(myCands, lastPlay, false);
        if (valid.length === 0) return null;
        valid.sort((a, b) => (a.main_value || 0) - (b.main_value || 0));
        const chosen = valid[0];
        myHandCopy = this._analyzer.applyPlay(myHandCopy, chosen.cards);
        path.push({ who: "\u51FA", type: chosen.type, cards: chosen.cards.map((c) => c.display).join("") });
        if (myHandCopy.length === 0) return path;
        lastPlay = chosen;
      }
    }
    /**
     * 遍历所有候选，逐个模拟 A/B/C 循环。
     * 找到成功的 candidate 立即返回。
     * 全部失败返回 null（由 decide 触发 fallback）。
     */
    async _tryAllCandidates(candidates, myHand, opponentCards, lastPlay) {
      if (!candidates || candidates.length === 0) return null;
      for (const cand of candidates) {
        const path = await this._simulateToVictory(cand, myHand, opponentCards, lastPlay);
        if (path) {
          console.log(`[1V1] ${this._myName} \u6A21\u62DF\u6210\u529F: ${cand.type} ${(cand.cards || []).map((c) => c.display).join("")}`);
          for (let i = 1; i < path.length; i++) {
            const step = path[i];
            console.log(`  ${i}. [${step.who}] ${step.type}: ${step.cards}`);
          }
          return { action: "play", cards: cand.cards, type: cand.type };
        }
      }
      return null;
    }
  };

  // guandan/src/scoring/base.js
  var BaseScorer = class {
    // ===== 手牌/候选评估 =====
    /**
     * 评估单副手牌的原始分数（逐牌点数，不组牌）
     * @param {Array} hand — 牌对象数组
     * @returns {Object} { total, breakdown }
     */
    evaluateHand(hand) {
      throw new Error("evaluateHand() must be overridden");
    }
    /**
     * 评估已组织好的候选牌型质量
     * @param {Array} candidates — [{ type, cards, main_value }, ...]
     * @returns {Object} { total, score_breakdown }
     */
    evaluateCandidates(candidates) {
      throw new Error("evaluateCandidates() must be overridden");
    }
    // ===== 跟牌场景 =====
    /**
     * 跟牌时，对单个候选打分
     * @param {Object} cand — 候选 { type, cards, main_value }
     * @param {Array|Object} remaining — 剩余候选列表 或 { futureCandidates, handSize }
     * @returns {number} 分数（越高越好）
     */
    scoreBeatChoice(cand, remaining) {
      throw new Error("scoreBeatChoice() must be overridden");
    }
    // ===== 组牌阶段 =====
    /**
     * 顺子/同花顺候选的分布评分（group_hand 阶段）
     * @param {Array} distribution — 每个位置需求的牌张数，如 [1,0,2,1,0]
     * @param {number} wildCount — 需要的万能牌数
     * @param {number} coveredCount — 已覆盖的花色位置数（仅同花顺用）
     * @param {Object} [context] — 上下文 { cards_values, valueCounts }
     * @returns {number} 分数
     */
    scoreDistribution(dist, wildCount, coveredCount, context = {}) {
      throw new Error("scoreDistribution() must be overridden");
    }
    /**
     * 组牌方案的最终评分（顺子/同花顺路径 vs 不组顺子）
     * @param {string} type — 'STRAIGHT' | 'FLUSH_STRAIGHT'
     * @param {Object} remainingHandEval — evaluateHand(remaining) 的结果
     * @param {number} [maxValue=8] — 顺子最大牌值（用于牌值感知加成）
     * @returns {number} 方案总分
     */
    scoreGroupScheme(type, remainingHandEval, maxValue = 8) {
      throw new Error("scoreGroupScheme() must be overridden");
    }
    // ===== 诊断 =====
    /**
     * 返回当前评分器的关键参数摘要（用于对比报告）
     * @returns {Object}
     */
    getConfig() {
      return { name: "base" };
    }
  };

  // guandan/src/scoring/default.js
  var TYPE_SCORES = {
    "FOUR_JOKERS": 40,
    "BOMB": 30,
    "FLUSH_STRAIGHT": 25,
    "TRIPLE_WITH_PAIR": 8,
    "TWO_TRIPLES": 6,
    "THREE_PAIRS": 6,
    "STRAIGHT": 5,
    "TRIPLE": 4,
    "PAIR": 2,
    "SINGLE": -3,
    "WILD": -5
  };
  var STRAIGHT_BASE_BONUS = 5;
  var FLUSH_STRAIGHT_BASE_BONUS = 8;
  var BEAT_MAIN_VALUE_WEIGHT = 0.3;
  var BEAT_REMAINING_WEIGHT = 0.7;
  var DefaultScorer = class extends BaseScorer {
    // ----- 手牌/候选评估 -----
    evaluateHand(hand) {
      return evaluateHand(hand);
    }
    evaluateCandidates(candidates) {
      let total = 0;
      const breakdown = {};
      for (const cand of candidates) {
        const type = (cand.type || "").toUpperCase();
        const score = TYPE_SCORES[type] || 0;
        breakdown[type] = (breakdown[type] || 0) + score;
        total += score;
      }
      return { total, score_breakdown: breakdown };
    }
    // ----- 跟牌场景 -----
    scoreBeatChoice(cand, remaining) {
      const mainValue = cand.main_value || 0;
      let remainingTotal;
      if (Array.isArray(remaining)) {
        remainingTotal = this.evaluateCandidates(remaining).total;
      } else if (remaining && typeof remaining.total === "number") {
        remainingTotal = remaining.total;
      } else {
        remainingTotal = 0;
      }
      return -mainValue * BEAT_MAIN_VALUE_WEIGHT + remainingTotal * BEAT_REMAINING_WEIGHT;
    }
    // ----- 组牌阶段 -----
    /**
     * 分布评分，结合三项改进：
     *   A - 牌值感知：高端顺子加分，低端顺子减分
     *   B - 万能牌代价非线性：多缺口惩罚递增
     *   C - 区分对子质量：可组三带二的对子代价更低
     */
    scoreDistribution(dist, wildCount, coveredCount, context = {}) {
      const singleton = dist.filter((x) => x === 1).length;
      const pair = dist.filter((x) => x === 2).length;
      const triple = dist.filter((x) => x === 3).length;
      const quad = dist.filter((x) => x === 4).length;
      const gaps = dist.filter((x) => x === 0).length;
      let score = singleton * 10 - triple * 5 - quad * 10;
      score -= gaps * 5 + Math.max(0, gaps - 1) * 10;
      const { cards_values, valueCounts } = context;
      if (cards_values && valueCounts) {
        let pairPenalty = 0;
        for (let i = 0; i < dist.length; i++) {
          if (dist[i] === 2) {
            const val = cards_values[i];
            const totalInHand = valueCounts[val] || 0;
            if (totalInHand >= 3) {
              pairPenalty += 3;
            } else {
              pairPenalty += 8;
            }
          }
        }
        score -= pairPenalty;
      } else {
        score -= pair * 8;
      }
      if (cards_values) {
        const midValue = cards_values[2];
        score += (midValue - 8) * 2;
      }
      return score;
    }
    scoreGroupScheme(type, remainingHandEval, maxValue = 8) {
      const baseBonus = type === "FLUSH_STRAIGHT" ? FLUSH_STRAIGHT_BASE_BONUS : STRAIGHT_BASE_BONUS;
      const valueBonus = (maxValue - 8) * 2;
      const bonus = baseBonus + valueBonus;
      const remainingTotal = typeof remainingHandEval === "object" && remainingHandEval !== null ? remainingHandEval.total : remainingHandEval;
      return bonus + remainingTotal;
    }
    // ----- 诊断 -----
    getConfig() {
      return {
        name: "default",
        TYPE_SCORES: { ...TYPE_SCORES },
        straightBaseBonus: STRAIGHT_BASE_BONUS,
        flushStraightBaseBonus: FLUSH_STRAIGHT_BASE_BONUS,
        beatMainValueWeight: BEAT_MAIN_VALUE_WEIGHT,
        beatRemainingWeight: BEAT_REMAINING_WEIGHT,
        features: ["value-aware", "nonlinear-gap", "pair-quality"]
      };
    }
  };

  // guandan/src/ai-player/strategy.js
  function groupOther(hand) {
    const wildCards = hand.filter(isWildCard);
    const nonWild = hand.filter((c) => !isWildCard(c));
    const wildCount = wildCards.length;
    const bombs = [];
    const nonBomb = [];
    const count = {};
    for (const c of nonWild) count[c.value] = (count[c.value] || 0) + 1;
    for (const val in count) {
      if (count[val] >= 4) {
        bombs.push(nonWild.filter((c) => c.value == val));
      } else {
        nonBomb.push(...nonWild.filter((c) => c.value == val));
      }
    }
    const valueCards = /* @__PURE__ */ new Map();
    for (const card of nonBomb) {
      if (!valueCards.has(card.value)) valueCards.set(card.value, []);
      valueCards.get(card.value).push(card);
    }
    const sortedValues = [...valueCards.keys()].sort((a, b) => a - b);
    function mapV(v) {
      return v === 14 ? 1 : v;
    }
    function unmapV(v) {
      return v === 1 ? 14 : v;
    }
    const eligibleValues = sortedValues.map(mapV).sort((a, b) => a - b);
    const usedValues = /* @__PURE__ */ new Set();
    const result = [];
    const levelCard = nonWild.find((c) => c.level_value === 15);
    const levelCardValue = levelCard ? levelCard.value : null;
    const pairValues = eligibleValues.filter((v) => (valueCards.get(unmapV(v)) || []).length === 2);
    const nonLevelPairValues = pairValues.filter((v) => {
      if (v === 1) return false;
      const cards = valueCards.get(unmapV(v)) || [];
      return !cards.some((c) => c.level_value === 15);
    });
    function findAllConsecPairs(values) {
      const results = [];
      let idx = 0;
      while (idx < values.length) {
        const group = [values[idx]];
        let endIdx = idx + 1;
        while (endIdx < values.length && values[endIdx] === group[group.length - 1] + 1) {
          group.push(values[endIdx]);
          endIdx++;
        }
        if (group.length >= 3) {
          const segment = group.slice(0, 3);
          results.push(segment);
          for (const v of segment) usedValues.add(v);
          idx = endIdx;
        } else {
          idx++;
        }
      }
      return results;
    }
    let pairGroups = findAllConsecPairs(nonLevelPairValues);
    const remainingPairValues = pairValues.filter((v) => {
      if (usedValues.has(v)) return false;
      if (v === 1 && (levelCardValue === 2 || levelCardValue === 3)) return false;
      return true;
    });
    pairGroups = pairGroups.concat(findAllConsecPairs(remainingPairValues));
    for (const segment of pairGroups) {
      const groupCards = [];
      for (const v of segment) {
        const origV = unmapV(v);
        const cards = valueCards.get(origV) || [];
        if (cards.length >= 2) groupCards.push(...cards.slice(0, 2));
      }
      if (groupCards.length > 0) {
        result.push({ cards: groupCards, type: "THREE_PAIRS" });
      }
    }
    const tripleValues = sortedValues.filter((v) => {
      if (v === 14) return false;
      const cards = valueCards.get(v) || [];
      if (cards.some((c) => c.level_value === 15)) return false;
      return cards.length >= 3 && !usedValues.has(v);
    });
    function findAllConsecTriples(values) {
      const results = [];
      let idx = 0;
      while (idx < values.length) {
        const group = [values[idx]];
        let endIdx = idx + 1;
        while (endIdx < values.length && values[endIdx] === group[group.length - 1] + 1) {
          group.push(values[endIdx]);
          endIdx++;
        }
        if (group.length >= 2) {
          const segment = group.slice(0, 2);
          results.push(segment);
          for (const v of segment) usedValues.add(v);
          idx = endIdx;
        } else {
          idx++;
        }
      }
      return results;
    }
    let tripleGroups = findAllConsecTriples(tripleValues);
    const remainingTripleValues = tripleValues.filter((v) => !usedValues.has(v));
    tripleGroups = tripleGroups.concat(findAllConsecTriples(remainingTripleValues));
    for (const segment of tripleGroups) {
      const groupCards = [];
      for (const v of segment) {
        const cards = valueCards.get(v) || [];
        if (cards.length >= 3) {
          groupCards.push(...cards.slice(0, 3));
          for (const c of cards.slice(0, 3)) usedValues.add(c.value);
        }
      }
      if (groupCards.length > 0) {
        result.push({ cards: groupCards, type: "TWO_TRIPLES" });
      }
    }
    const remainingTriples = [];
    const remainingPairs = [];
    const remainingSingles = [];
    for (const v of sortedValues) {
      if (usedValues.has(mapV(v))) continue;
      const cards = valueCards.get(v) || [];
      const cnt = cards.length;
      if (cnt >= 3) remainingTriples.push(cards.slice(0, 3));
      else if (cnt === 2) remainingPairs.push(cards.slice(0, 2));
      else if (cnt === 1) remainingSingles.push(cards.slice(0, 1));
    }
    for (const triple of remainingTriples) {
      result.push({ cards: triple, type: "TRIPLE" });
    }
    for (const pair of remainingPairs) {
      result.push({ cards: pair, type: "PAIR" });
    }
    for (const single of remainingSingles) {
      result.push({ cards: single, type: "SINGLE" });
    }
    for (const wc of wildCards) {
      result.push({ cards: [wc], type: "WILD" });
    }
    for (const bombCards of bombs) {
      result.push({ cards: bombCards, type: "BOMB" });
    }
    return result;
  }
  async function group_hand(hand, scorer) {
    const _scorer = scorer || new DefaultScorer();
    const { nonWild, wildCount, wildCards } = _separateWildCards(hand);
    const valueCounts = {};
    for (const c of nonWild) {
      valueCounts[c.value] = (valueCounts[c.value] || 0) + 1;
    }
    const { flushPool, straightPool } = _slideWindow(nonWild, wildCount, valueCounts, _scorer);
    const flushTop = _prunePool(flushPool, 2);
    const straightTop = _prunePool(straightPool, 3);
    const merged = [...flushTop, ...straightTop];
    if (merged.length === 0) {
      return _createDefaultCandidate(hand, 0);
    }
    const rankingPool = [];
    for (const candidate of merged) {
      const [actualCards, remaining] = expandCandidateToCards(candidate, hand);
      if (!actualCards || actualCards.length === 0) continue;
      const wildUsed = actualCards.filter(
        (c) => isWildCard(c)
      ).length;
      const score = _scorer.scoreGroupScheme(candidate.type, _scorer.evaluateHand(remaining), Math.max(...candidate.cards_values));
      const remainingWithWilds = remaining;
      rankingPool.push({
        path: [{ ...candidate, _actual_cards: actualCards }],
        score,
        remaining: remainingWithWilds,
        wild_used: wildUsed
      });
    }
    const noStraightScore = await _evaluateRemaining(nonWild, _scorer);
    rankingPool.push({
      path: [],
      score: noStraightScore,
      remaining: [...nonWild, ...wildCards],
      wild_used: 0
    });
    rankingPool.sort((a, b) => b.score - a.score);
    return rankingPool.slice(0, 5).map((item) => ({
      path: item.path,
      score: item.score,
      remaining: item.remaining
    }));
  }
  function _separateWildCards(hand) {
    const nonWild = [];
    const wildCards = [];
    for (const card of hand) {
      if (isWildCard(card)) {
        wildCards.push(card);
      } else {
        nonWild.push(card);
      }
    }
    return { nonWild, wildCount: wildCards.length, wildCards };
  }
  async function _evaluateRemaining(remaining, scorer) {
    const result = scorer.evaluateHand(remaining);
    return typeof result === "object" && result !== null ? result.total : result;
  }
  function _slideWindow(nonWild, wildCount, valueCounts, scorer, options = {}) {
    if (nonWild.length === 0) return { flushPool: [], straightPool: [] };
    const sortedVals = Object.keys(valueCounts).map(Number).sort((a, b) => a - b);
    const minVal = sortedVals[0];
    const maxVal = sortedVals[sortedVals.length - 1];
    const vStart = 2;
    const vEnd = Math.min(maxVal, 14) - 4;
    if (vEnd < vStart) return { flushPool: [], straightPool: [] };
    const flushPool = [];
    const straightPool = [];
    const bySuit = {};
    for (const card of nonWild) {
      const s = card.suit;
      if (s && s !== "JOKER") {
        if (!bySuit[s]) bySuit[s] = {};
        bySuit[s][card.value] = (bySuit[s][card.value] || 0) + 1;
      }
    }
    for (let startV = vStart; startV <= vEnd; startV++) {
      const window2 = Array.from({ length: 5 }, (_, i) => startV + i);
      const distribution = window2.map((v) => valueCounts[v] || 0);
      const gaps = distribution.filter((d) => d === 0).length;
      if (gaps > wildCount) continue;
      const suitDist = {};
      for (const s in bySuit) {
        suitDist[s] = window2.map((v) => bySuit[s][v] || 0);
      }
      let maxCovered = 0;
      for (const s in suitDist) {
        const covered = suitDist[s].filter((count) => count > 0).length;
        if (covered > maxCovered) maxCovered = covered;
      }
      const score = scorer.scoreDistribution(distribution, wildCount, maxCovered, { cards_values: window2, valueCounts });
      const baseCandidate = {
        cards_values: window2,
        distribution,
        score,
        gaps,
        wild_needed: gaps
      };
      straightPool.push({ ...baseCandidate, type: "STRAIGHT" });
      if (maxCovered >= 4) {
        const gapsInSuit = 5 - maxCovered;
        if (gapsInSuit === 0 || gapsInSuit === 1 && wildCount >= 1) {
          for (const s in suitDist) {
            const covered = suitDist[s].filter((count) => count > 0).length;
            if (covered >= 4) {
              flushPool.push({
                ...baseCandidate,
                type: "FLUSH_STRAIGHT",
                suit: s,
                score: score + 3,
                suit_counts: suitDist[s]
              });
              break;
            }
          }
        }
      }
    }
    _addA2345Candidate(nonWild, wildCount, valueCounts, bySuit, flushPool, straightPool, scorer);
    if (options.noPrune) {
      return { flushPool, straightPool };
    }
    return {
      flushPool: _prunePool(flushPool, 2),
      straightPool: _prunePool(straightPool, 3)
    };
  }
  function _addA2345Candidate(nonWild, wildCount, valueCounts, bySuit, flushPool, straightPool, scorer) {
    const needed = [14, 2, 3, 4, 5];
    const counts = needed.map((v) => valueCounts[v] || 0);
    const gaps = counts.filter((c) => c === 0).length;
    if (gaps > wildCount) return;
    const score = scorer.scoreDistribution(counts, wildCount, 0, { cards_values: needed, valueCounts });
    straightPool.push({
      cards_values: [1, 2, 3, 4, 5],
      distribution: counts,
      score,
      gaps,
      wild_needed: gaps,
      type: "STRAIGHT",
      is_a2345: true
    });
    for (const suit in bySuit) {
      const suitCounts = needed.map((v) => bySuit[suit][v] || 0);
      const covered = suitCounts.filter((c) => c > 0).length;
      if (covered >= 4 && wildCount >= 1) {
        flushPool.push({
          cards_values: [1, 2, 3, 4, 5],
          distribution: counts,
          score: score + 3,
          gaps,
          wild_needed: gaps,
          type: "FLUSH_STRAIGHT",
          suit,
          suit_counts: suitCounts,
          is_a2345: true
        });
      }
    }
  }
  function _prunePool(pool, maxKeep) {
    if (pool.length <= maxKeep) return pool;
    return [...pool].sort((a, b) => b.score - a.score).slice(0, maxKeep);
  }
  function _createDefaultCandidate(hand, accumulatedBonus) {
    return [{
      path: [],
      score: accumulatedBonus,
      remaining: hand
    }];
  }
  function expandCandidateToCards(candidate, hand) {
    const { cards_values, distribution, wild_needed, type, suit, suit_counts } = candidate;
    const isFlush = type === "FLUSH_STRAIGHT";
    const flushSuit = isFlush ? suit : "";
    const actualValues = cards_values.map((v) => v === 1 ? 14 : v);
    let result = [];
    let remainingHand = [...hand];
    for (let i = 0; i < actualValues.length; i++) {
      const v = actualValues[i];
      let foundCard = null;
      if (distribution[i] === 0) {
        foundCard = remainingHand.find((c) => isWildCard(c));
      } else {
        const suitHasCard = isFlush && i < (suit_counts?.length || 0) && suit_counts[i] > 0;
        if (isFlush && suitHasCard) {
          foundCard = remainingHand.find((c) => c.value === v && c.suit === flushSuit);
        } else if (isFlush && !suitHasCard) {
          foundCard = remainingHand.find((c) => isWildCard(c));
        } else {
          foundCard = remainingHand.find((c) => c.value === v);
          if (!foundCard && !isFlush) {
            foundCard = remainingHand.find((c) => isWildCard(c));
          }
        }
      }
      if (foundCard) {
        result.push(foundCard);
        remainingHand = remainingHand.filter((c) => c !== foundCard);
      } else {
        const wildFallback = remainingHand.find((c) => isWildCard(c));
        if (wildFallback) {
          result.push(wildFallback);
          remainingHand = remainingHand.filter((c) => c !== wildFallback);
        } else {
          return [[], []];
        }
      }
    }
    return [result, remainingHand];
  }
  var EnhancedMinBeatStrategy = class _EnhancedMinBeatStrategy {
    static MODE_DEFAULT = "default";
    static MODE_AGGRESSIVE = "aggressive";
    static MODE_CONSERVATIVE = "conservative";
    constructor(analyzer, scorer) {
      this.analyzer = analyzer || new EnhancedHandAnalyzer();
      this.scorer = scorer || new DefaultScorer();
      this.position = 0;
      this.teamPosition = 0;
      this.gameState = {};
      this.tracker = null;
      this.strategyMode = _EnhancedMinBeatStrategy.MODE_DEFAULT;
      this.aggressiveThreshold = 30;
      this.conservativeThreshold = -20;
      this.passThreshold = 0.4;
      this._groupsCache = null;
      this._lastHand = null;
      this._twoPlayer = new TwoPlayerStrategy({
        parent: this,
        groupOther,
        calcMainValue
      });
    }
    /**
     * 设置记牌器引用
     * @param {CardTracker} tracker - 记牌器实例
     */
    setTracker(tracker) {
      this.tracker = tracker;
    }
    /**
     * 出牌后更新缓存 — 从缓存中移除已出的候选牌，更新指纹
     * @param {Array} currentHand 出牌前的当前手牌
     * @param {Array} playedCards 已出的牌
     */
    updateCacheAfterPlay(currentHand, playedCards) {
      if (!this._groupsCache || !currentHand || !playedCards || playedCards.length === 0) return;
      const candidates = this._groupsCache.candidates;
      let foundIndex = null;
      for (let i = 0; i < candidates.length; i++) {
        const cand = candidates[i];
        const candCards = cand.cards || [];
        if (playedCards.length !== candCards.length) continue;
        const remaining = [...candCards];
        let allFound = true;
        for (const card of playedCards) {
          const idx = remaining.findIndex((c) => c.value === card.value && c.suit === card.suit);
          if (idx >= 0) {
            remaining.splice(idx, 1);
          } else {
            allFound = false;
            break;
          }
        }
        if (allFound) {
          foundIndex = i;
          break;
        }
      }
      let playType = "";
      let foundTripleIndex = null;
      let foundPairIndex = null;
      if (foundIndex === null) {
        const remainingPlay = [...playedCards];
        let pairFound = false;
        for (let i = 0; i < candidates.length; i++) {
          const cand = candidates[i];
          if (cand.type === "PAIR") {
            const pairCards = cand.cards || [];
            if (playedCards.length >= pairCards.length) {
              const testRemaining = [...remainingPlay];
              let ok = true;
              for (const pc of pairCards) {
                const idx = testRemaining.findIndex((c) => c.value === pc.value && c.suit === pc.suit);
                if (idx >= 0) {
                  testRemaining.splice(idx, 1);
                } else {
                  ok = false;
                  break;
                }
              }
              if (ok) {
                pairFound = true;
                foundPairIndex = i;
                for (let j = 0; j < candidates.length; j++) {
                  if (j === foundPairIndex) continue;
                  const cand2 = candidates[j];
                  if (cand2.type === "TRIPLE") {
                    const tripleCards = cand2.cards || [];
                    if (testRemaining.length >= tripleCards.length) {
                      const testTripleRemaining = [...testRemaining];
                      let tripleOk = true;
                      for (const tc of tripleCards) {
                        const idx = testTripleRemaining.findIndex((c) => c.value === tc.value && c.suit === tc.suit);
                        if (idx >= 0) {
                          testTripleRemaining.splice(idx, 1);
                        } else {
                          tripleOk = false;
                          break;
                        }
                      }
                      if (tripleOk) {
                        playType = "TRIPLE_WITH_PAIR";
                        foundTripleIndex = j;
                        break;
                      }
                    }
                  }
                }
                break;
              }
            }
          }
        }
        if (foundIndex === null && playType !== "TRIPLE_WITH_PAIR") {
          this._groupsCache = null;
          return;
        }
        if (playType === "TRIPLE_WITH_PAIR") {
          const first = Math.max(foundTripleIndex, foundPairIndex);
          const second = Math.min(foundTripleIndex, foundPairIndex);
          candidates.splice(first, 1);
          candidates.splice(second, 1);
        }
      } else {
        candidates.splice(foundIndex, 1);
      }
      const remainingHand = [...currentHand];
      for (const card of playedCards) {
        const cv = card.value;
        const cs = card.suit;
        for (let i = 0; i < remainingHand.length; i++) {
          if (remainingHand[i].value === cv && remainingHand[i].suit === cs) {
            remainingHand.splice(i, 1);
            break;
          }
        }
      }
      this._groupsCache.hand_fingerprint = this._generateHandFingerprint(remainingHand);
    }
    setGameState(position, teamPosition, state) {
      this.position = position;
      this.teamPosition = teamPosition;
      this.gameState = state;
    }
    /**
     * Core decision logic
     */
    async decide(hand, lastPlay) {
      const myHand = Array.isArray(hand) ? hand : hand?.hand || [];
      const myLastPlay = lastPlay || null;
      const myIsTeammate = myLastPlay ? this.position % 2 === myLastPlay.player % 2 : false;
      if (!myHand || !Array.isArray(myHand) || myHand.length === 0) {
        return { action: "pass", cards: [], type: "" };
      }
      this._lastHand = [...myHand];
      if (!this._groupsCache || !this._cacheValid(myHand, this._groupsCache)) {
        if (!this._quiet) console.log(`[CACHE] [${this.position}#] REBUILD start`);
        const candidates = await this._buildCandidatesFromHand(myHand);
        this._groupsCache = {
          hand_fingerprint: this._generateHandFingerprint(myHand),
          candidates
        };
        if (!this._quiet) console.log(`[CACHE] [${this.position}#] REBUILD: ${candidates.length} candidates`);
        this._printCandidates(candidates, myHand.length, myHand);
      }
      if (!myLastPlay) {
        if (this._twoPlayer.isTwoPlayerMode()) {
          const nonBombCandidates = this._groupsCache.candidates.filter((c) => c.type !== "BOMB" && c.type !== "FLUSH_STRAIGHT");
          const result2 = await this._twoPlayer.decide(myHand, myLastPlay, nonBombCandidates);
          if (result2) return result2;
        }
        const result = this._chooseFromCached(this._groupsCache.candidates);
        if (result.action === "pass" && myHand.length > 0) {
          console.warn(`[STRATEGY] \u5019\u9009\u5168\u90E8\u9009\u62E9pass\uFF0C\u5F3A\u5236 fallback \u5355\u5F20\u51FA\u724C (\u624B\u724C${myHand.length}\u5F20)`);
          return this._fallbackPlaySingle(myHand);
        }
        return result;
      } else {
        const candidates = this._filterBeatCandidates(
          this._groupsCache.candidates,
          myLastPlay,
          myIsTeammate
        );
        if (this._twoPlayer.isTwoPlayerMode()) {
          const result = await this._twoPlayer.decide(myHand, myLastPlay, candidates);
          if (result) return result;
        }
        const lastPlayCount = lastPlay.cards.length;
        const nextPlayerCount = this.tracker.getPlayerCount((this.position + 1) % 4);
        const teammateLeft = this.tracker?.getPlayerCount((this.position + 2) % 4) || 0;
        if (myIsTeammate && teammateLeft > 0 && nextPlayerCount !== lastPlayCount) {
          if (this._lastPlayContainsBigCards(lastPlay) || this.tracker && this._isLastPlayMaxOutside(myLastPlay, myHand) >= 1) {
            return { action: "pass", cards: [], type: "" };
          }
        }
        if (candidates.length > 0) {
          if (myIsTeammate && this._shouldHoldForFollowWind(candidates, myLastPlay, myHand)) {
            return { action: "pass", cards: [], type: "" };
          }
          return this._chooseBeatFromCached(candidates, myHand);
        } else if (!myIsTeammate && !this._bombSkipped && this._isUrgentBeat(myLastPlay)) {
          return this._chooseBeatPlay(myHand, myLastPlay, myIsTeammate);
        } else {
          return { action: "pass", cards: [], type: "" };
        }
      }
    }
    /**
     * 判断是否属于"紧要关头"：非队友出牌，且有至少一个对手手牌 <= 7
     */
    _isUrgentBeat(lastPlay) {
      const lastPlayerIdx = lastPlay?.player;
      for (let i = 0; i < 4; i++) {
        if (i === this.position) continue;
        if (i % 2 === this.position % 2) continue;
        const count = this.tracker ? this.tracker.getPlayerCount(i) : 999;
        if (count <= 7) return true;
      }
      return false;
    }
    _cacheValid(hand, cache) {
      if (!cache || !cache.hand_fingerprint || !cache.candidates) return false;
      return this._generateHandFingerprint(hand) === cache.hand_fingerprint;
    }
    _generateHandFingerprint(hand) {
      const cardKeys = hand.map((c) => ({ v: c.value, s: c.suit })).sort((a, b) => {
        if (a.v !== b.v) return a.v - b.v;
        return a.s.localeCompare(b.s);
      }).map((k) => `${k.v}${k.s}`);
      return cardKeys.join(",");
    }
    /** 对 combinedPath 中所有 _actual_cards 生成规范化指纹，用于去重 */
    _pathFingerprint(combinedPath) {
      const allCards = [];
      for (const item of combinedPath) {
        const cards = item._actual_cards || [];
        for (const c of cards) {
          allCards.push(`${c.value}_${c.suit}`);
        }
      }
      allCards.sort((a, b) => {
        const [va, sa] = a.split("_");
        const [vb, sb] = b.split("_");
        if (+va !== +vb) return +va - +vb;
        return sa.localeCompare(sb);
      });
      return allCards.join("|");
    }
    async _buildCandidatesFromHand(hand) {
      const top5 = await group_hand(hand, this.scorer);
      let bestCandidates = null;
      let bestScore = null;
      const seenFingerprints = /* @__PURE__ */ new Set();
      for (const groupScheme of top5) {
        const pathItems = groupScheme.path || [];
        const remaining = groupScheme.remaining || [];
        const remainingArr = Array.isArray(remaining) ? remaining : [];
        const subTop5 = remainingArr.length > 0 ? await group_hand(remainingArr, this.scorer) : [{ path: [], remaining: [] }];
        for (const subScheme of subTop5) {
          const subPathItems = subScheme.path || [];
          const subRemaining = subScheme.remaining || [];
          const combinedPath = [...pathItems, ...subPathItems];
          const fp = this._pathFingerprint(combinedPath);
          if (seenFingerprints.has(fp)) continue;
          seenFingerprints.add(fp);
          const candidates = this._groupsToCandidates(combinedPath, subRemaining);
          if (!candidates || candidates.length === 0) continue;
          const scoreResult = this.scorer.evaluateCandidates(candidates, hand.length);
          const total = scoreResult.total;
          if (bestScore === null || total > bestScore) {
            bestScore = total;
            bestCandidates = candidates;
          }
        }
      }
      return bestCandidates || [];
    }
    _groupsToCandidates(pathItems, remaining) {
      let candidates = [];
      for (const pathItem of pathItems) {
        const actualCards = pathItem._actual_cards || [];
        if (actualCards.length === 0) continue;
        const mv = calcMainValue(pathItem.type || "", actualCards);
        candidates.push({ type: pathItem.type, cards: actualCards, main_value: mv });
      }
      const others = groupOther(remaining);
      for (const item of others) {
        if (item.type === "WILD") {
          const lv = item.cards[0].level_value ?? item.cards[0].value;
          candidates.push({ type: item.type, cards: item.cards, main_value: lv });
        } else {
          const mv = calcMainValue(item.type || "", item.cards || []);
          candidates.push({ ...item, main_value: mv });
        }
      }
      if (candidates.length > 0) {
        candidates = this._consumeWildCards(candidates);
      }
      candidates.sort((a, b) => a.main_value - b.main_value || 0);
      return candidates;
    }
    _consumeWildCards(candidates) {
      const wildCands = candidates.filter((c) => c.type === "WILD");
      let wildIdx = 0;
      while (wildIdx < wildCands.length) {
        const wcCandidate = wildCands[wildIdx];
        const wcCard = wcCandidate.cards[0];
        let made = false;
        if (!made) {
          const triples = candidates.filter((c) => c.type === "TRIPLE");
          if (triples.length > 0) {
            triples.sort((a, b) => a.main_value - b.main_value);
            const triple = triples[0];
            const bombCards = [...triple.cards, wcCard];
            const lv = triple.cards[0].level_value ?? triple.cards[0].value;
            candidates.push({ type: "BOMB", cards: bombCards, main_value: 400 + lv });
            candidates.splice(candidates.indexOf(triple), 1);
            candidates.splice(candidates.indexOf(wcCandidate), 1);
            wildCands.splice(wildCands.indexOf(wcCandidate), 1);
            made = true;
          }
        }
        if (!made) {
          const pairs = candidates.filter((c) => c.type === "PAIR" && !c.cards.some((card) => card.suit === "JOKER"));
          if (pairs.length > 0) {
            pairs.sort((a, b) => b.main_value - a.main_value);
            const pair = pairs[0];
            candidates.push({ type: "TRIPLE", cards: [...pair.cards, wcCard], main_value: pair.main_value });
            candidates.splice(candidates.indexOf(pair), 1);
            candidates.splice(candidates.indexOf(wcCandidate), 1);
            wildCands.splice(wildCands.indexOf(wcCandidate), 1);
            made = true;
          }
        }
        if (!made) {
          const levelSingles = candidates.filter((c) => c.type === "SINGLE" && c.cards.some((card) => card.level_value === 15));
          if (levelSingles.length > 0) {
            levelSingles.sort((a, b) => a.main_value - b.main_value);
            const single = levelSingles[0];
            candidates.push({ type: "PAIR", cards: [...single.cards, wcCard], main_value: single.main_value });
            candidates.splice(candidates.indexOf(single), 1);
            candidates.splice(candidates.indexOf(wcCandidate), 1);
            wildCands.splice(wildCands.indexOf(wcCandidate), 1);
            made = true;
          }
        }
        if (!made) {
          wildCands.splice(wildIdx, 1);
          wildCands.push(wcCandidate);
          break;
        }
      }
      return candidates;
    }
    _chooseFromCached(candidates) {
      if (candidates.length === 0) {
        console.warn(`[STRATEGY] \u5019\u9009\u6C60\u4E3A\u7A7A\uFF0Cfallback \u8FC7\u724C`);
        return { action: "pass", cards: [], type: "" };
      }
      const handSize = this._lastHand?.length || 0;
      if (handSize <= 10) {
        const merged = this._mergeCandidates(candidates);
        const maxList = [];
        const bombList = [];
        const nonMaxList = [];
        for (const c of merged) {
          const val = this._isMaxOutside(c, this._lastHand);
          if (val === 1) maxList.push(c);
          else if (val === 3) bombList.push(c);
          else nonMaxList.push(c);
        }
        if (nonMaxList.length > 0) {
          const cardsStr = nonMaxList.map((c) => c.cards.map((card) => this._formatCard(card)).join(" ")).join(" | ");
          console.log(`[NONMAX] [${this.position}#] ${cardsStr}`);
        }
        if (nonMaxList.length >= 2) {
        } else {
          maxList.sort((a, b) => a.main_value - b.main_value);
          bombList.sort((a, b) => a.main_value - b.main_value);
          const upCount = this.tracker?.getPlayerCount((this.position + 3) % 4) || 0;
          const downCount = this.tracker?.getPlayerCount((this.position + 1) % 4) || 0;
          const noMaxCount = nonMaxList.length > 0 ? nonMaxList[0].cards.length : 0;
          if (bombList.length > 0 && noMaxCount > 0 && (noMaxCount === upCount || noMaxCount === downCount)) {
            const ordered2 = [...maxList, ...bombList];
            return { action: "play", cards: ordered2[0].cards, type: ordered2[0].type };
          }
          const ordered = [...maxList, ...nonMaxList, ...bombList];
          return { action: "play", cards: ordered[0].cards, type: ordered[0].type };
        }
      }
      let bestCandidate = candidates[0];
      let rest = candidates.slice(1);
      if (bestCandidate.type === "PAIR") {
        const rearranged = this._tryTripleWithPair(bestCandidate, rest);
        bestCandidate = rearranged[0];
        rest = rearranged.slice(1);
      } else if (bestCandidate.type === "TRIPLE") {
        const minPair = this._findMinPairInRest(rest);
        if (minPair && this._shouldPlayPair(minPair, rest)) {
          bestCandidate = { type: "TRIPLE_WITH_PAIR", cards: [...bestCandidate.cards, ...minPair.cards], main_value: bestCandidate.main_value };
          rest = rest.filter((c) => c !== minPair);
        }
      }
      const teammateCountForSend = this.tracker?.getPlayerCount((this.position + 2) % 4);
      if (this.tracker && teammateCountForSend <= 2) {
        const sendResult = this._trySendTeammate(candidates, this._lastHand, teammateCountForSend);
        if (sendResult) {
          return { action: "play", cards: sendResult.cards, type: sendResult.type };
        }
      }
      const up = this.tracker?.getPlayerCount((this.position + 3) % 4);
      const down = this.tracker?.getPlayerCount((this.position + 1) % 4);
      const teammate = this.tracker?.getPlayerCount((this.position + 2) % 4);
      if (this.tracker && (up <= 8 || down <= 8 || teammate <= 5)) {
        const sortedCandidates = [bestCandidate, ...rest];
        const sorted = this._sortByOpponentHand(sortedCandidates, this.position);
        return { action: "play", cards: sorted[0].cards, type: sorted[0].type };
      }
      return { action: "play", cards: bestCandidate.cards, type: bestCandidate.type };
    }
    /**
     * 根据对手/队友余牌重新排序候选牌
     * - 张数匹配对手余牌的牌移到 fallback 组
     * - 按上家→下家→队友顺序，依次找优先牌型移到第1项（每步只找第一个）
     * @param {Array} candidates - {type, cards, main_value}
     * @param {number} playerPos - 当前出牌AI的位置 (0-3)
     * @returns {Array} 排序后的候选数组
     */
    _sortByOpponentHand(candidates, playerPos = 0) {
      if (!this.tracker || !candidates || candidates.length <= 1) return candidates;
      const safe = [];
      const fallback = [];
      const upCount = this.tracker.getPlayerCount((playerPos + 3) % 4);
      const downCount = this.tracker.getPlayerCount((playerPos + 1) % 4);
      const teammateCount = this.tracker.getPlayerCount((playerPos + 2) % 4);
      if (!this._quiet) console.log(`[STRATEGY] hand-${candidates.length}: ${candidates.map((c) => c.cards.map((card) => card.display).join("")).join(", ")}`);
      for (const c of candidates) {
        const cardCount = c.cards?.length || 0;
        if ((teammateCount !== upCount && cardCount === upCount || teammateCount !== downCount && cardCount === downCount) && this._isMaxOutside(c, this._lastHand) !== 1) {
          if (cardCount === 5 && c.type === "TRIPLE_WITH_PAIR") {
            const split = this._splitTripleWithPair(c);
            if (split) {
              safe.push(split.triple);
              safe.push(split.pair);
              continue;
            }
          }
          fallback.push(c);
        } else {
          safe.push(c);
        }
      }
      if (!this._quiet) {
        console.log(`[STRATEGY] safe-${safe.length}: ${safe.map((c) => c.cards.map((card) => card.display).join("")).join(", ")}`);
        console.log(`[STRATEGY] fallback-${fallback.length}: ${fallback.map((c) => c.cards.map((card) => card.display).join("")).join(", ")}`);
      }
      if (upCount <= 8 && safe.length > 0) {
        const idx = this._findPreferredCandidate(safe, upCount);
        if (idx > 0) {
          const [toMove] = safe.splice(idx, 1);
          safe.unshift(toMove);
          if (!this._quiet) console.log(`[STRATEGY] \u4E0A${upCount}-${safe.length}: ${safe.map((c) => c.cards.map((card) => card.display).join("")).join(", ")}`);
        }
      }
      if (downCount <= 8 && safe.length > 0) {
        const idx = this._findPreferredCandidate(safe, downCount);
        if (idx > 0) {
          const [toMove] = safe.splice(idx, 1);
          safe.unshift(toMove);
          if (!this._quiet) console.log(`[STRATEGY] \u4E0B${downCount}-${safe.length}: ${safe.map((c) => c.cards.map((card) => card.display).join("")).join(", ")}`);
        }
      }
      if (teammateCount <= 5 && safe.length > 0) {
        const idx = this._findTeammateCandidate(safe, teammateCount);
        if (idx > 0) {
          const [toMove] = safe.splice(idx, 1);
          safe.unshift(toMove);
          if (!this._quiet) console.log(`[STRATEGY] \u961F${teammateCount}-${safe.length}: ${safe.map((c) => c.cards.map((card) => card.display).join("")).join(", ")}`);
        }
      }
      return safe.length > 0 ? safe : fallback;
    }
    /**
     * 将三带对候选拆成 三张 + 对子 两个候选
     * @param {Object} c - TRIPLE_WITH_PAIR 候选（cards 共5张）
     * @returns {{triple: Object, pair: Object} | null} 拆出的 TRIPLE 和 PAIR，结构非法时返回 null
     */
    _splitTripleWithPair(c) {
      const groups = {};
      for (const card of c.cards || []) {
        const v = card.value;
        (groups[v] = groups[v] || []).push(card);
      }
      const groupsArr = Object.values(groups);
      const tripleGroup = groupsArr.find((g) => g.length === 3);
      const pairGroup = groupsArr.find((g) => g.length === 2);
      if (!tripleGroup || !pairGroup) return null;
      return {
        triple: { type: "TRIPLE", cards: tripleGroup, main_value: calcMainValue("TRIPLE", tripleGroup) },
        pair: { type: "PAIR", cards: pairGroup, main_value: calcMainValue("PAIR", pairGroup) }
      };
    }
    /**
     * 在 safe 候选中找相对安全的牌（避免被对手余牌张数收走）
     * @param {Array} safe - 安全候选数组
     * @param {number} oppCount - 对手余牌数
     * @returns {number} 索引
     */
    _findPreferredCandidate(safe, oppCount) {
      for (let i = 0; i < safe.length; i++) {
        const type = safe[i].type || "";
        if (oppCount === 5 && (type === "PAIR" || type === "TRIPLE")) return i;
        if (oppCount === 8 && (type === "TRIPLE_WITH_PAIR" || type === "STRAIGHT")) return i;
      }
      return -1;
    }
    /**
     * 在 safe 候选中找送队友的牌
     * @param {Array} safe - 安全候选数组
     * @param {number} teammateCount - 队友余牌数
     * @returns {number} 索引
     */
    _findTeammateCandidate(safe, teammateCount) {
      for (let i = 0; i < safe.length; i++) {
        const cardCount = safe[i].cards?.length || 0;
        const type = safe[i].type || "";
        if (teammateCount === 1 && (type === "SINGLE" || type === "single")) return i;
        if (teammateCount === 2 && (type === "PAIR" || type === "pair")) return i;
        if (teammateCount === 3 && cardCount === 3) return i;
        if (teammateCount === 5 && (type === "TRIPLE_WITH_PAIR" || type === "STRAIGHT")) return i;
      }
      return -1;
    }
    _tryTripleWithPair(bestCandidate, rest) {
      if (bestCandidate.type !== "PAIR") return [bestCandidate, ...rest];
      const triples = rest.filter((c) => c.type === "TRIPLE");
      if (triples.length === 0) return [bestCandidate, ...rest];
      const minTriple = triples.reduce((prev, curr) => prev.main_value < curr.main_value ? prev : curr);
      const tripleWithPair = { type: "TRIPLE_WITH_PAIR", cards: [...minTriple.cards, ...bestCandidate.cards], main_value: minTriple.main_value };
      const othersFiltered = rest.filter((c) => c !== minTriple);
      const rearranged = [tripleWithPair, ...othersFiltered];
      rearranged.sort((a, b) => a.main_value - b.main_value || 0);
      return rearranged;
    }
    _findMinPairInRest(rest) {
      const pairs = rest.filter((c) => c.type === "PAIR");
      return pairs.length === 0 ? null : pairs.reduce((prev, curr) => prev.main_value < curr.main_value ? prev : curr);
    }
    _shouldPlayPair(minPair, rest) {
      let hasMediumCards = false;
      for (const cand of rest) {
        if (["BOMB", "FLUSH_STRAIGHT", "FOUR_JOKERS"].includes(cand.type)) continue;
        if (cand.type === "PAIR" && cand.main_value >= 12 || cand.type === "SINGLE") {
          hasMediumCards = true;
          break;
        }
      }
      return !hasMediumCards || minPair.main_value < 12;
    }
    _filterBeatCandidates(candidates, lastPlay, isTeammateTurn, quiet = false) {
      const lastType = lastPlay.type.toUpperCase();
      const lastMv = lastPlay.main_value || 0;
      const isLastBomb = ["BOMB", "FLUSH_STRAIGHT", "FOUR_JOKERS"].includes(lastType);
      const beatCandidates = [];
      this._bombSkipped = false;
      const lastPlayer = lastPlay?.player;
      const oppCards = lastPlayer != null && this.tracker ? this.tracker.getPlayerCount(lastPlayer) : 0;
      const myBombs = candidates.filter(
        (c) => c.type === "BOMB" || c.type === "FLUSH_STRAIGHT" || c.type === "FOUR_JOKERS"
      ).length;
      let maxAllowed = 5 + Math.max(0, myBombs - 1) * 8;
      if (lastPlayer === (this.position + 1) % 4) maxAllowed += 5;
      for (const cand of candidates) {
        const candType = (cand.type || "SINGLE").toUpperCase();
        const candMv = cand.main_value || 0;
        if (["BOMB", "FLUSH_STRAIGHT", "FOUR_JOKERS"].includes(candType)) {
          if (isTeammateTurn && this.tracker?.getPlayerCount(lastPlay.player) > 0) continue;
          if (isLastBomb) {
            if (oppCards > maxAllowed && candidates.length > 1) {
              if (!quiet && myBombs > 0 && beatCandidates.length == 0) {
                this._bombSkipped = true;
                console.log(`[BOMB_SKIP] [${this.position}#] ${myBombs} bomb(s), ${lastPlayer}#${oppCards} > ${maxAllowed}, skipbom`);
              }
            } else if (candMv > lastMv) {
              beatCandidates.push(cand);
            }
          }
        } else if (candType === lastType && candMv > lastMv) {
          beatCandidates.push(cand);
          continue;
        }
      }
      if (lastType === "TRIPLE_WITH_PAIR") {
        const allPairs = candidates.filter((c) => c.type === "PAIR");
        if (allPairs.length > 0) {
          const minPair = allPairs.reduce((prev, curr) => prev.main_value < curr.main_value ? prev : curr);
          if (minPair.main_value < 11) {
            candidates.filter((c) => c.type === "TRIPLE" && c.main_value > lastMv).forEach((triple) => {
              beatCandidates.push({ type: "TRIPLE_WITH_PAIR", cards: [...triple.cards, ...minPair.cards], main_value: triple.main_value });
            });
          }
        }
      }
      if (isTeammateTurn && this.tracker?.getPlayerCount(lastPlay.player) > 0) return beatCandidates;
      if (beatCandidates.length === 0 || beatCandidates.length === 1 && beatCandidates.some((c) => c.main_value >= 16)) {
        this._splitCandidates(candidates, lastType, lastMv, beatCandidates, quiet);
      }
      if (!isLastBomb) {
        if (lastPlayer === (this.position + 1) % 4) maxAllowed -= 3;
        if (oppCards > maxAllowed && candidates.length > 1) {
          if (!quiet && myBombs > 0 && beatCandidates.length == 0) {
            this._bombSkipped = true;
            console.log(`[BOMB_SKIP] [${this.position}#] ${myBombs} bomb(s), ${lastPlayer}#${oppCards} > ${maxAllowed}, skip`);
          }
        } else {
          for (const cand of candidates) {
            const candType = (cand.type || "SINGLE").toUpperCase();
            if (candType === "FOUR_JOKERS") {
              beatCandidates.push(cand);
              continue;
            }
            if (candType === "BOMB" || candType === "FLUSH_STRAIGHT") {
              if (!beatCandidates.some((bc) => bc.type === candType && bc.cards.some(
                (bcCard, i) => bcCard.value === cand.cards[i].value && bcCard.suit === cand.cards[i].suit
              ))) {
                beatCandidates.push(cand);
              }
            }
          }
        }
      }
      return beatCandidates;
    }
    /**
     * 拆牌候选生成：从已有候选中拆分出新牌型
     * @param {Array} candidates - 缓存候选列表
     * @param {string} lastType - 上家牌型（大写）
     * @param {number} lastMv - 上家 main_value
     * @param {Array} beatCandidates - 结果数组（push）
     */
    _splitCandidates(candidates, lastType, lastMv, beatCandidates, quiet) {
      const before = beatCandidates.length;
      switch (lastType) {
        case "SINGLE":
          this._splitForSingle(candidates, lastMv, beatCandidates);
          break;
        case "PAIR":
          this._splitForPair(candidates, lastMv, beatCandidates);
          break;
        case "TRIPLE":
          this._splitForTriple(candidates, lastMv, beatCandidates);
          break;
        case "TRIPLE_WITH_PAIR":
          this._splitForTripleWithPair(candidates, lastMv, beatCandidates);
          break;
      }
      const added = beatCandidates.slice(before);
      if (added.length > 0 && !quiet) {
        console.log(`[STRATEGY] \u62C6\u724C: ${lastType} ${added.map((c) => c.cards.map((card) => card.display).join("")).join(", ")}`);
      }
    }
    /**
     * SINGLE 被压：从 PAIR/TRIPLE（J+ / 级牌 / 王）拆 1 张 → SINGLE
     */
    _splitForSingle(candidates, lastMv, beatCandidates) {
      const highCands = candidates.filter(
        (c) => ["PAIR", "TRIPLE"].includes(c.type) && this._isHighCardType(c.main_value)
      );
      for (const c of highCands) {
        const singleCards = [c.cards[0]];
        const mv = calcMainValue("SINGLE", singleCards);
        if (mv > lastMv) {
          beatCandidates.push({ type: "SINGLE", cards: singleCards, main_value: mv });
        }
      }
    }
    /**
     * PAIR 被压：按优先级拆牌
     * 1. 含 WILD 的 TRIPLE → 拆 2 张 → PAIR
     * 2. THREE_PAIRS → 拆开后所有 PAIR 入候选
     * 3. 通用：TRIPLE（J+）→ 拆 2 张 → PAIR
     */
    _splitForPair(candidates, lastMv, beatCandidates) {
      const wildTriples = candidates.filter(
        (c) => c.type === "TRIPLE" && c.cards.some(isWildCard) && this._isHighCardType(c.main_value)
      );
      for (const t of wildTriples) {
        this._addSplitPair(t.cards, lastMv, beatCandidates);
      }
      const threePairs = candidates.filter((c) => c.type === "THREE_PAIRS");
      for (const tp of threePairs) {
        this._extractPairsFromThreePairs(tp.cards, lastMv, beatCandidates);
      }
      const allCands = candidates.filter(
        (c) => ["TRIPLE"].includes(c.type) && this._isHighCardType(c.main_value)
      );
      for (const c of allCands) {
        this._addSplitPair(c.cards, lastMv, beatCandidates);
      }
    }
    /**
     * 从 BOMB/TRIPLE 的 cards 中拆 2 张 → PAIR
     */
    _addSplitPair(cards, lastMv, beatCandidates) {
      const pairCards = cards.slice(0, 2);
      const mv = calcMainValue("PAIR", pairCards);
      if (mv > lastMv) {
        beatCandidates.push({ type: "PAIR", cards: pairCards, main_value: mv, _split: true });
      }
    }
    /**
     * 从 THREE_PAIRS 的 6 张牌中提取所有 PAIR（每 2 张一组）
     */
    _extractPairsFromThreePairs(cards, lastMv, beatCandidates) {
      for (let i = 0; i <= cards.length - 2; i += 2) {
        const pairCards = cards.slice(i, i + 2);
        const mv = calcMainValue("PAIR", pairCards);
        if (mv > lastMv) {
          beatCandidates.push({ type: "PAIR", cards: pairCards, main_value: mv, _split: true });
        }
      }
    }
    /**
     * TRIPLE 被压：按优先级拆牌
     * 1. 含 WILD 的 BOMB → 拆 3 张 → TRIPLE
     * 2. TWO_TRIPLES → 拆 3 张 → TRIPLE
     * 3. 级牌 → 拆 3 张 → TRIPLE
     */
    _splitForTriple(candidates, lastMv, beatCandidates) {
      const wildBombs = candidates.filter(
        (c) => c.type === "BOMB" && c.cards.some(isWildCard) && this._isHighCardType(c.main_value)
      );
      for (const b of wildBombs) {
        this._addSplitTriple(b.cards, lastMv, beatCandidates);
      }
      const twoTriples = candidates.filter((c) => c.type === "TWO_TRIPLES");
      for (const tt of twoTriples) {
        this._addSplitTriple(tt.cards.slice(0, 3), lastMv, beatCandidates);
        this._addSplitTriple(tt.cards.slice(3, 6), lastMv, beatCandidates);
      }
      const levelCards = candidates.filter(
        (c) => this._isLevelCardCandidate(c) && c.cards.length >= 3
      );
      for (const c of levelCards) {
        this._addSplitTriple(c.cards.slice(0, 3), lastMv, beatCandidates);
      }
    }
    /**
     * 从 cards 中拆 3 张 → TRIPLE
     */
    _addSplitTriple(cards, lastMv, beatCandidates) {
      const tripleCards = cards.slice(0, 3);
      const mv = calcMainValue("TRIPLE", tripleCards);
      if (mv > lastMv) {
        beatCandidates.push({ type: "TRIPLE", cards: tripleCards, main_value: mv, _split: true });
      }
    }
    /**
     * TRIPLE_WITH_PAIR 被压：拆 TRIPLE + 配最小 PAIR
     */
    _splitForTripleWithPair(candidates, lastMv, beatCandidates) {
      const allPairs = candidates.filter((c) => c.type === "PAIR");
      if (allPairs.length === 0) return;
      const minPair = allPairs.reduce(
        (prev, curr) => prev.main_value < curr.main_value ? prev : curr
      );
      if (minPair.main_value >= 11) return;
      const wildBombs = candidates.filter(
        (c) => c.type === "BOMB" && c.cards.some(isWildCard) && this._isHighCardType(c.main_value)
      );
      for (const b of wildBombs) {
        const tripleCards = b.cards.slice(0, 3);
        const mv = calcMainValue("TRIPLE", tripleCards);
        if (mv > lastMv) {
          beatCandidates.push({
            type: "TRIPLE_WITH_PAIR",
            cards: [...tripleCards, ...minPair.cards],
            main_value: mv
          });
        }
      }
      const twoTriples = candidates.filter((c) => c.type === "TWO_TRIPLES");
      for (const tt of twoTriples) {
        for (let start = 0; start <= 3; start += 3) {
          const tripleCards = tt.cards.slice(start, start + 3);
          if (tripleCards.length < 3) continue;
          const mv = calcMainValue("TRIPLE", tripleCards);
          if (mv > lastMv) {
            beatCandidates.push({
              type: "TRIPLE_WITH_PAIR",
              cards: [...tripleCards, ...minPair.cards],
              main_value: mv
            });
          }
        }
      }
      const levelCards = candidates.filter(
        (c) => this._isLevelCardCandidate(c) && c.cards.length >= 3
      );
      for (const c of levelCards) {
        const tripleCards = c.cards.slice(0, 3);
        const mv = calcMainValue("TRIPLE", tripleCards);
        if (mv > lastMv) {
          beatCandidates.push({
            type: "TRIPLE_WITH_PAIR",
            cards: [...tripleCards, ...minPair.cards],
            main_value: mv
          });
        }
      }
    }
    /**
     * 判断牌值是否属于高牌（J / Q / K / A / 级牌）
     */
    _isHighCardType(mainValue) {
      return mainValue >= 11;
    }
    /**
     * 判断一张牌是否是级牌
     */
    _isLevelCard(card) {
      return card.level_value === 15 || card.value === 15;
    }
    /**
     * 判断候选的 cards 是否全是级牌
     */
    _isLevelCardCandidate(c) {
      if (!Array.isArray(c.cards)) return false;
      return c.cards.every((card) => card.level_value === 15 || card.value === 15);
    }
    _chooseBeatFromCached(candidates, hand) {
      if (candidates.length === 0) return { action: "pass", cards: [], type: "" };
      const scored = candidates.map((cand) => {
        const remainingCandidates = this.analyzer.getRemainingCandidates(candidates, cand, hand);
        const score = this.scorer.scoreBeatChoice(cand, remainingCandidates, hand.length);
        return { score, cand };
      });
      scored.sort((a, b) => b.score - a.score);
      return { action: "play", cards: scored[0].cand.cards, type: scored[0].cand.type };
    }
    async _chooseBeatPlay(hand, lastPlay, isTeammateTurn) {
      const rawCandidates = await this.analyzer.generateCandidates(hand, lastPlay);
      if (!rawCandidates || rawCandidates.length === 0) return { action: "pass", cards: [], type: "" };
      const candidates = this._filterBeatCandidates(rawCandidates, lastPlay, isTeammateTurn);
      if (candidates.length === 0) return { action: "pass", cards: [], type: "" };
      const scored = await Promise.all(candidates.map(async (cand) => {
        const remainingHand = this.analyzer.applyPlay(hand, cand.cards);
        const remainingGroups = await this._buildCandidatesFromHand(remainingHand);
        const score = this.scorer.scoreBeatChoice(cand, remainingGroups, hand.length);
        return { score, cand };
      }));
      scored.sort((a, b) => b.score - a.score);
      return { action: "play", cards: scored[0].cand.cards, type: scored[0].cand.type };
    }
    _formatCard(card) {
      if (!card) return "?";
      const suitMap = { "SPADE": "\u2660", "HEART": "\u2665", "DIAMOND": "\u2666", "CLUB": "\u2663", "JOKER": "\u{1F0CF}" };
      const rankMap = { 14: "A", 15: "2", 13: "K", 12: "Q", 11: "J", 10: "10", 9: "9", 8: "8", 7: "7", 6: "6", 5: "5", 4: "4", 3: "3", 2: "2" };
      const suit = suitMap[card.suit] || card.suit;
      const rank = card.display?.replace(/[♠♥♦♣🃏]/g, "") || rankMap[card.value] || String(card.value);
      return `${suit}${rank}`;
    }
    _typeLabel(type) {
      const map = { SINGLE: "\u5355\u5F20", PAIR: "\u5BF9\u5B50", TRIPLE: "\u4E09\u5F20", TRIPLE_WITH_PAIR: "\u4E09\u5E26", STRAIGHT: "\u987A\u5B50", FLUSH_STRAIGHT: "\u540C\u82B1", BOMB: "\u70B8\u5F39", THREE_PAIRS: "\u4E09\u8FDE", TWO_TRIPLES: "\u4E09\u540C", FOUR_JOKERS: "\u5929\u738B", WILD: "\u4E07\u80FD" };
      return map[type] || type;
    }
    _printCandidates(candidates, handSize, hand) {
      const groups = {};
      for (const cand of candidates) {
        const type = this._typeLabel(cand.type || "SINGLE");
        const cardStr = (cand.cards || []).map((c) => this._formatCard(c)).join(" ");
        if (!groups[type]) groups[type] = [];
        groups[type].push(cardStr);
      }
      if (!this._quiet) {
        console.log(`[GROUP] ${handSize}\u5F20 ${candidates.length}\u624B`);
        const order = ["\u5355\u5F20", "\u5BF9\u5B50", "\u4E09\u5F20", "\u4E09\u5E26", "\u4E09\u8FDE", "\u4E09\u540C", "\u987A\u5B50", "\u540C\u82B1", "\u70B8\u5F39", "\u4E07\u80FD", "\u5929\u738B"];
        for (const label of order) {
          if (groups[label]) console.log(`  \u3010${label}\u3011(${groups[label].length}\u624B): ${groups[label].join(" | ")}`);
        }
      }
    }
    _lastPlayContainsBigCards(lastPlay) {
      if (!lastPlay) return false;
      for (const card of lastPlay.cards) {
        if (card.value >= 16) return true;
      }
      return lastPlay.cards.every((card) => card.level_value >= 14);
    }
    /**
     * 判断队友出的牌在外面是否同类型最大，或自己手里有绝对最大的同类型牌可以接回
     * 牌值顺序：2<3<4<5<6<7<8<9<10<J<Q<K<A
     * @returns {number} 0=外面有更大的且自己接不回, 1=外面没有更大的, 2=外面有更大的但自己能接回
     */
    _isLastPlayMaxOutside(lastPlay, myHand) {
      if (!this.tracker || !lastPlay) return 0;
      const myHandCount = {};
      for (const card of myHand) {
        const v = card.level_value || card.value;
        myHandCount[v] = (myHandCount[v] || 0) + 1;
      }
      return this._extractIsMaxLogic(
        lastPlay.type,
        lastPlay.cards,
        lastPlay.main_value,
        myHandCount
      );
    }
    /**
     * 队友已头游时，判断是出牌还是跟风 PASS
     *
     * 四条规则（按优先级）：
     * 1. 接了刚好自己出完 → 接（直接二游）
     * 2. 队友牌非最大 + 下家余牌匹配 → 接（防放跑）
     * 3. 候选牌外面没有更大的了 → 留着（王牌，后面压对手）
     * 4. 候选牌外面还有更大的，且（牌值小 或 这种牌型就这一手）→ 顺掉
     *
     * @param {Array} candidates - 能压牌的候选列表
     * @param {Object} lastPlay - 队友打出的牌局
     * @param {Array} hand - 当前手牌
     * @returns {boolean} true = PASS 跟风，false = 出牌
     */
    _shouldHoldForFollowWind(candidates, lastPlay, hand) {
      if (!lastPlay || !this.tracker || !candidates || candidates.length === 0) return false;
      const teammatePos = this.position ^ 2;
      if (this.tracker.getPlayerCount(teammatePos) !== 0) return false;
      const nextPlayerPos = (this.position + 1) % 4;
      const nextPlayerCount = this.tracker.getPlayerCount(nextPlayerPos);
      if (nextPlayerCount < lastPlay.cards.length && nextPlayerCount < 4)
        return true;
      const scored = candidates.map((cand) => {
        const remainingCandidates = this.analyzer.getRemainingCandidates(candidates, cand, hand);
        const score = this.scorer.scoreBeatChoice(cand, remainingCandidates, hand.length);
        return { score, cand };
      }).sort((a, b) => b.score - a.score);
      const bestCand = scored[0].cand;
      const candCardCount = bestCand.cards?.length || 0;
      const candType = (bestCand.type || "").toUpperCase();
      const candMainValue = bestCand.main_value || 0;
      const myHandCount = {};
      for (const card of hand) {
        const v = card.level_value || card.value;
        myHandCount[v] = (myHandCount[v] || 0) + 1;
      }
      if (candCardCount === hand.length) return false;
      if (candType === "BOMB" || candType === "FLUSH_STRAIGHT" || candType === "FOUR_JOKERS")
        return true;
      const lastPlayCount = lastPlay.cards?.length || 0;
      const teammateMaxResult = this._extractIsMaxLogic(
        lastPlay.type,
        lastPlay.cards,
        lastPlay.main_value,
        myHandCount
      );
      const isTeammateMax = teammateMaxResult === 1;
      if (!isTeammateMax && (nextPlayerCount === lastPlayCount || nextPlayerCount === candCardCount)) {
        return false;
      }
      const maxResult = this._extractIsMaxLogic(
        bestCand.type,
        bestCand.cards,
        candMainValue,
        myHandCount
      );
      const hasBiggerOutside = maxResult === 0 || maxResult === 2;
      if (!hasBiggerOutside) return true;
      const sameTypeCount = candidates.filter(
        (c) => (c.type || "").toUpperCase() === candType
      ).length;
      const isSmall = candMainValue <= 10;
      const isOnlyHand = sameTypeCount <= 1;
      if (isSmall || isOnlyHand) return false;
      return true;
    }
    /**
     * 核心牌型"外面是否最大"判断
     * @returns {number} 0=外面有更大的且自己接不回, 1=外面没有更大的, 2=外面有更大的但自己能接回，3=炸弹
     */
    _extractIsMaxLogic(type, cards, mainValue, myHandCount) {
      type = (type || "").toUpperCase();
      if (type === "FOUR_JOKERS" || type === "FLUSH_STRAIGHT" || type === "BOMB") return 3;
      if (type === "PAIR") {
        return this._checkSimpleMax(mainValue, myHandCount, 2);
      }
      if (type === "TRIPLE") {
        return this._checkSimpleMax(mainValue, myHandCount, 3);
      }
      if (type === "SINGLE") {
        return this._checkSimpleMax(mainValue, myHandCount, 1);
      }
      if (type === "TRIPLE_WITH_PAIR") {
        const count = {};
        for (const c of cards) {
          const v = c.level_value || c.value;
          count[v] = (count[v] || 0) + 1;
        }
        let tripleValue = 0;
        for (const v in count) {
          if (count[v] >= 3) {
            tripleValue = Number(v);
            break;
          }
        }
        return this._checkSimpleMax(tripleValue, myHandCount, 3);
      }
      if (type === "STRAIGHT") {
        return this._checkSequentialMax(cards, cards.length, 10, 5, myHandCount, 1);
      }
      if (type === "THREE_PAIRS") {
        return this._checkSequentialMax(cards, 3, 12, 3, myHandCount, 2);
      }
      if (type === "TWO_TRIPLES") {
        return this._checkSequentialMax(cards, 2, 13, 2, myHandCount, 3);
      }
      return 0;
    }
    /**
     * 简单牌型（单/对/三/三带）：检查外面是否有更大的，有则检查自己是否有绝对最大的
     * @param {number} requiredCount 外面需要凑够几张同值牌才算有更大的
     * @returns {number} 0=外面有更大的且自己接不回, 1=外面没有更大的, 2=外面有更大的但自己能接回
     */
    _checkSimpleMax(mainValue, myHandCount, requiredCount) {
      if (!this._outsideByLevelValue) {
        this._outsideByLevelValue = {};
        for (let v = 2; v <= 17; v++) {
          const lv = v;
          this._outsideByLevelValue[lv] = (this._outsideByLevelValue[lv] || 0) + (this.tracker.remaining[v] || 0);
        }
        const lcv = this.tracker.levelCardValue || 2;
        if (lcv >= 2 && lcv <= 14) {
          const count = this.tracker.remaining[lcv] || 0;
          this._outsideByLevelValue[lcv] = (this._outsideByLevelValue[lcv] || 0) - count;
          this._outsideByLevelValue[15] = (this._outsideByLevelValue[15] || 0) + count;
        }
      }
      const outside = this._outsideByLevelValue;
      for (let v = mainValue + 1; v <= 17; v++) {
        if ((outside[v] || 0) - (myHandCount[v] || 0) >= requiredCount) {
          for (let v2 = 17; v2 > v; v2--) {
            if ((myHandCount[v2] || 0) >= requiredCount) {
              for (let v3 = v2 + 1; v3 <= 17; v3++) {
                if ((outside[v3] || 0) - (myHandCount[v3] || 0) >= requiredCount) {
                  return 0;
                }
              }
              return 2;
            }
          }
          return 0;
        }
      }
      return 1;
    }
    /**
     * 连续牌型（顺子/三连对/三同连张）：检查外面是否有更大的同类
     * @returns {number} 0=外面有更大的且自己接不回, 1=外面没有更大的, 2=外面有更大的但自己能接回
     */
    _checkSequentialMax(cards, groupCount, maxStart, groupLength, myHandCount, requiredPerGroup) {
      const getValue = (c) => {
        if (c.value === 14) return 1;
        if (c.value === 2) return 2;
        return c.value;
      };
      const sorted = [...cards].sort((a, b) => getValue(a) - getValue(b));
      const minSortVal = getValue(sorted[0]);
      if (groupLength === 5 && minSortVal === 10) return 1;
      if (groupLength === 3 && minSortVal === 12) return 1;
      if (groupLength === 2 && minSortVal === 13) return 1;
      let hasBiggerOutside = false;
      for (let start = minSortVal + 1; start <= maxStart; start++) {
        let canForm = true;
        for (let i = 0; i < groupLength; i++) {
          let needed = start + i;
          if (needed === 1) needed = 14;
          else if (needed === 2) needed = 2;
          else if (needed > maxStart) {
            canForm = false;
            break;
          }
          if (this.tracker.remaining[needed] - myHandCount[needed] < groupCount) {
            canForm = false;
            break;
          }
        }
        if (canForm) {
          hasBiggerOutside = true;
          break;
        }
      }
      if (!hasBiggerOutside) return 1;
      let w = 0;
      let outsideStart = -1;
      for (let v = 14; v >= 1; v--) {
        if ((this.tracker.remaining[v] || 0) - (myHandCount[v] || 0) >= requiredPerGroup) {
          w++;
        } else {
          w = 0;
        }
        if (w === groupLength) {
          outsideStart = v;
          break;
        }
      }
      if (outsideStart === -1) return 0;
      for (let start = outsideStart + 1; start <= maxStart; start++) {
        let canForm = true;
        for (let i = 0; i < groupLength; i++) {
          let needed = start + i;
          if (needed > maxStart) {
            canForm = false;
            break;
          }
          if ((myHandCount[needed] || 0) < requiredPerGroup) {
            canForm = false;
            break;
          }
        }
        if (canForm) return 2;
      }
      return 0;
    }
    /**
     * 判断手牌中某 candidate 在外面是否最大（仅记牌判断，不含放跑逻辑）
     * @returns {number} 0=外面有更大的且自己接不回, 1=外面没有更大的, 2=外面有更大的但自己能接回
     */
    _isMaxOutside(candidate, myHand) {
      if (!this.tracker) return 0;
      const myHandCount = {};
      for (const card of myHand) {
        const v = card.level_value || card.value;
        myHandCount[v] = (myHandCount[v] || 0) + 1;
      }
      return this._extractIsMaxLogic(
        candidate.type,
        candidate.cards,
        candidate.main_value,
        myHandCount
      );
    }
    /**
     * 合并 candidates：TRIPLE+PAIR→TRIPLE_WITH_PAIR，连续TRIPLE→TWO_TRIPLES，连续PAIR→THREE_PAIRS
     * @param {Array} candidates - 候选牌列表
     * @returns {Array} 合并后的候选牌列表
     */
    _mergeCandidates(candidates) {
      const merged = [...candidates];
      const triples = merged.filter((c) => c.type === "TRIPLE" && !c._split);
      const pairs = merged.filter((c) => c.type === "PAIR" && !c._split);
      if (triples.length > 0 && pairs.length > 0) {
        const minTriple = triples.reduce((prev, curr) => prev.main_value < curr.main_value ? prev : curr);
        const minPair = pairs.reduce((prev, curr) => prev.main_value < curr.main_value ? prev : curr);
        const tripleIdx = merged.indexOf(minTriple);
        const pairIdx = merged.indexOf(minPair);
        if (tripleIdx >= 0 && pairIdx >= 0) {
          const [a, b] = [tripleIdx, pairIdx].sort((x, y) => y - x);
          merged.splice(a, 1);
          merged.splice(b, 1);
          merged.push({
            type: "TRIPLE_WITH_PAIR",
            cards: [...minTriple.cards, ...minPair.cards],
            main_value: minTriple.main_value
          });
          return this._mergeCandidates(merged);
        }
      }
      const currentTriples = merged.filter((c) => c.type === "TRIPLE" && !c._split);
      if (currentTriples.length >= 2) {
        currentTriples.sort((a, b) => a.cards[0].value - b.cards[0].value || a.main_value - b.main_value);
        for (let i = 0; i < currentTriples.length - 1; i++) {
          if (currentTriples[i].cards[0].value + 1 === currentTriples[i + 1].cards[0].value) {
            const t1 = currentTriples[i];
            const t2 = currentTriples[i + 1];
            const idx1 = merged.indexOf(t1);
            const idx2 = merged.indexOf(t2);
            if (idx1 >= 0 && idx2 >= 0) {
              const [a, b] = [idx1, idx2].sort((x, y) => y - x);
              merged.splice(a, 1);
              merged.splice(b, 1);
              merged.push({
                type: "TWO_TRIPLES",
                cards: [...t1.cards, ...t2.cards],
                main_value: calcMainValue("TWO_TRIPLES", [...t1.cards, ...t2.cards])
              });
              return this._mergeCandidates(merged);
            }
          }
        }
      }
      const currentPairs = merged.filter((c) => c.type === "PAIR" && !c._split);
      if (currentPairs.length >= 3) {
        currentPairs.sort((a, b) => a.cards[0].value - b.cards[0].value || a.main_value - b.main_value);
        for (let i = 0; i <= currentPairs.length - 3; i++) {
          if (currentPairs[i].cards[0].value + 1 === currentPairs[i + 1].cards[0].value && currentPairs[i + 1].cards[0].value + 1 === currentPairs[i + 2].cards[0].value) {
            const p1 = currentPairs[i];
            const p2 = currentPairs[i + 1];
            const p3 = currentPairs[i + 2];
            const idx1 = merged.indexOf(p1);
            const idx2 = merged.indexOf(p2);
            const idx3 = merged.indexOf(p3);
            if (idx1 >= 0 && idx2 >= 0 && idx3 >= 0) {
              const indices = [idx1, idx2, idx3].sort((a, b) => b - a);
              for (const idx of indices) merged.splice(idx, 1);
              merged.push({
                type: "THREE_PAIRS",
                cards: [...p1.cards, ...p2.cards, ...p3.cards],
                main_value: calcMainValue("THREE_PAIRS", [...p1.cards, ...p2.cards, ...p3.cards])
              });
              return this._mergeCandidates(merged);
            }
          }
        }
      }
      return merged;
    }
    /**
     * 送队友：当队友余牌数 <=2 时，尝试找合适的牌送走队友
     * @param {Array} candidates - 候选牌列表
     * @param {Array} hand - 当前手牌
     * @param {number} teammateCount - 队友余牌数
     * @returns {Object|null} 找到则返回 {cards, type}，否则返回 null
     */
    _trySendTeammate(candidates, hand, teammateCount) {
      if (!this.tracker || teammateCount > 2) return null;
      if (teammateCount === 1) {
        return this._trySendSingle(candidates, hand);
      }
      if (teammateCount === 2) {
        return this._trySendPair(candidates, hand);
      }
      return null;
    }
    /**
     * 送队友单张：找 SINGLE 候选，或拆牌出单张
     */
    _trySendSingle(candidates, hand) {
      const singles = candidates.filter((c) => c.type === "SINGLE");
      for (const s of singles) {
        if (this._isMaxOutside(s, hand) === 0) {
          return { cards: s.cards, type: s.type };
        }
      }
      const split = this._splitMinSingle(hand);
      if (split) {
        const fakeCandidate = { type: "SINGLE", cards: [split.card], main_value: split.card.value };
        if (this._isMaxOutside(fakeCandidate, hand) === 0) {
          console.log(`[SEND_TEAMMATE] [${this.position}#] \u62C6\u5355\u5F20: ${this._formatCard(split.card)}`);
          return { cards: [split.card], type: "SINGLE" };
        }
      }
      return null;
    }
    /**
     * 送队友对子：找 PAIR 候选，或拆牌出对子
     */
    _trySendPair(candidates, hand) {
      const pairs = candidates.filter((c) => c.type === "PAIR");
      for (const p of pairs) {
        if (this._isMaxOutside(p, hand) === 0) {
          return { cards: p.cards, type: p.type };
        }
      }
      const split = this._splitMinPair(hand);
      if (split) {
        const fakeCandidate = { type: "PAIR", cards: split.cards, main_value: split.cards[0].value };
        if (this._isMaxOutside(fakeCandidate, hand) === 0) {
          console.log(`[SEND_TEAMMATE] [${this.position}#] \u62C6\u5BF9\u5B50: ${split.cards.map((c) => this._formatCard(c)).join(" ")}`);
          return { cards: split.cards, type: "PAIR" };
        }
      }
      return null;
    }
    /**
     * 拆最小单张：从对子或三同张中拆出一张最小的牌
     * @returns {{card: Object, remaining: Object[]} | null} 拆出的牌和剩余手牌
     */
    _splitMinSingle(hand) {
      const countMap = {};
      for (const c of hand) {
        const v = c.level_value || c.value;
        if (!countMap[v]) countMap[v] = [];
        countMap[v].push(c);
      }
      const sortedValues = Object.keys(countMap).map(Number).sort((a, b) => a - b);
      for (const v of sortedValues) {
        if (countMap[v].length >= 2) {
          return { card: countMap[v][0], remaining: hand.filter((c) => c !== countMap[v][0]) };
        }
      }
      return null;
    }
    /**
     * 拆最小对子：从手牌中找最小的对子拆出来
     * @returns {{cards: Object[], remaining: Object[]} | null}
     */
    _splitMinPair(hand) {
      const countMap = {};
      for (const c of hand) {
        const v = c.level_value || c.value;
        if (!countMap[v]) countMap[v] = [];
        countMap[v].push(c);
      }
      const sortedValues = Object.keys(countMap).map(Number).sort((a, b) => a - b);
      for (const v of sortedValues) {
        if (countMap[v].length >= 2) {
          const cards = countMap[v].slice(0, 2);
          const remaining = hand.filter((c) => c !== cards[0] && c !== cards[1]);
          return { cards, remaining };
        }
      }
      return null;
    }
    _fallbackPlaySingle(hand) {
      if (hand.length === 0) return { action: "pass", cards: [], type: "" };
      const minCard = [...hand].sort((a, b) => (a.level_value || a.value) - (b.level_value || b.value))[0];
      return { action: "play", cards: [minCard], type: "SINGLE" };
    }
  };

  // guandan/src/game-engine/tribute.js
  function getEligibleTributeCards(hand) {
    if (!hand || hand.length === 0) return [];
    const nonWild = hand.filter((c) => !isWildCard(c));
    const wilds = hand.filter((c) => isWildCard(c));
    if (nonWild.length > 0) {
      const sorted = sortCards(nonWild);
      const maxValue = sorted[0].value;
      const maxCards = nonWild.filter((c) => c.value === maxValue);
      return sortCards(maxCards);
    }
    if (wilds.length > 0) {
      const sorted = sortCards(wilds);
      const maxValue = sorted[0].value;
      const maxCards = wilds.filter((c) => c.value === maxValue);
      return sortCards(maxCards);
    }
    return [];
  }
  function validateTributeSelection(hand, card) {
    if (!hand || hand.length === 0) {
      return { valid: false, reason: "\u624B\u724C\u4E3A\u7A7A" };
    }
    if (!card) {
      return { valid: false, reason: "\u672A\u9009\u62E9\u724C" };
    }
    const inHand = hand.find((c) => c.value === card.value && c.suit === card.suit);
    if (!inHand) {
      return { valid: false, reason: "\u9009\u4E2D\u7684\u724C\u4E0D\u5728\u624B\u724C\u4E2D" };
    }
    const eligible = getEligibleTributeCards(hand);
    if (eligible.length === 0) {
      return { valid: false, reason: "\u6CA1\u6709\u53EF\u9009\u7684\u8FDB\u8D21\u724C" };
    }
    const nonWild = hand.filter((c) => !isWildCard(c));
    if (nonWild.length > 0 && isWildCard(card)) {
      return { valid: false, reason: "\u4E0D\u80FD\u8FDB\u8D21\u4E07\u80FD\u724C\uFF08\u7EA2\u6843\u7EA7\u724C\uFF09\uFF0C\u8BF7\u9009\u62E9\u5176\u4ED6\u6700\u5927\u724C" };
    }
    return { valid: true };
  }
  function getEligibleReturnCards(hand) {
    if (!hand || hand.length === 0) return [];
    const eligibleCards = hand.filter(
      (c) => c.value <= 10 && c.level_value !== 15
    );
    return sortCardsAsc(eligibleCards);
  }
  function validateReturnSelection(hand, card) {
    if (!hand || hand.length === 0) {
      return { valid: false, reason: "\u624B\u724C\u4E3A\u7A7A" };
    }
    if (!card) {
      return { valid: false, reason: "\u672A\u9009\u62E9\u724C" };
    }
    const inHand = hand.find((c) => c.value === card.value && c.suit === card.suit);
    if (!inHand) {
      return { valid: false, reason: "\u9009\u4E2D\u7684\u724C\u4E0D\u5728\u624B\u724C\u4E2D" };
    }
    if (card.level_value === 15) {
      return { valid: false, reason: "\u7EA7\u724C\u4E0D\u80FD\u8FD8\u8D21" };
    }
    if (card.value > 10) {
      return { valid: false, reason: "\u8FD8\u8D21\u724C\u5FC5\u987B\u5C0F\u4E8E\u7B49\u4E8E10\uFF08\u4E14\u975E\u7EA7\u724C\uFF09" };
    }
    return { valid: true };
  }
  function calculateTribute(finishOrder, level, hands) {
    if (!finishOrder || finishOrder.length < 4) {
      return { tributes: [], isDoubleDown: false, tributeHasTwoBigJokers: /* @__PURE__ */ new Map() };
    }
    const first = finishOrder[0];
    const second = finishOrder[1];
    const third = finishOrder[2];
    const fourth = finishOrder[3];
    const isDoubleDown = first % 2 === second % 2;
    const tributes = [];
    if (isDoubleDown) {
      tributes.push({ from: fourth, to: first });
      tributes.push({ from: third, to: second });
    } else {
      tributes.push({ from: fourth, to: first });
    }
    const tributeHasTwoBigJokers = /* @__PURE__ */ new Map();
    const tributeBigJokerCounts = /* @__PURE__ */ new Map();
    for (const tribute of tributes) {
      const { from } = tribute;
      const hand = hands[from];
      if (hand) {
        const bigJokerCount = hand.filter((c) => c.value === 17).length;
        tributeBigJokerCounts.set(from, bigJokerCount);
      }
    }
    if (!isDoubleDown) {
      for (const tribute of tributes) {
        const { from } = tribute;
        tributeHasTwoBigJokers.set(from, (tributeBigJokerCounts.get(from) || 0) >= 2);
      }
    } else {
      const total = (tributeBigJokerCounts.get(third) || 0) + (tributeBigJokerCounts.get(fourth) || 0);
      tributeHasTwoBigJokers.set(third, total >= 2);
      tributeHasTwoBigJokers.set(fourth, total >= 2);
    }
    return { tributes, isDoubleDown, tributeHasTwoBigJokers, tributeBigJokerCounts };
  }
  function selectTributeCard(hand) {
    if (!hand || hand.length === 0) return null;
    const nonWild = hand.filter((c) => !isWildCard(c));
    const wilds = hand.filter((c) => isWildCard(c));
    if (nonWild.length > 0) {
      const sorted = sortCards(nonWild);
      return sorted[0];
    }
    if (wilds.length > 0) {
      const sorted = sortCards(wilds);
      return sorted[0];
    }
    return null;
  }
  function selectReturnCard(hand) {
    if (!hand || hand.length === 0) return null;
    const eligibleCards = hand.filter(
      (c) => c.value <= 10 && c.level_value !== 15
    );
    if (eligibleCards.length === 0) {
      return sortCards(hand)[0];
    }
    const groups = groupOther(hand);
    const protectedCards = /* @__PURE__ */ new Set();
    for (const group of groups) {
      const type = group.type;
      if (["BOMB", "THREE_PAIRS", "TWO_TRIPLES", "STRAIGHT", "FLUSH_STRAIGHT"].includes(type)) {
        for (const card of group.cards) {
          protectedCards.add(`${card.value}:${card.suit}`);
        }
      }
    }
    const singleGroups = groups.filter((g) => g.type === "SINGLE");
    const trueSingles = singleGroups.filter((g) => {
      const card = g.cards[0];
      const key = `${card.value}:${card.suit}`;
      return !protectedCards.has(key);
    });
    if (trueSingles.length > 0) {
      const sorted = trueSingles.sort((a, b) => {
        const va = a.cards[0].level_value ?? a.cards[0].value;
        const vb = b.cards[0].level_value ?? b.cards[0].value;
        return va - vb;
      });
      return sorted[0].cards[0];
    }
    const pairGroups = groups.filter((g) => g.type === "PAIR");
    const safePairs = pairGroups;
    if (safePairs.length > 0) {
      const sorted = safePairs.sort((a, b) => {
        const va = a.cards[0].level_value ?? a.cards[0].value;
        const vb = b.cards[0].level_value ?? b.cards[0].value;
        return va - vb;
      });
      return sorted[0].cards[0];
    }
    const tripleGroups = groups.filter((g) => g.type === "TRIPLE");
    const safeTriples = tripleGroups;
    if (safeTriples.length > 0) {
      const sorted = safeTriples.sort((a, b) => {
        const va = a.cards[0].level_value ?? a.cards[0].value;
        const vb = b.cards[0].level_value ?? b.cards[0].value;
        return va - vb;
      });
      return sorted[0].cards[0];
    }
    const nonBombGroups = groups.filter(
      (g) => !["BOMB", "THREE_PAIRS", "TWO_TRIPLES", "FOUR_JOKERS"].includes(g.type)
    );
    const nonStraightCards = [];
    for (const group of nonBombGroups) {
      for (const card of group.cards) {
        nonStraightCards.push(card);
      }
    }
    if (nonStraightCards.length > 0) {
      return nonStraightCards.sort((a, b) => {
        const va = a.level_value ?? a.value;
        const vb = b.level_value ?? b.value;
        return va - vb;
      })[0];
    }
    return sortCards(eligibleCards)[0];
  }
  function executeTribute(game2, tributeState) {
    if (!tributeState || !tributeState.tributes || tributeState.tributes.length === 0) {
      return { tributes: [], returnTributes: [], success: false };
    }
    const result = {
      tributes: [],
      returnTributes: [],
      success: true
    };
    const tributeCards = /* @__PURE__ */ new Map();
    for (const tribute of tributeState.tributes) {
      const { from, to } = tribute;
      const fromHand = game2.hands[from];
      if (!fromHand || fromHand.length === 0) continue;
      const card = selectTributeCard(fromHand);
      if (card) {
        tributeCards.set(from, { card, to });
        result.tributes.push({
          from,
          to,
          card: { ...card }
        });
      }
    }
    const returnCards = /* @__PURE__ */ new Map();
    for (const tribute of tributeState.tributes) {
      const { from, to } = tribute;
      const toHand = game2.hands[to];
      if (!toHand || toHand.length === 0) continue;
      const card = selectReturnCard(toHand);
      if (card) {
        returnCards.set(to, { card, to: from });
        result.returnTributes.push({
          from: to,
          to: from,
          card: { ...card }
        });
      }
    }
    for (const [from, { card, to }] of tributeCards) {
      game2.hands[from] = removeCards(game2.hands[from], [card]);
    }
    for (const [from, { card, to }] of returnCards) {
      game2.hands[from] = removeCards(game2.hands[from], [card]);
    }
    for (const [from, { card, to }] of tributeCards) {
      game2.hands[to].push(card);
    }
    for (const [from, { card, to }] of returnCards) {
      game2.hands[to].push(card);
    }
    for (let i = 0; i < 4; i++) {
      game2.hands[i] = sortCards(game2.hands[i]);
    }
    return result;
  }
  function getFirstPlayer(tributeState) {
    if (!tributeState || !tributeState.lastFinishOrder || tributeState.lastFinishOrder.length === 0) {
      return 0;
    }
    const first = tributeState.lastFinishOrder[0];
    const third = tributeState.lastFinishOrder[2];
    const fourth = tributeState.lastFinishOrder[3];
    if (tributeState.tributeHasTwoBigJokers) {
      if (tributeState.tributeHasTwoBigJokers.get(fourth)) return first;
      if (tributeState.isDoubleDown && tributeState.tributeHasTwoBigJokers.get(third)) return first;
    }
    return fourth;
  }

  // guandan/src/game-engine/memory.js
  var CardTracker = class {
    constructor(levelCardValue = 2) {
      this.levelCardValue = levelCardValue;
      this.reset();
    }
    reset(levelCardValue = null) {
      if (levelCardValue !== null) {
        this.levelCardValue = levelCardValue;
      }
      this.remaining = {};
      for (let i = 2; i <= 14; i++) {
        this.remaining[i] = 8;
      }
      this.remaining[16] = 2;
      this.remaining[17] = 2;
      this.WildCardCount = 2;
      this.playedCards = [];
      this.emptyBigKing = false;
      this.emptySmallKing = false;
      this.emptyLevelCard = false;
      this.gameRounds = 0;
      this.playerCounts = [27, 27, 27, 27];
      this._kingCount = {
        bigKing: [-1, -1, -1, -1],
        smallKing: [-1, -1, -1, -1]
      };
      this._kingPlayed = {
        bigKing: [0, 0, 0, 0],
        smallKing: [0, 0, 0, 0]
      };
      this._lastTributeInfo = { tributes: [], isDoubleDown: false };
      this._playerCardDist = /* @__PURE__ */ new Map();
      this._valueLastPlayer = /* @__PURE__ */ new Map();
      this._playerMinPlayed = /* @__PURE__ */ new Map();
      this._playerMaxPlayed = /* @__PURE__ */ new Map();
    }
    /**
     * 记录一张牌打出
     * @param {Object} card - 牌对象
     * @param {number} [playerIdx] - 可选，出牌人索引 (0-3)
     */
    cardOut(card, playerIdx) {
      if (!card || card.value === void 0) {
        console.warn("[WARN] card_out missing 'value' key:", card);
        return;
      }
      const value = card.value;
      if (this.remaining[value] !== void 0) {
        this.remaining[value] -= 1;
        this.playedCards.push(card);
        if (value === 17) {
          this.emptyBigKing = this.remaining[17] === 0;
        } else if (value === 16) {
          this.emptySmallKing = this.remaining[16] === 0;
        } else if (card.level_value === 15) {
          this.emptyLevelCard = this.remaining[value] === 0;
          if (card.suit === "HEART") {
            this.WildCardCount -= 1;
          }
        }
        if (playerIdx !== void 0) {
          this._recordCardForPlayer(playerIdx, card);
        }
      }
    }
    /**
     * 记录多张牌打出
     * @param {Object[]} cards - 牌数组
     * @param {number} [playerIdx] - 可选，出牌人索引
     */
    cardsOut(cards, playerIdx) {
      for (const card of cards) {
        this.cardOut(card, playerIdx);
      }
    }
    /**
     * 记录某家出了一张牌的记牌追踪
     * @private
     */
    _recordCardForPlayer(playerIdx, card) {
      const { value } = card;
      if (!this._playerCardDist.has(playerIdx)) {
        this._playerCardDist.set(playerIdx, /* @__PURE__ */ new Map());
      }
      const dist = this._playerCardDist.get(playerIdx);
      dist.set(value, (dist.get(value) || 0) + 1);
      this._valueLastPlayer.set(value, playerIdx);
      const effectiveValue = card.level_value !== void 0 ? card.level_value : value;
      if (!this._playerMinPlayed.has(playerIdx)) {
        this._playerMinPlayed.set(playerIdx, effectiveValue);
        this._playerMaxPlayed.set(playerIdx, effectiveValue);
      } else {
        if (effectiveValue < this._playerMinPlayed.get(playerIdx)) {
          this._playerMinPlayed.set(playerIdx, effectiveValue);
        }
        if (effectiveValue > this._playerMaxPlayed.get(playerIdx)) {
          this._playerMaxPlayed.set(playerIdx, effectiveValue);
        }
      }
    }
    /**
     * 查询某家某牌值的出牌数
     */
    getPlayerCardCount(playerIdx, value) {
      const dist = this._playerCardDist.get(playerIdx);
      return dist ? dist.get(value) || 0 : 0;
    }
    /**
     * 获取某家出牌分布
     */
    getPlayerCardDist(playerIdx) {
      const dist = this._playerCardDist.get(playerIdx);
      return dist ? new Map(dist) : /* @__PURE__ */ new Map();
    }
    /**
     * 获取某牌值最后出牌人
     */
    getLastPlayerForValue(value) {
      return this._valueLastPlayer.get(value);
    }
    /**
     * 获取某家已出的最小牌值
     */
    getPlayerMinPlayed(playerIdx) {
      return this._playerMinPlayed.get(playerIdx);
    }
    /**
     * 获取某家已出的最大牌值
     */
    getPlayerMaxPlayed(playerIdx) {
      return this._playerMaxPlayed.get(playerIdx);
    }
    /**
     * 查询某张牌是否还有剩余
     */
    isRemaining(value, count = 1) {
      return (this.remaining[value] || 0) >= count;
    }
    /**
     * 查询某张牌剩余数量
     */
    countRemaining(value) {
      return this.remaining[value] || 0;
    }
    /**
     * 设置四家余牌数
     * @param {number[]} counts - 长度为4的数组，[自己, 下家, 队友, 上家]
     */
    setPlayerCounts(counts) {
      if (Array.isArray(counts) && counts.length === 4) {
        this.playerCounts = [...counts];
      }
    }
    /**
     * 获取指定玩家的余牌数
     * @param {number} playerIdx - 玩家索引 (0=自己, 1=下家, 2=队友, 3=上家)
     * @returns {number} 余牌数
     */
    getPlayerCount(playerIdx) {
      return this.playerCounts[playerIdx] || 0;
    }
    /**
     * 进贡结束时调用，更新进贡相关的王分布推断
     * @param {Object} info - { tributes: [{from, to, card}], isDoubleDown: boolean, tributeHasTwoBigJokers: Map|Object }
     */
    updateTribute(info) {
      if (!info || !info.tributes) return;
      this._lastTributeInfo = info;
      const { tributes, isDoubleDown, tributeHasTwoBigJokers, tributeBigJokerCounts } = info;
      const hasResist = (from) => {
        if (tributeHasTwoBigJokers instanceof Map) {
          return tributeHasTwoBigJokers.get(from);
        }
        return tributeHasTwoBigJokers?.[from];
      };
      const getJokerCount = (from) => {
        if (tributeBigJokerCounts instanceof Map) {
          return tributeBigJokerCounts.get(from);
        }
        return tributeBigJokerCounts?.[from];
      };
      const isResisted = tributeHasTwoBigJokers instanceof Map ? [...tributeHasTwoBigJokers.values()].some((v) => v) : Object.values(tributeHasTwoBigJokers || {}).some((v) => v);
      if (isResisted) {
        if (isDoubleDown) {
          const tributePayers = tributeHasTwoBigJokers instanceof Map ? [...tributeHasTwoBigJokers.keys()] : Object.keys(tributeHasTwoBigJokers || {}).map(Number);
          for (const payer of tributePayers) {
            const count = getJokerCount(payer) || 0;
            this._setKingCount(payer, "bigKing", count);
          }
          const payerSet = new Set(tributePayers);
          for (let i = 0; i < 4; i++) {
            if (!payerSet.has(i)) {
              this._setKingCount(i, "bigKing", 0);
            }
          }
        } else {
          for (let i = 0; i < 4; i++) {
            if (hasResist(i)) {
              this._setKingCount(i, "bigKing", 2);
            } else {
              this._setKingCount(i, "bigKing", 0);
            }
          }
        }
        return;
      }
      for (const t of tributes) {
        const { from, to, card } = t;
        if (!card) continue;
        if (card.value === 17) {
          this._setKingCount(from, "bigKing", 0);
          this._setKingCount(to, "bigKing", 1);
        } else if (card.value === 16) {
          this._setKingCount(from, "bigKing", 0);
          this._setKingCount(to, "smallKing", 1);
        } else {
          this._setKingCount(from, "bigKing", 0);
          this._setKingCount(from, "smallKing", 0);
        }
      }
    }
    /**
     * 初始化玩家 0 的手牌为王数量
     * @param {Object[]} hand - 玩家 0 的手牌
     */
    initKingFromHand(hand) {
      if (!hand) return;
      let bigCount = 0;
      let smallCount = 0;
      for (const card of hand) {
        if (card.value === 17) bigCount++;
        else if (card.value === 16) smallCount++;
      }
      this._setKingCount(0, "bigKing", bigCount);
      this._setKingCount(0, "smallKing", smallCount);
      this._resolveRemaining();
    }
    /**
     * 出牌/过牌时调用，增量更新推断状态
     * @param {Object} action - { type: 'play'|'pass', cards: [] }
     * @param {number} player - 玩家索引
     * @param {Object} lastPlay - 上家出的牌 { cards: [] }
     * @param {string} nowPlayType - 当前出的牌类型
     */
    updateKingAfterPlay(action, player, lastPlay, nowPlayType) {
      if (!action) return;
      const { type, cards } = action;
      if (type === "play" && cards) {
        for (const card of cards) {
          if (card.value === 17) {
            this._kingPlayed.bigKing[player]++;
            if (this._kingCount.bigKing[player] > 0) {
              this._kingCount.bigKing[player]--;
            }
          } else if (card.value === 16) {
            this._kingPlayed.smallKing[player]++;
            if (this._kingCount.smallKing[player] > 0) {
              this._kingCount.smallKing[player]--;
            }
          }
        }
      }
      if (lastPlay) {
        const lastCards = lastPlay.cards || [];
        if (lastCards.length == 1 && lastPlay.player !== (player + 2) % 4) {
          const maxLv = Math.max(...lastCards.map((c) => c.level_value || c.value));
          if (maxLv > 13) {
            if (type === "pass") {
              this._inferByBeatPass(player, lastPlay);
            } else if (type === "play") {
              const nowType = (nowPlayType || "").toLowerCase();
              if (nowType === "bomb" || nowType === "flush_straight") {
                this._inferByBeatPass(player, lastPlay);
              } else if (maxLv < 16 && nowType === "single" && cards && cards.some((c) => c.value === 17)) {
                this._setKingCount(player, "smallKing", 0);
              }
            }
          }
        }
      }
      this._resolveRemaining();
    }
    /**
     * 压制推断：判断 pass 玩家是否没有某张王
     * @private
     */
    _inferByBeatPass(passPlayerIdx, lastPlay) {
      const cards = lastPlay.cards || [];
      if (!cards.length) return;
      const maxLv = Math.max(...cards.map((c) => c.level_value || c.value));
      if (maxLv <= 15) {
        if (this._kingCount.smallKing[passPlayerIdx] == 0) {
          this._setKingCount(passPlayerIdx, "bigKing", 0);
        } else {
          this._setKingCount(passPlayerIdx, "smallKing", 0);
        }
      } else if (maxLv === 16) {
        this._setKingCount(passPlayerIdx, "bigKing", 0);
      }
    }
    /**
     * 根据已知信息推算剩余王的归属
     * _kingCount 是总数，总和为 2，直接推算
     * @private
     */
    _resolveRemaining() {
      for (const kingType of ["bigKing", "smallKing"]) {
        const counts = this._kingCount[kingType];
        const playedCounts = this._kingPlayed[kingType];
        let zeroCount = 0;
        let knownSum = 0;
        let lastUnknown = -1;
        for (let i = 0; i < 4; i++) {
          if (counts[i] === 0) {
            zeroCount++;
          } else if (counts[i] >= 0) {
            knownSum += counts[i];
          } else {
            lastUnknown = i;
          }
          if (playedCounts > 0) {
            knownSum += playedCounts[i];
          }
        }
        if (knownSum === 2) {
          for (let i = 0; i < 4; i++) {
            if (counts[i] === -1) counts[i] = 0;
          }
        } else if (lastUnknown === -1) {
          for (let i = 1; i < 4; i++) {
            counts[i] = -1;
          }
        }
      }
    }
    /**
     * 设置某个玩家的王数量
     * @private
     */
    _setKingCount(playerIdx, kingType, count) {
      this._kingCount[kingType][playerIdx] = count;
    }
    /**
     * 获取大小王分布结果
     * @returns {{ bigKing: {remaining: number[], played: number[]}, smallKing: {remaining: number[], played: number[]} }}
     *   remaining: 每个人手里剩余数，-1=未知
     *   played: 每个人已出数
     */
    getKingDistribution() {
      return {
        bigKing: {
          remaining: [...this._kingCount.bigKing],
          played: [...this._kingPlayed.bigKing]
        },
        smallKing: {
          remaining: [...this._kingCount.smallKing],
          played: [...this._kingPlayed.smallKing]
        }
      };
    }
    /**
     * 获取记牌状态（用于 LLM 提示词）
     */
    getStatus() {
      const remaining = {};
      for (const [k, v] of Object.entries(this.remaining)) {
        if (v > 0) remaining[k] = v;
      }
      const levelCardValue = this.levelCardValue || 2;
      const bigCardsRemaining = (this.remaining[17] || 0) + (this.remaining[16] || 0) + (this.remaining[levelCardValue] || 0);
      return {
        remaining,
        big_remaining: bigCardsRemaining,
        wild_remaining: this.WildCardCount,
        played_count: this.playedCards.length,
        special: {
          empty_big_king: this.emptyBigKing,
          empty_small_king: this.emptySmallKing,
          empty_level_card: this.emptyLevelCard
        }
      };
    }
  };

  // guandan/src/game-engine/analysis-constants.js
  var HAND_TYPE_CN = {
    single: "\u5355\u5F20",
    pair: "\u5BF9\u5B50",
    three_pairs: "\u4E09\u8FDE\u5BF9",
    triple: "\u4E09\u5F20",
    two_triples: "\u94A2\u677F",
    triple_with_pair: "\u4E09\u5E26\u5BF9",
    straight: "\u987A\u5B50",
    flush_straight: "\u540C\u82B1\u987A",
    bomb: "\u70B8\u5F39",
    four_jokers: "\u56DB\u5927\u5929\u738B"
  };

  // guandan/src/game-engine/play-analysis-dist.js
  function applyTo(PlayAnalyzer2) {
    PlayAnalyzer2.prototype._buildDistribution = function(myHand) {
      if (!this._cardTracker || !myHand) {
        return { individualHolds: [] };
      }
      return { individualHolds: this._inferValueHolds(myHand) };
    };
    PlayAnalyzer2.prototype._inferValueHolds = function(myHand) {
      const results = [];
      const myCounts = {};
      for (const card of myHand) {
        myCounts[card.value] = (myCounts[card.value] || 0) + 1;
      }
      const remaining = this._cardTracker.remaining || {};
      const levelVal = this._cardTracker?.levelCardValue || this.level;
      for (let v = 2; v <= 14; v++) {
        if (v === levelVal) continue;
        const opponentRemaining = Math.max(0, (remaining[v] || 0) - (myCounts[v] || 0));
        if (opponentRemaining <= 0) continue;
        let playersSeen = 0;
        const unseen = [];
        for (let p = 1; p <= 3; p++) {
          const dist = this._cardTracker ? this._cardTracker.getPlayerCardDist(p) : /* @__PURE__ */ new Map();
          const cnt = dist ? dist.get(v) || 0 : 0;
          if (cnt > 0) playersSeen++;
          else unseen.push(p);
        }
        if (playersSeen === 0) continue;
        let confidence = "low";
        let heldBy = [];
        let copiesPerPlayer = {};
        let reason = "";
        let lastPlayer = void 0;
        if (playersSeen === 2 && unseen.length === 1) {
          heldBy = [unseen[0]];
          copiesPerPlayer = { [unseen[0]]: opponentRemaining };
          confidence = "confirmed";
          const otherNames = [1, 2, 3].filter((p) => p !== unseen[0]).map((p) => POS_NAMES[p]).join("\u3001");
          reason = `${otherNames}\u5DF2\u51FA\u5B8C\uFF0C\u6211\u624B\u65E0\uFF0C\u4F59${opponentRemaining}\u5F20\u5FC5\u5728${POS_NAMES[unseen[0]]}`;
        } else if (playersSeen === 3) {
          const perPlayer = {};
          for (let p = 1; p <= 3; p++) perPlayer[p] = opponentRemaining;
          heldBy = [1, 2, 3];
          copiesPerPlayer = perPlayer;
          confidence = "inferred";
          lastPlayer = this._cardTracker ? this._cardTracker.getLastPlayerForValue(v) : void 0;
          reason = `3\u5BB6\u5747\u51FA\u8FC7${VALUE_TO_DISPLAY[v] || v}\uFF0C\u4ECD\u6709${opponentRemaining}\u5F20\u4F59\u91CF\uFF0C\u53EF\u80FD\u6210\u7EC4\u5408\u7ED3\u6784`;
        } else if (playersSeen === 1) {
          heldBy = unseen;
          confidence = "partial";
          const whoPlayed = [1, 2, 3].filter((p) => !unseen.includes(p)).map((p) => POS_NAMES[p]).join("");
          reason = `\u4EC5${whoPlayed}\u51FA\u8FC7\uFF0C\u4F59\u91CF\u53EF\u80FD\u5728${unseen.map((p) => POS_NAMES[p]).join("\u3001")}`;
        }
        if (heldBy.length > 0 || confidence === "inferred" || confidence === "partial") {
          results.push({
            value: v,
            display: VALUE_TO_DISPLAY[v] || String(v),
            totalRemaining: opponentRemaining,
            heldBy,
            copiesPerPlayer,
            confidence,
            reason,
            lastPlayer
          });
        }
      }
      return results;
    };
  }

  // guandan/src/game-engine/play-analysis.js
  var PlayAnalyzer = class {
    constructor(options = {}) {
      this.level = options.level || 2;
      this._cardTracker = null;
      this._resetState();
    }
    _resetState() {
      this._lastPlay = null;
      this._simplePlayLog = [];
    }
    reset(level, cardTracker) {
      this.level = level || this.level;
      this._cardTracker = cardTracker || null;
      this._resetState();
    }
    recordPlay(playerIdx, cards, cardType, mainValue, isLead) {
      const effectiveType = cardType === "flush_straight" || cardType === "four_jokers" ? "bomb" : cardType;
      const prevPlay = this._lastPlay;
      this._lastPlay = { type: effectiveType, cards, mainValue, player: playerIdx };
      const beatDisplay = !isLead && prevPlay ? prevPlay.mainValue : null;
      const beatType = !isLead && prevPlay ? prevPlay.type : null;
      const prevPlayerIdx = !isLead && prevPlay ? prevPlay.player : null;
      const hasSpecialCard = cards.some((c) => c.value >= 15);
      this._simplePlayLog.push({
        playerIdx,
        type: effectiveType,
        cardsDisplay: cards.map((c) => c.display).join(" "),
        mainValue,
        isLead,
        isPass: false,
        beatDisplay,
        beatType,
        prevPlayerIdx,
        hasSpecialCard
      });
    }
    recordPass(playerIdx) {
      const beatDisplay = this._lastPlay ? this._lastPlay.mainValue : null;
      const beatType = this._lastPlay ? this._lastPlay.type : null;
      const prevPlayerIdx = this._lastPlay ? this._lastPlay.player : null;
      this._simplePlayLog.push({
        playerIdx,
        isPass: true,
        beatDisplay,
        beatType,
        prevPlayerIdx
      });
    }
    getAnalysis(_playerCounts, myHand = null, _myPosition = 0) {
      const distribution = this._buildDistribution(myHand);
      const BOMB_TYPES = /* @__PURE__ */ new Set(["bomb", "flush_straight", "four_jokers"]);
      const RELATION = { 0: "\u5DF1", 1: "\u4E0B", 2: "\u961F", 3: "\u4E0A" };
      const TYPE_ORDER = ["single", "pair", "triple", "triple_with_pair", "straight", "three_pairs", "two_triples", "bomb"];
      const grouped = {};
      for (const entry of this._simplePlayLog) {
        let classifiedType;
        if (entry.isPass) {
          classifiedType = entry.beatType || "single";
        } else if (entry.isLead) {
          classifiedType = BOMB_TYPES.has(entry.type) ? "bomb" : entry.type;
        } else {
          classifiedType = entry.beatType || entry.type;
        }
        if (!HAND_TYPE_CN[classifiedType] && classifiedType !== "bomb") classifiedType = "single";
        if (entry.isPass && classifiedType === "bomb") continue;
        if (!grouped[entry.playerIdx]) grouped[entry.playerIdx] = {};
        if (!grouped[entry.playerIdx][classifiedType]) grouped[entry.playerIdx][classifiedType] = [];
        let display;
        if (entry.isPass) {
          display = "(" + (RELATION[entry.prevPlayerIdx] || "") + "|" + (entry.beatDisplay || "") + ")";
        } else if (entry.isLead) {
          const isBomb = BOMB_TYPES.has(entry.type);
          const cardStr = isBomb ? "[" + entry.cardsDisplay + "]" : entry.cardsDisplay;
          display = cardStr;
        } else {
          const role = RELATION[entry.prevPlayerIdx] || "";
          const beatPart = entry.beatDisplay ? "|" + entry.beatDisplay : "";
          const isBomb = BOMB_TYPES.has(entry.type);
          const cardStr = isBomb ? "[" + entry.cardsDisplay + "]" : entry.cardsDisplay;
          display = cardStr + "(" + role + beatPart + ")";
        }
        grouped[entry.playerIdx][classifiedType].push({
          display,
          isLead: entry.isLead,
          isPass: entry.isPass,
          isBomb: BOMB_TYPES.has(entry.type),
          hasSpecialCard: entry.hasSpecialCard
        });
      }
      const playLog = [];
      const PLAYER_NAMES = { 0: "\u81EA\u5DF1", 1: "\u4E0B\u5BB6", 2: "\u961F\u53CB", 3: "\u4E0A\u5BB6" };
      for (const playerIdx of [1, 2, 3, 0]) {
        if (!grouped[playerIdx]) continue;
        const types = [];
        for (const typeKey of TYPE_ORDER) {
          if (grouped[playerIdx][typeKey]) {
            types.push({ typeKey, typeName: HAND_TYPE_CN[typeKey] || typeKey, items: grouped[playerIdx][typeKey] });
          }
        }
        if (types.length > 0) {
          playLog.push({ playerIdx, name: PLAYER_NAMES[playerIdx], types });
        }
      }
      return { distribution, playLog };
    }
  };
  applyTo(PlayAnalyzer);

  // guandan/src/game-engine/game.js
  var Game = class {
    constructor(options = {}) {
      this.level = options.level || 8;
      this.eventBus = options.eventBus || new EventBus();
      this.analyzer = new EnhancedHandAnalyzer();
      this.players = options.players || [];
      this.reset();
    }
    reset() {
      this.dealNumber = 0;
      this.currentLevel = this.level;
      this.teamLevels = [this.level, this.level];
      this.deck = [];
      this.hands = [[], [], [], []];
      this.playerCounts = [27, 27, 27, 27];
      this.tablePlays = [null, null, null, null];
      this.lastPlay = null;
      this.lastPlayer = -1;
      this.currentTurn = 0;
      this.finishOrder = [];
      this.playerFinishOrder = {};
      this.gameState = "idle";
      this.roundCounter = 1;
      this.gameLog = [];
      this.playHistory = [];
      if (this.cardTracker) {
        this.cardTracker.reset(this.currentLevel);
      } else {
        this.cardTracker = new CardTracker(this.currentLevel);
      }
      this.playAnalyzer = new PlayAnalyzer({ level: this.currentLevel });
      this.tributeState = {
        lastFinishOrder: [],
        // 上一局名次
        tributes: [],
        // 进贡记录
        returnTributes: [],
        // 还贡记录
        firstPlayer: 0
        // 本局首发玩家
      };
    }
    createDeck() {
      const deck = [];
      const suits = ["SPADE", "HEART", "CLUB", "DIAMOND"];
      const SUIT_SYMBOL2 = { CLUB: "\u2663", HEART: "\u2665", DIAMOND: "\u2666", SPADE: "\u2660", JOKER: "" };
      const VALUE_DISPLAY = { 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", 10: "10", 11: "J", 12: "Q", 13: "K", 14: "A", 15: "\u7EA7", 16: "\u5C0F\u738B", 17: "\u5927\u738B" };
      for (let d = 0; d < 2; d++) {
        for (const suit of suits) {
          for (let value = 2; value <= 14; value++) {
            deck.push({
              value,
              suit,
              level_value: value === this.currentLevel ? 15 : value,
              display: `${SUIT_SYMBOL2[suit]}${VALUE_DISPLAY[value]}`
            });
          }
        }
        deck.push({ value: 16, suit: "JOKER", level_value: 16, display: "\u5C0F\u738B", rank: "SMALL_JOKER" });
        deck.push({ value: 17, suit: "JOKER", level_value: 17, display: "\u5927\u738B", rank: "BIG_JOKER" });
      }
      return deck;
    }
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }
    async startGame() {
      this.roundCounter++;
      this.tablePlays = [null, null, null, null];
      this.lastPlay = null;
      this.lastPlayer = -1;
      this.finishOrder = [];
      this.playerFinishOrder = {};
      this.playHistory = [];
      this.cardTracker.reset(this.currentLevel);
      this.playAnalyzer.reset(this.currentLevel, this.cardTracker);
      this.deal();
      if (this.dealNumber > 1) {
        const hasUIHandler = this.eventBus._listeners?.has("tribute_request");
        if (hasUIHandler) {
          await this.processTributeAsync();
        } else {
          this.processTribute();
        }
      }
      if (this.dealNumber > 1) {
        this.currentTurn = getFirstPlayer(this.tributeState);
        this.tributeState.firstPlayer = this.currentTurn;
      }
      return this.getSnapshot();
    }
    /**
     * 验证进贡牌是否合法
     * @param {number} playerIdx - 玩家索引
     * @param {Object} card - 选中的牌
     * @returns {Object} { valid: boolean, reason?: string }
     */
    validateTributeCard(playerIdx, card) {
      const hand = this.hands[playerIdx];
      return validateTributeSelection(hand, card);
    }
    /**
     * 验证还贡牌是否合法
     * @param {number} playerIdx - 玩家索引
     * @param {Object} card - 选中的牌
     * @returns {Object} { valid: boolean, reason?: string }
     */
    validateReturnCard(playerIdx, card) {
      const hand = this.hands[playerIdx];
      return validateReturnSelection(hand, card);
    }
    /**
     * 获取玩家的可选进贡牌列表
     * @param {number} playerIdx - 玩家索引
     * @returns {Array} 可选进贡牌列表
     */
    getTributeCandidates(playerIdx) {
      return getEligibleTributeCards(this.hands[playerIdx]);
    }
    /**
     * 获取玩家的可选还贡牌列表
     * @param {number} playerIdx - 玩家索引
     * @returns {Array} 可选还贡牌列表
     */
    getReturnCandidates(playerIdx) {
      return getEligibleReturnCards(this.hands[playerIdx]);
    }
    /**
     * 计算进贡状态（供外部调用，用于显示）
     * @returns {Object} 进贡状态
     */
    calculateTributeState() {
      if (!this.tributeState.lastFinishOrder || this.tributeState.lastFinishOrder.length < 4) {
        return null;
      }
      const { tributes, isDoubleDown, tributeHasTwoBigJokers, tributeBigJokerCounts } = calculateTribute(
        this.tributeState.lastFinishOrder,
        this.currentLevel,
        this.hands
      );
      return {
        tributes,
        isDoubleDown,
        tributeHasTwoBigJokers,
        tributeBigJokerCounts,
        dealNumber: this.dealNumber
      };
    }
    /**
     * 处理进贡还贡（异步交互模式）
     * 发射 tribute_request 事件，等待 UI 响应
     */
    async processTributeAsync() {
      if (!this.tributeState.lastFinishOrder || this.tributeState.lastFinishOrder.length < 4) {
        return { success: false, reason: "\u65E0\u4E0A\u4E00\u5C40\u540D\u6B21" };
      }
      const { tributes, isDoubleDown, tributeHasTwoBigJokers, tributeBigJokerCounts } = calculateTribute(
        this.tributeState.lastFinishOrder,
        this.currentLevel,
        this.hands
      );
      this.tributeState.tributes = tributes;
      this.tributeState.isDoubleDown = isDoubleDown;
      this.tributeState.tributeHasTwoBigJokers = tributeHasTwoBigJokers;
      this.tributeState.tributeBigJokerCounts = tributeBigJokerCounts;
      if (tributes.length === 0) {
        return { success: true, tributes: [], returnTributes: [] };
      }
      const resistPlayers = [];
      for (const tribute of tributes) {
        const { from } = tribute;
        if (tributeHasTwoBigJokers.get(from)) {
          resistPlayers.push(from);
        }
      }
      const tributeRequest = {
        dealNumber: this.dealNumber,
        tributes: tributes.map((t) => ({ ...t })),
        isDoubleDown,
        tributeHasTwoBigJokers: Object.fromEntries(tributeHasTwoBigJokers),
        resistPlayers,
        hands: this.hands.map((h) => cloneHand(h))
      };
      return new Promise((resolve) => {
        this._tributeResolve = resolve;
        this.eventBus.emit("tribute_request", tributeRequest);
      });
    }
    /**
     * 确认进贡结果（由 UI 调用）
     * @param {Object} tributeSelections - 进贡选择 { [fromPlayer]: card }
     * @param {Object} returnSelections - 还贡选择 { [fromPlayer]: card }
     */
    confirmTribute(tributeSelections, returnSelections) {
      if (!this._tributeResolve) {
        return { success: false, reason: "\u65E0\u5F85\u5904\u7406\u7684\u8FDB\u8D21\u8BF7\u6C42" };
      }
      const result = {
        tributes: [],
        returnTributes: [],
        success: true
      };
      for (const tribute of this.tributeState.tributes) {
        const { from, to } = tribute;
        const selectedCard = tributeSelections[from];
        if (selectedCard) {
          this.hands[from] = removeCards(this.hands[from], [selectedCard]);
          this.hands[to].push(selectedCard);
          result.tributes.push({
            from,
            to,
            card: { ...selectedCard }
          });
          this.playHistory.push(`[\u8FDB\u8D21] ${POS_NAMES[from]} \u2192 ${POS_NAMES[to]}: ${selectedCard.display} (\u4F59${this.playerCounts[from]}\u5F20)`);
        }
      }
      for (const tribute of this.tributeState.tributes) {
        const { from, to } = tribute;
        const returnPlayer = to;
        const selectedCard = returnSelections[returnPlayer];
        if (selectedCard) {
          this.hands[returnPlayer] = removeCards(this.hands[returnPlayer], [selectedCard]);
          this.hands[from].push(selectedCard);
          result.returnTributes.push({
            from: returnPlayer,
            to: from,
            card: { ...selectedCard }
          });
          this.playHistory.push(`[\u8FD8\u8D21] ${POS_NAMES[returnPlayer]} \u2192 ${POS_NAMES[from]}: ${selectedCard.display} (\u4F59${this.playerCounts[returnPlayer]}\u5F20)`);
        }
      }
      for (let i = 0; i < 4; i++) {
        this.hands[i] = sortCards(this.hands[i]);
      }
      for (let i = 0; i < 4; i++) {
        this.playerCounts[i] = this.hands[i].length;
      }
      this.tributeState.returnTributes = result.returnTributes;
      this.cardTracker.updateTribute({
        tributes: result.tributes,
        isDoubleDown: this.tributeState.isDoubleDown,
        tributeHasTwoBigJokers: this.tributeState.tributeHasTwoBigJokers,
        tributeBigJokerCounts: this.tributeState.tributeBigJokerCounts
      });
      this._tributeResolve(result);
      this._tributeResolve = null;
      this.eventBus.emit("tribute", {
        dealNumber: this.dealNumber,
        tributes: result.tributes,
        returnTributes: result.returnTributes,
        isDoubleDown: this.tributeState.isDoubleDown,
        tributeHasTwoBigJokers: Object.fromEntries(this.tributeState.tributeHasTwoBigJokers),
        hands: this.hands.map((h) => cloneHand(h))
      });
      return result;
    }
    /**
     * 跳过进贡（用于没有进贡关系或特殊情况）
     */
    skipTribute() {
      this.cardTracker.updateTribute({
        tributes: [],
        isDoubleDown: this.tributeState.isDoubleDown,
        tributeHasTwoBigJokers: this.tributeState.tributeHasTwoBigJokers,
        tributeBigJokerCounts: this.tributeState.tributeBigJokerCounts
      });
      if (this._tributeResolve) {
        this._tributeResolve({ success: true, tributes: [], returnTributes: [], skipped: true });
        this._tributeResolve = null;
      }
    }
    /**
     * 处理进贡还贡（同步模式，向后兼容）
     * @deprecated 请使用 processTributeAsync
     */
    processTribute() {
      if (!this.tributeState.lastFinishOrder || this.tributeState.lastFinishOrder.length < 4) {
        return;
      }
      const { tributes, isDoubleDown, tributeHasTwoBigJokers, tributeBigJokerCounts } = calculateTribute(
        this.tributeState.lastFinishOrder,
        this.currentLevel,
        this.hands
      );
      this.tributeState.tributes = tributes;
      this.tributeState.isDoubleDown = isDoubleDown;
      this.tributeState.tributeHasTwoBigJokers = tributeHasTwoBigJokers;
      this.tributeState.tributeBigJokerCounts = tributeBigJokerCounts;
      if (tributes.length === 0) {
        return;
      }
      const isResisted = tributes.some((t) => tributeHasTwoBigJokers.get(t.from));
      if (isResisted) {
        this.eventBus.emit("tribute", {
          dealNumber: this.dealNumber,
          tributes: [],
          returnTributes: [],
          isDoubleDown,
          isResisted: true,
          tributeHasTwoBigJokers: Object.fromEntries(tributeHasTwoBigJokers),
          hands: this.hands.map((h) => cloneHand(h))
        });
        return;
      }
      const result = executeTribute(this, this.tributeState);
      this.tributeState.returnTributes = result.returnTributes;
      for (let i = 0; i < 4; i++) {
        this.playerCounts[i] = this.hands[i].length;
      }
      this.eventBus.emit("tribute", {
        dealNumber: this.dealNumber,
        tributes: result.tributes,
        returnTributes: result.returnTributes,
        isDoubleDown,
        tributeHasTwoBigJokers: Object.fromEntries(tributeHasTwoBigJokers),
        hands: this.hands.map((h) => cloneHand(h))
      });
    }
    deal() {
      for (let i = 0; i < 4; i++) this.hands[i] = [];
      this.deck = this.shuffle(this.createDeck());
      for (let i = 0; i < this.deck.length; i++) {
        this.hands[i % 4].push(this.deck[i]);
      }
      for (let i = 0; i < 4; i++) this.hands[i] = sortCards(this.hands[i]);
      this.playerCounts = [27, 27, 27, 27];
      this.currentTurn = getFirstPlayer(this.tributeState);
      this.tributeState.firstPlayer = this.currentTurn;
      this.gameState = "playing";
      this.dealNumber++;
      this.playHistory.push(`\u7B2C${this.dealNumber}\u526F \u53D1\u724COK\uFF0C\u6BCF\u5BB627\u5F20`);
      this.eventBus.emit("deal", {
        dealNumber: this.dealNumber,
        hands: this.hands.map((h) => cloneHand(h)),
        level: this.currentLevel,
        firstPlayer: this.currentTurn
      });
      return this.getSnapshot();
    }
    /**
     * 注入预定义的发牌快照（绕过洗牌），用于策略对比时保证相同手牌
     * @param {Array} hands — 4 个牌的数组，每家 27 张
     * @param {number} level — 当前级牌
     * @param {number} firstPlayer — 首发玩家位置
     */
    injectDeal(hands, level, firstPlayer = 0) {
      if (!hands || hands.length !== 4) throw new Error("injectDeal: hands must be an array of 4 arrays");
      this.currentLevel = level;
      this.hands = hands.map((h) => sortCards(cloneHand(h)));
      this.playerCounts = [27, 27, 27, 27];
      this.tablePlays = [null, null, null, null];
      this.lastPlay = null;
      this.lastPlayer = -1;
      this.finishOrder = [];
      this.playerFinishOrder = {};
      this.playHistory = [];
      this.currentTurn = firstPlayer;
      this.tributeState.firstPlayer = firstPlayer;
      this.tributeState.tributes = [];
      this.tributeState.returnTributes = [];
      this.gameState = "playing";
      this.dealNumber++;
      this.cardTracker.reset(level);
      this.playHistory.push(`\u7B2C${this.dealNumber}\u526F \u53D1\u724COK\uFF0C\u6BCF\u5BB627\u5F20`);
      this.eventBus.emit("deal", {
        dealNumber: this.dealNumber,
        hands: this.hands.map((h) => cloneHand(h)),
        level: this.currentLevel,
        firstPlayer: this.currentTurn
      });
      return this.getSnapshot();
    }
    /**
     * 出牌 -- 只负责校验 + 执行 + 发射事件
     * 返回 { success, type, main_value }
     */
    playCards(playerIdx, cards) {
      if (playerIdx !== this.currentTurn) return { success: false, reason: "not_my_turn" };
      if (!cards || cards.length === 0) return { success: false, reason: "no_cards" };
      if (!isSubset(cards, this.hands[playerIdx])) return { success: false, reason: "cards_not_in_hand" };
      const cardType = this._detectHandType(cards);
      if (!cardType) {
        const wildCards = cards.filter((c) => c.value === this.currentLevel && c.suit === "HEART");
        const nonWild = cards.filter((c) => !(c.value === this.currentLevel && c.suit === "HEART"));
        console.error(`[INVALID_PLAY] player=${playerIdx} cards=${cards.map((c) => c.display || c.value).join(",")} wildCount=${wildCards.length} nonWildCount=${nonWild.length} nonWild=${nonWild.map((c) => c.display || c.value).join(",")} wild=${wildCards.map((c) => c.display || c.value).join(",")} n=${cards.length}`);
        return { success: false, reason: "invalid_hand_type" };
      }
      const isLead = !this.lastPlay;
      if (this.lastPlay) {
        if (!this._canBeat(this.lastPlay, cards, cardType)) return { success: false, reason: "cannot_beat" };
      }
      const mainValue = calcMainValue(cardType, cards);
      this.hands[playerIdx] = removeCards(cloneHand(this.hands[playerIdx]), cards);
      this.playerCounts[playerIdx] = this.hands[playerIdx].length;
      this.lastPlay = { type: cardType, cards, main_value: mainValue, player: playerIdx };
      this.lastPlayer = playerIdx;
      this.cardTracker.setPlayerCounts([...this.playerCounts]);
      this.eventBus.emit("play_result", { player: playerIdx, cards, type: cardType, mainValue });
      this.playAnalyzer.recordPlay(playerIdx, cards, cardType, mainValue, isLead);
      if (this.playerCounts[playerIdx] === 0) {
        this._handlePlayerFinished(playerIdx);
      }
      return { success: true, type: cardType, main_value: mainValue };
    }
    /**
     * 过牌 -- 只发射事件
     */
    passCards(playerIdx) {
      this.playAnalyzer.recordPass(playerIdx);
      this.eventBus.emit("play_result", { player: playerIdx, isPass: true });
    }
    _handlePlayerFinished(playerIdx) {
      const rank = Object.keys(this.playerFinishOrder).length + 1;
      this.playerFinishOrder[playerIdx] = rank;
      const names = ["\u81EA\u5DF1", "\u4E0B\u5BB6", "\u961F\u53CB", "\u4E0A\u5BB6"];
      this.eventBus.emit("player_finished", { player: playerIdx, rank });
      const teammateIdx = playerIdx ^ 2;
      if (this.playerFinishOrder[teammateIdx] !== void 0) {
        this._handleDealOver();
      }
    }
    _handleDealOver() {
      this.gameState = "idle";
      const finishedPlayers = Object.keys(this.playerFinishOrder).map(Number);
      for (let i = 0; i < 4; i++) {
        if (!finishedPlayers.includes(i)) {
          const remaining = this.playerCounts[i];
          let rank = finishedPlayers.length + 1;
          for (let j = 0; j < 4; j++) {
            if (!finishedPlayers.includes(j) && j !== i) {
              if (this.playerCounts[j] > remaining) {
                rank++;
              }
            }
          }
          this.playerFinishOrder[i] = rank;
        }
      }
      const entries = Object.entries(this.playerFinishOrder);
      const order = entries.map(([idx, rank]) => [parseInt(idx), parseInt(rank)]).sort((a, b) => a[1] - b[1]).map(([idx]) => idx);
      const rankMap = new Map(entries.map(([idx, rank]) => [parseInt(idx), parseInt(rank)]));
      this.tributeState.lastFinishOrder = [...order];
      const FIRST = order[0];
      const TEAM_IDX = [0, 2].includes(FIRST) ? 0 : 1;
      const TEAMMATE = FIRST ^ 2;
      const TM_RANK = rankMap.get(TEAMMATE) ?? 4;
      const LEVEL_UP = { 2: 3, 3: 2, 4: 1 }[TM_RANK] ?? 1;
      this.teamLevels[TEAM_IDX] += LEVEL_UP;
      this.currentLevel = this.teamLevels[TEAM_IDX];
      this.eventBus.emit("deal_over", {
        dealNumber: this.dealNumber,
        finishOrder: order,
        teamLevels: [...this.teamLevels],
        level: this.currentLevel,
        hands: this.hands.map((h) => cloneHand(h)),
        playHistory: this.playHistory,
        // 出牌历史
        tributeInfo: this.tributeState.tributes.length > 0 ? {
          // 进贡信息（如果有）
          isDoubleDown: this.tributeState.isDoubleDown,
          tributes: this.tributeState.tributes,
          returnTributes: this.tributeState.returnTributes || []
        } : null
      });
    }
    _countAlivePlayers() {
      return this.playerCounts.filter((c) => c > 0).length;
    }
    _detectHandType(cards) {
      if (cards.length < 1) return null;
      const wilds = cards.filter((c) => isWildCard(c));
      const nonWild = cards.filter((c) => !isWildCard(c));
      const wc = wilds.length;
      const n = cards.length;
      if (n === 4 && cards.every((c) => c.suit === "JOKER")) return "four_jokers";
      const count = {};
      for (const c of nonWild) count[c.value] = (count[c.value] || 0) + 1;
      const uniqueValues = Object.keys(count).map(Number);
      if (uniqueValues.length === 1) {
        const val = uniqueValues[0];
        if (n === 1) {
          if (wc === 0) return "single";
          return "pair";
        }
        if (n === 2) {
          if (wc <= 1) return "pair";
          return null;
        }
        if (n === 3) {
          if (count[val] + wc >= 3 && count[val] >= 1) return "triple";
          return null;
        }
        if (count[val] + wc >= n && count[val] >= 1) return "bomb";
        return null;
      }
      if (n === 1) return "single";
      if (n === 2) {
        if (nonWild.length === 2 && nonWild[0].value === nonWild[1].value) return "pair";
        return null;
      }
      if (n === 3) {
        if (nonWild.length === 3 && nonWild[0].value === nonWild[2].value) return "triple";
        return null;
      }
      if (n === 4) {
        if (nonWild.length === 4 && nonWild[0].value === nonWild[3].value) return "bomb";
        return null;
      }
      if (n === 5) {
        {
          const bySuit = {};
          for (const c of nonWild) {
            if (c.suit && c.suit !== "JOKER") {
              if (!bySuit[c.suit]) bySuit[c.suit] = [];
              bySuit[c.suit].push(c.value);
            }
          }
          for (const suit in bySuit) {
            const vals = [...new Set(bySuit[suit])].sort((a, b) => a - b);
            for (let start = 2; start <= 14; start++) {
              let needed = 0;
              for (let v = start; v < start + 5; v++) {
                if (v > 17) break;
                if (!vals.includes(v)) needed++;
              }
              if (needed <= wc) return "flush_straight";
            }
            {
              const requiredForAceLow = [14, 2, 3, 4, 5];
              const existing = requiredForAceLow.filter((v) => vals.includes(v));
              const needed = requiredForAceLow.length - existing.length;
              if (needed <= wc) return "flush_straight";
            }
          }
        }
        {
          const vals = [...new Set(nonWild.map((c) => c.value))].sort((a, b) => a - b);
          for (let start = 2; start <= 14; start++) {
            let needed = 0;
            for (let v = start; v < start + 5; v++) {
              if (v > 17) break;
              if (!vals.includes(v)) needed++;
            }
            if (needed <= wc) return "straight";
          }
          {
            const requiredForAceLow = [14, 2, 3, 4, 5];
            const existing = requiredForAceLow.filter((v) => vals.includes(v));
            const needed = requiredForAceLow.length - existing.length;
            if (needed <= wc) return "straight";
          }
        }
        {
          const keyVals = Object.keys(count).map(Number);
          if (keyVals.length >= 1) {
            for (const tripleVal of keyVals) {
              const tripleNeed = Math.max(0, 3 - count[tripleVal]);
              const remainWild = wc - tripleNeed;
              if (remainWild < 0) continue;
              for (const pairVal of keyVals) {
                if (pairVal === tripleVal) continue;
                if (count[pairVal] + remainWild >= 2 && count[pairVal] >= 1) return "triple_with_pair";
              }
              if (remainWild >= 2) return "triple_with_pair";
            }
          }
        }
        return null;
      }
      if (n === 6) {
        {
          const pairVals = Object.keys(count).map(Number).filter((v) => count[v] >= 2).sort((a, b) => a - b);
          if (pairVals.length >= 3) {
            for (let i = 0; i <= pairVals.length - 3; i++) {
              if (pairVals[i + 1] === pairVals[i] + 1 && pairVals[i + 2] === pairVals[i] + 2) return "three_pairs";
            }
          }
          if (wc > 0) {
            for (let start = 2; start <= 12; start++) {
              let needed = 0;
              for (let v = start; v < start + 3; v++) {
                const existing = count[v] || 0;
                if (existing < 2) needed += 2 - existing;
              }
              if (needed <= wc) return "three_pairs";
            }
            {
              let needed = 0;
              for (const v of [14, 2, 3]) {
                const existing = count[v] || 0;
                if (existing < 2) needed += 2 - existing;
              }
              if (needed <= wc) return "three_pairs";
            }
          }
          if ((count[14] || 0) >= 2 && (count[2] || 0) >= 2 && (count[3] || 0) >= 2) {
            if (wc >= 0) return "three_pairs";
          }
        }
        {
          const tripleVals = Object.keys(count).map(Number).filter((v) => count[v] >= 3).sort((a, b) => a - b);
          if (tripleVals.length >= 2) {
            for (let i = 0; i < tripleVals.length; i++) {
              for (let j = i + 1; j < tripleVals.length; j++) {
                if (tripleVals[j] === tripleVals[i] + 1) return "two_triples";
              }
            }
          }
          for (const tripleVal of tripleVals) {
            const next = tripleVal + 1;
            if (count[next] >= 1) {
              const need = 3 - count[next];
              if (need <= wc) return "two_triples";
            }
          }
          if ((count[14] || 0) >= 3 && (count[2] || 0) >= 3) {
            if (wc >= 0) return "two_triples";
          }
        }
        return null;
      }
      return null;
    }
    _isConsecutive(values) {
      for (let i = 1; i < values.length; i++) {
        if (values[i] !== values[i - 1] + 1) return false;
      }
      return true;
    }
    _canBeat(lastPlay, playedCards, cardType) {
      const lastType = (lastPlay.type || "").toLowerCase();
      const lastMv = lastPlay.main_value || 0;
      if (cardType === "four_jokers") return true;
      const bombClass = ["bomb", "flush_straight"];
      const isBomb = bombClass.includes(cardType);
      const isLastBomb = bombClass.includes(lastType);
      if (isBomb && !isLastBomb) return true;
      if (isBomb && isLastBomb) {
        const mv = calcMainValue(cardType, playedCards);
        return mv > lastMv;
      }
      if (cardType === lastType) {
        const mv = calcMainValue(cardType, playedCards);
        return mv > lastMv;
      }
      return false;
    }
    getSnapshot() {
      return {
        dealNumber: this.dealNumber,
        currentLevel: this.currentLevel,
        hands: this.hands.map((h) => cloneHand(h)),
        playerCounts: [...this.playerCounts],
        gameState: this.gameState,
        currentTurn: this.currentTurn,
        lastPlay: this.lastPlay
      };
    }
  };

  // guandan/src/scoring/v2.js
  var TYPE_BASE = {
    "FOUR_JOKERS": 40,
    "BOMB": 30,
    "FLUSH_STRAIGHT": 25,
    "TRIPLE_WITH_PAIR": 8,
    "TWO_TRIPLES": 6,
    "THREE_PAIRS": 6,
    "STRAIGHT": 5,
    "TRIPLE": 4,
    "PAIR": 2,
    "SINGLE": -3,
    "WILD": -5
  };
  function getSingleValueQuality(mainValue) {
    if (mainValue >= 15) return 4;
    if (mainValue >= 12) return 2;
    if (mainValue >= 10) return 0;
    if (mainValue >= 7) return -1;
    return -2;
  }
  function getOtherValueQuality(mainValue) {
    if (mainValue >= 15) return 1;
    if (mainValue >= 12) return 1;
    if (mainValue <= 6) return -1;
    return 0;
  }
  function getStageBonus(handSize) {
    if (handSize >= 20) return -5;
    if (handSize >= 15) return -3;
    if (handSize >= 10) return -1;
    if (handSize >= 5) return 1;
    return 3;
  }
  function calcScore(cand, handSize = 20) {
    const type = (cand.type || "").toUpperCase();
    if (type === "SINGLE") {
      return getSingleValueQuality(cand.main_value || 0) + getStageBonus(handSize);
    }
    return (TYPE_BASE[type] || 0) + getOtherValueQuality(cand.main_value || 0);
  }
  var V2Scorer = class extends DefaultScorer {
    evaluateCandidates(candidates, handSize = 20) {
      let total = 0;
      const breakdown = {};
      for (const cand of candidates) {
        const score = calcScore(cand, handSize);
        const type = (cand.type || "").toUpperCase();
        breakdown[type] = (breakdown[type] || 0) + score;
        total += score;
      }
      return { total, score_breakdown: breakdown };
    }
    scoreBeatChoice(cand, remaining, handSize = 20) {
      const mainValue = cand.main_value || 0;
      const beatW = handSize >= 15 ? 0.35 : handSize >= 8 ? 0.25 : 0.15;
      const remainW = 1 - beatW;
      let remainingTotal;
      if (Array.isArray(remaining)) {
        const newSize = handSize - (cand.cards ? cand.cards.length : 0);
        remainingTotal = this.evaluateCandidates(remaining, newSize).total;
      } else if (remaining && typeof remaining.total === "number") {
        remainingTotal = remaining.total;
      } else {
        remainingTotal = 0;
      }
      return -mainValue * beatW + remainingTotal * remainW;
    }
    getConfig() {
      return {
        name: "v2",
        TYPE_BASE: { ...TYPE_BASE },
        features: ["unified-score", "value-quality", "stage-bonus", "adaptive-beat-weight"]
      };
    }
  };

  // guandan/src/ai-player/player.js
  var AIPlayer = class {
    constructor(strategy, position, mode) {
      this.strategy = strategy;
      this.position = position;
      this.mode = mode;
    }
    async decide(hand, lastPlay) {
      throw new Error("decide() must be implemented by mode");
    }
  };

  // guandan/src/ai-player/modes/pure-ai.js
  var PureAIPlayer = class extends AIPlayer {
    constructor(strategy, position) {
      super(strategy, position, "pure-ai");
    }
    async decide(hand, lastPlay) {
      return await this.strategy.decide(hand, lastPlay);
    }
  };

  // guandan/js/game-loop.js
  var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function waitUserWithTimeout(ui2, decision, mpConfig) {
    if (!mpConfig || !mpConfig.autoPlayEnabled) {
      return ui2.waitUserAction();
    }
    const timeoutMs = (mpConfig.autoPlayTimeout || 15) * 1e3;
    let timerId;
    const timeoutPromise = new Promise((resolve) => {
      timerId = setTimeout(() => {
        if (!ui2._resolve) return;
        ui2.addLog(`[\u8D85\u65F6] ${mpConfig.autoPlayTimeout || 15}\u79D2\u672A\u64CD\u4F5C\uFF0C\u81EA\u52A8\u51FA\u724C`);
        const r = ui2._resolve;
        ui2._resolve = null;
        ui2.hideMyTurn();
        if (decision && decision.action === "play" && decision.cards && decision.cards.length > 0) {
          r({ action: "play", cards: decision.cards });
        } else {
          r({ action: "pass" });
        }
        resolve("__timeout__");
      }, timeoutMs);
    });
    const userPromise = ui2.waitUserAction().then((action) => {
      clearTimeout(timerId);
      return action;
    });
    return Promise.race([userPromise, timeoutPromise]).then((result) => {
      clearTimeout(timerId);
      if (result === "__timeout__") {
        if (decision && decision.action === "play" && decision.cards && decision.cards.length > 0) {
          return { action: "play", cards: decision.cards };
        }
        return { action: "pass" };
      }
      return result;
    });
  }
  function _nextAlive(game2, fromIdx, ui2) {
    let idx = fromIdx;
    let count = 0;
    while (count < 4) {
      idx = (idx + 1) % 4;
      if (game2.lastPlay && game2.lastPlay.player === idx) {
        game2.lastPlay = null;
        if (game2.playerCounts[idx] === 0) {
          const oldIdx = idx;
          idx = (idx + 2) % 4;
          ui2.addLog(`\u3010${POS_NAMES[oldIdx]}\u3011\u5DF2\u51FA\u5B8C\uFF0C\u3010${POS_NAMES[idx]}\u3011\u63A5\u724C\u9996\u53D1`);
        }
      }
      if (game2.playerCounts[idx] > 0) return idx;
      count++;
    }
    return idx;
  }
  async function playOneDeal(game2, players2, ui2, mpConfig = null) {
    if (!mpConfig) {
      await game2.startGame();
    }
    ui2.clearLastPlays();
    game2.cardTracker.initKingFromHand(game2.hands[0]);
    let loopCount = 0;
    const maxLoops = 500;
    while (game2.gameState === "playing" && loopCount < maxLoops) {
      loopCount++;
      const currentTurn = game2.currentTurn;
      const player = players2[currentTurn];
      const posName = POS_NAMES[currentTurn];
      const isRemote = mpConfig && mpConfig.localDivision[currentTurn] === "remote";
      if (currentTurn === 0) {
        ui2.setTurnInfo("\u8F6E\u5230\u4F60\u51FA\u724C");
        ui2.updateHand(game2.hands[0]);
        const hand = game2.hands[0];
        const lastPlay = game2.lastPlay;
        const decision = await player.aiPlayer.decide(hand, lastPlay, game2.playHistory);
        const candidates = player.aiPlayer.strategy._groupsCache?.candidates || [];
        ui2.showMyTurn(hand, lastPlay, decision, candidates, game2.cardTracker, game2.playAnalyzer);
        const userAction = await waitUserWithTimeout(ui2, decision, mpConfig);
        let finalSend = null;
        if (userAction.action === "play") {
          const result = game2.playCards(0, userAction.cards);
          if (!result.success) {
            ui2.showToast(`\u51FA\u724C\u5931\u8D25: ${result.reason}`);
            const newDecision = await player.aiPlayer.decide(game2.hands[0], game2.lastPlay);
            const newCands = player.aiPlayer.strategy._groupsCache?.candidates || [];
            ui2.showMyTurn(game2.hands[0], game2.lastPlay, newDecision, newCands, game2.cardTracker, game2.playAnalyzer);
            const retryAction = await waitUserWithTimeout(ui2, newDecision, mpConfig);
            if (retryAction.action === "play") {
              const retryResult = game2.playCards(0, retryAction.cards);
              if (!retryResult.success) {
                game2.passCards(0);
                finalSend = { type: "PASS_ACTION" };
              } else {
                player.aiPlayer.strategy.updateCacheAfterPlay(game2.hands[0], retryAction.cards);
                game2.cardTracker.cardsOut(retryAction.cards, 0);
                game2.cardTracker.updateKingAfterPlay(
                  { type: "play", cards: retryAction.cards },
                  0,
                  null,
                  ""
                );
                ui2.updateHand(game2.hands[0]);
                finalSend = { type: "PLAY_ACTION", cards: retryAction.cards, playType: retryResult.type };
              }
            } else {
              game2.passCards(0);
              finalSend = { type: "PASS_ACTION" };
            }
          } else {
            player.aiPlayer.strategy.updateCacheAfterPlay(game2.hands[0], userAction.cards);
            game2.cardTracker.cardsOut(userAction.cards, 0);
            game2.cardTracker.updateKingAfterPlay(
              { type: "play", cards: userAction.cards },
              0,
              null,
              ""
            );
            ui2.updateHand(game2.hands[0]);
            finalSend = { type: "PLAY_ACTION", cards: userAction.cards, playType: result.type };
          }
        } else {
          game2.passCards(0);
          finalSend = { type: "PASS_ACTION" };
        }
        if (mpConfig && finalSend) {
          if (finalSend.type === "PLAY_ACTION") {
            mpConfig.network.send("PLAY_ACTION", {
              player: mpConfig.localToGlobal[0],
              cards: finalSend.cards,
              type: finalSend.playType
            });
          } else {
            mpConfig.network.send("PASS_ACTION", {
              player: mpConfig.localToGlobal[0]
            });
          }
        }
      } else if (isRemote) {
        const label = currentTurn === mpConfig.remoteLocalHumanPos ? `\u7B49\u5F85 ${posName} \u64CD\u4F5C...` : `${posName} \u64CD\u4F5C\u4E2D...`;
        ui2.setTurnInfo(label);
        ui2.clearLastPlay(currentTurn);
        let remoteAction;
        try {
          remoteAction = await mpConfig.waitForRemote(currentTurn);
        } catch (e) {
          ui2.addLog(`\u3010\u8054\u673A\u3011\u8FDE\u63A5\u4E2D\u65AD: ${e.message}`);
          ui2.setTurnInfo("\u8054\u673A\u8FDE\u63A5\u4E2D\u65AD");
          game2.gameState = "idle";
          return;
        }
        if (remoteAction && remoteAction.type === "PLAY_ACTION") {
          const prevLastPlay = game2.lastPlay;
          const result = game2.playCards(currentTurn, remoteAction.data.cards);
          if (result.success) {
            game2.cardTracker.cardsOut(remoteAction.data.cards, currentTurn);
            game2.cardTracker.updateKingAfterPlay(
              { type: "play", cards: remoteAction.data.cards },
              currentTurn,
              prevLastPlay,
              game2.lastPlay?.type
            );
            ui2.updateHand(game2.hands[0]);
          } else {
            game2.passCards(currentTurn);
          }
        } else {
          game2.passCards(currentTurn);
          game2.cardTracker.updateKingAfterPlay(
            { type: "pass", cards: [] },
            currentTurn,
            game2.lastPlay,
            ""
          );
        }
        ui2.updatePlayerCounts(game2.playerCounts);
      } else {
        ui2.setTurnInfo(`${posName} \u601D\u8003\u4E2D`);
        ui2.clearLastPlay(currentTurn);
        const aiDelay = ui2.aiDelay;
        const startTime = Date.now();
        let decision;
        try {
          decision = await player.aiPlayer.decide(game2.hands[currentTurn], game2.lastPlay, game2.playHistory);
        } catch (e) {
          decision = { action: "pass" };
        }
        if (!decision || !decision.action) {
          decision = { action: "pass" };
        }
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, aiDelay - elapsed);
        if (remaining > 0) {
          await sleep(remaining);
        }
        if (decision.action === "play") {
          const prevLastPlay = game2.lastPlay;
          const result = game2.playCards(currentTurn, decision.cards);
          if (!result.success) {
            game2.passCards(currentTurn);
            if (mpConfig) {
              mpConfig.network.send("PASS_ACTION", { player: mpConfig.localToGlobal[currentTurn] });
            }
          } else {
            player.aiPlayer.strategy.updateCacheAfterPlay(game2.hands[currentTurn], decision.cards);
            game2.cardTracker.cardsOut(decision.cards, currentTurn);
            game2.cardTracker.updateKingAfterPlay(
              { type: "play", cards: decision.cards },
              currentTurn,
              prevLastPlay,
              game2.lastPlay.type
            );
            if (mpConfig) {
              mpConfig.network.send("PLAY_ACTION", {
                player: mpConfig.localToGlobal[currentTurn],
                cards: decision.cards,
                type: result.type
              });
            }
          }
        } else {
          game2.passCards(currentTurn);
          game2.cardTracker.updateKingAfterPlay(
            { type: "pass", cards: [] },
            currentTurn,
            game2.lastPlay,
            ""
          );
          if (mpConfig) {
            mpConfig.network.send("PASS_ACTION", { player: mpConfig.localToGlobal[currentTurn] });
          }
        }
      }
      game2.currentTurn = _nextAlive(game2, currentTurn, ui2);
    }
    if (loopCount >= maxLoops) {
      ui2.addLog("[WARN] \u8FBE\u5230\u6700\u5927\u5FAA\u73AF\u6B21\u6570\uFF0C\u505C\u6B62");
    }
  }
  function buildDealOverHtml(data, dealsPlayed, isGameEnd, ui2) {
    const finishOrder = data.finishOrder || [];
    const rankStr = finishOrder.map((idx, i) => `${POS_NAMES[idx]}(#${i + 1})`).join(", ");
    ui2.addLog(`\u7B2C${data.dealNumber}\u526F\u7ED3\u675F: ${rankStr}`);
    ui2.addLog(`\u7EA7\u724C: \u81EA\u5DF1\u961F=${data.teamLevels[0]}, \u5BF9\u65B9\u961F=${data.teamLevels[1]}, \u4E0B\u5C40=${data.level}`);
    const finishedSet = new Set(finishOrder);
    const RANK_MEDALS = { 1: "\u{1F947}", 2: "\u{1F948}", 3: "\u{1F949}", 4: "4\uFE0F\u20E3" };
    const sortedRanks = finishOrder.map((idx, i) => ({ idx, rank: i + 1 }));
    for (let i = 0; i < 4; i++) {
      if (!finishedSet.has(i)) sortedRanks.push({ idx: i, rank: null });
    }
    let html = '<div class="deal-over-rank">';
    for (const item of sortedRanks) {
      const medal = item.rank ? RANK_MEDALS[item.rank] : "\u2014";
      const rankLabel = item.rank ? `\u7B2C${item.rank}\u540D` : "\u672A\u5B8C\u8D5B";
      const nameClass = item.idx === 0 || item.idx === 2 ? "our-team" : "enemy-team";
      const teamLabel = item.idx === 0 || item.idx === 2 ? "\u6211\u65B9" : "\u5BF9\u65B9";
      html += `<div class="rank-item ${nameClass}">
            <span class="rank-medal">${medal}</span>
            <span class="rank-label">${rankLabel}</span>
            <span class="rank-name">${POS_NAMES[item.idx]}</span>
            <span class="rank-team">${teamLabel}</span>
        </div>`;
    }
    html += "</div>";
    html += '<div class="deal-over-hands">';
    html += "<h4>\u5269\u4F59\u624B\u724C</h4>";
    for (let i = 0; i < 4; i++) {
      const hand = data.hands ? data.hands[i] : null;
      const nameClass = i === 0 || i === 2 ? "our-team" : "enemy-team";
      html += `<div class="hand-item ${nameClass}">`;
      html += `<span class="hand-name">${POS_NAMES[i]}</span>`;
      if (hand && hand.length > 0) {
        html += '<span class="hand-cards">';
        html += hand.map((c) => ui2._renderCardMini(c)).join("");
        html += "</span>";
      } else {
        html += '<span class="hand-empty">\u5DF2\u51FA\u5B8C</span>';
      }
      html += "</div>";
    }
    html += "</div>";
    html += `<div class="deal-over-meta">
        <div class="meta-row"><span class="meta-label">\u6211\u65B9\u7EA7\u724C</span><span class="meta-value">${data.teamLevels[0]}</span></div>
        <div class="meta-row"><span class="meta-label">\u5BF9\u65B9\u7EA7\u724C</span><span class="meta-value">${data.teamLevels[1]}</span></div>
        <div class="meta-row"><span class="meta-label">\u4E0B\u5C40\u7EA7\u724C</span><span class="meta-value highlight">${data.level}</span></div>
        <div class="meta-row"><span class="meta-label">\u5DF2\u5B8C\u6210</span><span class="meta-value">${dealsPlayed} \u526F\u724C</span></div>
    </div>`;
    ui2.addLog("=== \u5269\u4F59\u724C ===");
    for (let i = 0; i < 4; i++) {
      const hand = data.hands ? data.hands[i] : null;
      const name = POS_NAMES[i];
      if (hand && hand.length > 0) {
        const cardStr = hand.map((c) => c.display).join(" ");
        ui2.addLog(`${name}: ${cardStr}`);
      } else {
        ui2.addLog(`${name}: \u5DF2\u51FA\u5B8C`);
      }
    }
    ui2.addLog("===============");
    const title = isGameEnd ? "\u6E38\u620F\u7ED3\u675F" : "\u672C\u526F\u7ED3\u675F";
    return { html, title, finishOrder, sortedRanks };
  }
  async function runGame(game2, players2, ui2, eventBus2, maxDeals = Infinity) {
    const MAX_LEVEL = 14;
    let dealsPlayed = 0;
    const onDealOver = (data) => {
      const isGameEnd = game2.currentLevel >= MAX_LEVEL || maxDeals !== Infinity && dealsPlayed >= maxDeals;
      const { html, title, sortedRanks } = buildDealOverHtml(data, dealsPlayed, isGameEnd, ui2);
      let fullHtml = html;
      fullHtml += '<div class="modal-actions">';
      fullHtml += '<button id="btn-close-deal">\u5173\u95ED</button>';
      if (isGameEnd) {
        fullHtml += '<button id="btn-next-deal" class="btn-new-game">\u65B0\u6E38\u620F</button>';
      } else {
        fullHtml += '<button id="btn-next-deal">\u4E0B\u4E00\u526F</button>';
      }
      fullHtml += "</div>";
      ui2.showDealOver(fullHtml, title);
    };
    eventBus2.off("deal_over", onDealOver);
    eventBus2.on("deal_over", onDealOver);
    try {
      while (dealsPlayed < maxDeals && game2.currentLevel < MAX_LEVEL) {
        dealsPlayed++;
        await playOneDeal(game2, players2, ui2);
        ui2.addLog(`\u5DF2\u5B8C\u6210 ${dealsPlayed} \u526F\u724C`);
        if (game2.gameState === "idle") {
          const isGameEnd = game2.currentLevel >= MAX_LEVEL || maxDeals !== Infinity && dealsPlayed >= maxDeals;
          ui2.setTurnInfo(isGameEnd ? "\u6E38\u620F\u7ED3\u675F" : "\u7B49\u5F85\u4E0B\u4E00\u526F");
          await new Promise((resolve) => {
            const nextBtn = document.getElementById("btn-next-deal");
            const closeBtn = document.getElementById("btn-close-deal");
            if (!nextBtn) {
              resolve();
              return;
            }
            nextBtn.onclick = () => {
              nextBtn.onclick = null;
              if (closeBtn) closeBtn.onclick = null;
              if (isGameEnd && ui2.onNewGame) {
                document.getElementById("deal-over-modal").classList.add("hidden");
                ui2.onNewGame();
              } else {
                document.getElementById("deal-over-modal").classList.add("hidden");
                resolve();
              }
            };
            if (closeBtn) {
              closeBtn.onclick = () => {
                document.getElementById("deal-over-modal").classList.add("hidden");
              };
            }
          });
        }
        if (maxDeals !== Infinity && dealsPlayed >= maxDeals) break;
      }
    } finally {
      eventBus2.off("deal_over", onDealOver);
    }
    let reason = game2.currentLevel >= MAX_LEVEL ? "\u7EA7\u724C\u5347\u81F3\u6700\u9AD8(A)" : `\u5DF2\u5B8C\u6210 ${maxDeals} \u526F\u724C`;
    ui2.addLog(`\u6E38\u620F\u7ED3\u675F (${reason})\uFF0C\u5171 ${dealsPlayed} \u526F\u724C`);
    ui2.setTurnInfo("\u6E38\u620F\u7ED3\u675F");
  }

  // guandan/js/ui.js
  var POS_NAMES2 = ["\u81EA\u5DF1", "\u4E0B\u5BB6", "\u961F\u53CB", "\u4E0A\u5BB6"];
  var SUIT_ORDER = { SPADE: 0, CLUB: 1, DIAMOND: 2, HEART: 3 };
  var CARD_W = 30;
  var CAND_TYPE_NAMES = {
    SINGLE: "\u5355\u5F20",
    PAIR: "\u5BF9\u5B50",
    TRIPLE: "\u4E09\u5F20",
    TRIPLE_WITH_PAIR: "\u4E09\u5E26",
    STRAIGHT: "\u987A\u5B50",
    FLUSH_STRAIGHT: "\u540C\u82B1",
    BOMB: "\u70B8\u5F39",
    THREE_PAIRS: "\u4E09\u5BF9",
    TWO_TRIPLES: "\u94A2\u677F",
    FOUR_JOKERS: "\u5929\u70B8",
    WILD: "\u4E07\u80FD"
  };
  function getCardColorClass(card) {
    if (card.suit === "JOKER") return card.value === 17 ? "red" : "black";
    return SUIT_COLOR[card.suit] || "black";
  }
  function getRankText(card) {
    if (card.suit === "JOKER") return card.value === 17 ? "\u5927\u738B" : "\u5C0F\u738B";
    return VALUE_TO_DISPLAY[card.value] || String(card.value);
  }
  function getSuitText(card) {
    if (card.suit === "JOKER") return "";
    return SUIT_SYMBOL[card.suit] || "";
  }
  var UI = class {
    constructor() {
      this._el = {
        gameBar: document.getElementById("game-bar"),
        gameInfo: document.getElementById("game-info"),
        turnInfo: document.getElementById("turn-info"),
        counts: document.getElementById("counts"),
        myHand: document.getElementById("my-hand"),
        btnPlay: document.getElementById("btn-play"),
        btnPass: document.getElementById("btn-pass"),
        btnNew: document.getElementById("btn-new"),
        btnLog: document.getElementById("btn-log"),
        btnLogClose: document.getElementById("btn-log-close"),
        btnCancel: document.getElementById("btn-cancel"),
        logPanel: document.getElementById("log-panel"),
        logContent: document.getElementById("log-content"),
        tributeModal: document.getElementById("tribute-modal"),
        tributeContent: document.getElementById("tribute-content"),
        dealOverModal: document.getElementById("deal-over-modal"),
        dealOverBox: document.getElementById("deal-over-box"),
        toast: document.getElementById("toast"),
        // 牌桌浮层
        tableOverlay: document.getElementById("table-overlay"),
        tablePanel: document.getElementById("table-panel"),
        candidateList: document.getElementById("candidate-list"),
        btnTableClose: document.getElementById("btn-table-close"),
        tableTurnInfo: document.getElementById("table-turn-info"),
        tableTopCount: document.querySelector("#pos-teammate .card-count"),
        tableTopLastPlay: document.querySelector("#pos-teammate .last-play-area"),
        tableLeftCount: document.querySelector("#pos-left .card-count"),
        tableLeftLastPlay: document.querySelector("#pos-left .last-play-area"),
        tableRightCount: document.querySelector("#pos-right .card-count"),
        tableRightLastPlay: document.querySelector("#pos-right .last-play-area"),
        tableMyCount: document.querySelector("#my-area .card-count"),
        tableMyLastPlay: document.getElementById("my-last-play")
      };
      this._myHand = [];
      this._selectedIndices = /* @__PURE__ */ new Set();
      this._lastPlay = null;
      this._isMyTurn = false;
      this._lastPlays = {};
      this._resolve = null;
      this._actionPromise = null;
      this._toastTimer = null;
      this._passPending = false;
      this._log = [];
      this._candidates = [];
      this._selectedCandidates = /* @__PURE__ */ new Set();
      this._tableOpen = false;
      this.onNewGame = null;
      this.onLLMRequest = null;
      this._el.myHand.addEventListener("click", (e) => {
        const cardEl = e.target.closest(".card");
        if (!cardEl || !this._isMyTurn) return;
        this._toggleCard(parseInt(cardEl.dataset.idx, 10));
      });
      this._el.btnPlay.addEventListener("click", () => this._doPlay());
      this._el.gameBar.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        if (e.target.closest(".card")) return;
        this._toggleTableOverlay();
        const modal = this._el.dealOverModal;
        if (modal && !modal.classList.contains("hidden")) modal.classList.add("hidden");
      });
      if (this._el.btnTableClose) {
        this._el.btnTableClose.addEventListener("click", () => this._closeTableOverlay());
      }
      if (this._el.tableTurnInfo) {
        this._el.tableTurnInfo.addEventListener("click", () => {
          if (this._isMyTurn && this._resolve) {
            this._selectedIndices.size > 0 ? this._doPlay() : this._doPass();
            return;
          }
          const modal = this._el.dealOverModal;
          const nextBtn = document.getElementById("btn-next-deal");
          if (nextBtn) {
            nextBtn.click();
            return;
          }
          if (modal && !modal.classList.contains("hidden")) {
            modal.classList.add("hidden");
          }
        });
      }
      this._el.btnPass.addEventListener("click", () => this._doPass());
      this._el.btnNew.addEventListener("click", () => {
        if (this.onNewGame) this.onNewGame();
      });
      this._el.btnLog.addEventListener("click", () => this._el.logPanel.classList.toggle("hidden"));
      this._el.btnLogClose.addEventListener("click", () => this._el.logPanel.classList.add("hidden"));
      this._el.btnCancel.addEventListener("click", () => this._clearSelection());
      window.addEventListener("resize", () => {
        if (this._tableOpen) {
          this._syncSidePlayAreas();
          this._renderCandidates();
          this._updateTableInfo();
        }
      });
    }
    _clearSelection() {
      if (this._selectedIndices.size === 0 && this._selectedCandidates.size === 0) return;
      this._selectedIndices.clear();
      this._selectedCandidates.clear();
      this._el.myHand.innerHTML = this._renderHand(this._myHand, this._isMyTurn, this._selectedIndices);
      if (this._tableOpen) this._renderCandidates();
    }
    get llmConfig() {
      return null;
    }
    get aiDelay() {
      return 300;
    }
    updateLLMPanel() {
    }
    setLLMError() {
    }
    setLLMLoading() {
    }
    updateMultiplayerStatus() {
    }
    // ---------- 信息显示 ----------
    updateGameInfo(text) {
      this._el.gameInfo.textContent = text || "\u2014";
    }
    setTurnInfo(text) {
      this._el.turnInfo.textContent = text || "";
      if (this._el.tableTurnInfo) this._el.tableTurnInfo.textContent = text || "";
    }
    updatePlayerCounts(counts) {
      this._counts = counts;
      this._el.counts.innerHTML = [0, 1, 2, 3].map((p) => {
        const play = this._lastPlays[p];
        let cardsHtml = "";
        if (play) {
          cardsHtml = play.isPass ? '<span class="mini-cards lp-cards">\u8FC7</span>' : `<span class="mini-cards lp-cards">${(play.cards || []).map((c) => this._renderCardMini(c)).join("")}</span>`;
        }
        return `<span class="count-group ${p === 0 ? "self" : ""}"><span class="count-chip">${POS_NAMES2[p]}: ${counts[p]}</span>` + cardsHtml + `</span>`;
      }).join("");
      this._updateTableInfo();
    }
    updateLastPlay(position, play) {
      this._lastPlays[position] = play;
      if (this._counts) this.updatePlayerCounts(this._counts);
    }
    clearLastPlay(position) {
      this._lastPlays[position] = null;
      if (this._counts) this.updatePlayerCounts(this._counts);
    }
    clearLastPlays() {
      this._lastPlays = {};
      if (this._counts) this.updatePlayerCounts(this._counts);
    }
    // ---------- 手牌渲染（一排，按 value 分组，组内 1/3 重叠，组间留间隙） ----------
    updateHand(hand, clickable = false) {
      this._myHand = hand;
      this._el.myHand.innerHTML = this._renderHand(hand, clickable, this._selectedIndices);
    }
    _renderHand(hand, clickable, selectedSet) {
      const indexed = hand.map((card, idx) => ({ card, idx }));
      indexed.sort((a, b) => {
        const la = a.card.level_value ?? a.card.value;
        const lb = b.card.level_value ?? b.card.value;
        if (la !== lb) return la - lb;
        const sa = a.card.suit === "JOKER" ? 4 : SUIT_ORDER[a.card.suit] ?? 4;
        const sb = b.card.suit === "JOKER" ? 4 : SUIT_ORDER[b.card.suit] ?? 4;
        return sa - sb;
      });
      const groups = /* @__PURE__ */ new Map();
      indexed.forEach(({ card, idx }) => {
        const key = card.level_value ?? card.value;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ card, idx });
      });
      const sortedValues = [...groups.keys()].sort((a, b) => a - b);
      let html = "";
      sortedValues.forEach((value, gi) => {
        const items = groups.get(value);
        items.sort((a, b) => {
          const sa = a.card.suit === "JOKER" ? 4 : SUIT_ORDER[a.card.suit] ?? 4;
          const sb = b.card.suit === "JOKER" ? 4 : SUIT_ORDER[b.card.suit] ?? 4;
          return sa - sb;
        });
        items.forEach((item, ci) => {
          const selected = selectedSet ? selectedSet.has(item.idx) : false;
          let ml;
          if (gi === 0 && ci === 0) ml = 0;
          else if (ci === 0) ml = 0.2 * CARD_W;
          else ml = -0.33 * CARD_W;
          const extra = (clickable ? "clickable " : "") + (selected ? "selected" : "");
          html += this._renderCard(item.card, item.idx, extra, ml);
        });
      });
      return html;
    }
    _renderCard(card, idx, extra, marginLeft) {
      const color = getCardColorClass(card);
      const wild = isWildCard(card) ? "wild" : "";
      const rank = getRankText(card);
      const suit = getSuitText(card);
      const idxAttr = idx !== void 0 ? `data-idx="${idx}"` : "";
      const ml = marginLeft !== void 0 ? `style="margin-left:${marginLeft}px"` : "";
      return `<div class="card ${color} ${wild} ${extra}" ${idxAttr} ${ml}><span class="card-value-tl">${rank}</span><span class="card-suit">${suit}</span><span class="card-value-br">${rank}</span></div>`;
    }
    _renderCardMini(card) {
      const color = getCardColorClass(card);
      const rank = getRankText(card);
      const suit = getSuitText(card);
      return `<span class="card-mini ${color}"><span class="cm-rank">${rank}</span><span class="cm-suit">${suit}</span></span>`;
    }
    _renderCardMax(card) {
      const color = getCardColorClass(card);
      const rank = getRankText(card);
      const suit = getSuitText(card);
      return `<span class="card-max ${color}"><span class="cm-rank">${rank}</span><span class="cm-suit">${suit}</span></span>`;
    }
    /** 按牌桌（正方形）边长选择牌大小：<360 mini / 360~540 游戏栏普通牌 / >540 max 大号 */
    _getTableCardSize() {
      const panel = this._el.tablePanel;
      if (!panel) return "normal";
      const w = panel.getBoundingClientRect().width;
      if (w < 360) return "mini";
      if (w > 540) return "max";
      return "normal";
    }
    /** 上家/下家出牌区宽度跟随牌桌大小：牌桌越大区域越宽 */
    _syncSidePlayAreas() {
      const panel = this._el.tablePanel;
      if (!panel) return;
      const w = panel.getBoundingClientRect().width;
      const sideW = Math.max(90, Math.min(220, Math.round(w * 0.35)));
      for (const id of ["pos-left", "pos-right"]) {
        const el = document.getElementById(id);
        if (el) el.style.width = sideW + "px";
      }
    }
    _renderTableCard(card) {
      const size = this._getTableCardSize();
      if (size === "mini") return this._renderCardMini(card);
      if (size === "max") return this._renderCardMax(card);
      return this._renderCard(card, void 0, "", 0);
    }
    // ---------- 选牌 ----------
    _toggleCard(idx) {
      if (this._selectedIndices.has(idx)) this._selectedIndices.delete(idx);
      else this._selectedIndices.add(idx);
      const el = this._el.myHand.querySelector(`.card[data-idx="${idx}"]`);
      if (el) el.classList.toggle("selected", this._selectedIndices.has(idx));
    }
    _selectCardsLike(cards) {
      this._selectedIndices.clear();
      const remaining = cards.slice();
      this._myHand.forEach((card, idx) => {
        if (remaining.length === 0) return;
        const i = remaining.findIndex((c) => c.value === card.value && c.suit === card.suit);
        if (i >= 0) {
          this._selectedIndices.add(idx);
          remaining.splice(i, 1);
        }
      });
    }
    // 找出候选组牌（组牌列表）中能拼成给定出牌集合的组，返回其下标
    _matchCandidateIndices(cards) {
      if (!cards || cards.length === 0) return [];
      const key = (c) => `${c.value}|${c.suit}`;
      const need = /* @__PURE__ */ new Map();
      for (const c of cards) {
        const k = key(c);
        need.set(k, (need.get(k) || 0) + 1);
      }
      const consumed = /* @__PURE__ */ new Map();
      const result = [];
      for (let i = 0; i < this._candidates.length; i++) {
        const cand = this._candidates[i];
        if (!cand || !cand.cards || cand.cards.length === 0) continue;
        const tmp = /* @__PURE__ */ new Map();
        let ok = true;
        for (const c of cand.cards) {
          const k = key(c);
          const left = (need.get(k) || 0) - (consumed.get(k) || 0) - (tmp.get(k) || 0);
          if (left <= 0) {
            ok = false;
            break;
          }
          tmp.set(k, (tmp.get(k) || 0) + 1);
        }
        if (ok) {
          for (const c of cand.cards) {
            const k = key(c);
            consumed.set(k, (consumed.get(k) || 0) + 1);
          }
          result.push(i);
        }
      }
      let covered = 0;
      for (const n of consumed.values()) covered += n;
      return covered === cards.length ? result : [];
    }
    /** 向选中集合添加/移除指定牌（多选叠加） */
    _selectCards(cards, add) {
      const remaining = cards.slice();
      this._myHand.forEach((card, idx) => {
        if (remaining.length === 0) return;
        const i = remaining.findIndex((c) => c.value === card.value && c.suit === card.suit);
        if (i >= 0) {
          if (add) this._selectedIndices.add(idx);
          else this._selectedIndices.delete(idx);
          remaining.splice(i, 1);
        }
      });
    }
    // ---------- 轮到自己 ----------
    showMyTurn(hand, lastPlay, decision, candidates, cardTracker, playAnalyzer) {
      this._myHand = hand;
      this._lastPlay = lastPlay;
      this._isMyTurn = true;
      this._selectedIndices.clear();
      this._selectedCandidates.clear();
      this._candidates = Array.isArray(candidates) ? candidates : [];
      if (decision && decision.action === "play" && decision.cards) {
        this._selectCardsLike(decision.cards);
        for (const i of this._matchCandidateIndices(decision.cards)) {
          this._selectedCandidates.add(i);
        }
      }
      this.updateHand(hand, true);
      this._enableButtons();
      this.setTurnInfo("\u8F6E\u5230\u4F60\u51FA\u724C");
      if (this._tableOpen) {
        this._renderCandidates();
        this._updateTableInfo();
      }
      this._actionPromise = new Promise((res) => {
        this._resolve = res;
      });
    }
    waitUserAction() {
      if (!this._actionPromise) this._actionPromise = new Promise((res) => {
        this._resolve = res;
      });
      return this._actionPromise;
    }
    hideMyTurn() {
      this._isMyTurn = false;
      this._disableButtons();
      this._selectedIndices.clear();
      this._selectedCandidates.clear();
      this.updateHand(this._myHand, false);
    }
    _enableButtons() {
      this._el.btnPlay.disabled = false;
      this._el.btnPass.disabled = false;
    }
    _disableButtons() {
      this._el.btnPlay.disabled = true;
      this._el.btnPass.disabled = true;
    }
    _collectSelected() {
      return [...this._selectedIndices].sort((a, b) => a - b).map((i) => this._myHand[i]);
    }
    _doPlay() {
      if (!this._resolve) return;
      const cards = this._collectSelected();
      if (cards.length === 0) {
        if (this._passPending) {
          this._doPass();
          return;
        }
        this.showToast("\u8BF7\u9009\u62E9\u8981\u51FA\u7684\u724C", true);
        return;
      }
      this._finish({ action: "play", cards });
    }
    _doPass() {
      if (!this._resolve) return;
      if (!this._lastPlay) {
        this.showToast("\u4F60\u662F\u9996\u53D1\uFF0C\u5FC5\u987B\u51FA\u724C");
        return;
      }
      this._finish({ action: "pass" });
    }
    _finish(action) {
      const r = this._resolve;
      this._resolve = null;
      this._isMyTurn = false;
      this._disableButtons();
      this._selectedIndices.clear();
      this._selectedCandidates.clear();
      if (r) r(action);
    }
    // ---------- 牌桌浮层 ----------
    _toggleTableOverlay() {
      if (this._tableOpen) this._closeTableOverlay();
      else this._openTableOverlay();
    }
    _openTableOverlay() {
      this._tableOpen = true;
      this._el.tableOverlay.classList.remove("hidden");
      this._syncSidePlayAreas();
      this._renderCandidates();
      this._updateTableInfo();
    }
    _closeTableOverlay() {
      this._tableOpen = false;
      this._el.tableOverlay.classList.add("hidden");
    }
    /** 渲染左栏组牌列表（showMyTurn 的 candidates，支持多选） */
    _renderCandidates() {
      const list = this._el.candidateList;
      if (!list) return;
      if (!this._candidates || this._candidates.length === 0) {
        list.innerHTML = '<div class="candidate-empty">\u6682\u65E0\u7EC4\u724C\u65B9\u6848</div>';
        return;
      }
      list.innerHTML = this._candidates.map((c, i) => {
        const typeName = CAND_TYPE_NAMES[c.type] || c.type || "";
        const cardsHtml = (c.cards || []).map((card) => this._renderCardMini(card)).join("");
        const sel = this._selectedCandidates.has(i) ? " selected" : "";
        return `<div class="candidate-group${sel}" data-cidx="${i}"><span class="candidate-type">${typeName}</span><span class="candidate-cards mini-cards">${cardsHtml}</span></div>`;
      }).join("");
      list.querySelectorAll(".candidate-group").forEach((el) => {
        el.addEventListener("click", () => this._onCandidateClick(parseInt(el.dataset.cidx, 10)));
      });
    }
    _onCandidateClick(i) {
      const cand = this._candidates[i];
      if (!cand || !cand.cards || cand.cards.length === 0) return;
      if (this._selectedCandidates.has(i)) {
        this._selectedCandidates.delete(i);
        this._selectCards(cand.cards, false);
      } else {
        this._selectedCandidates.add(i);
        this._selectCards(cand.cards, true);
      }
      this._el.myHand.innerHTML = this._renderHand(this._myHand, this._isMyTurn, this._selectedIndices);
      this._renderCandidates();
    }
    /** 同步牌桌：四家剩余张数 + 各家最后出牌 */
    _updateTableInfo() {
      if (!this._tableOpen) return;
      const counts = this._counts || [0, 0, 0, 0];
      if (this._el.tableTopCount) this._el.tableTopCount.textContent = counts[2];
      if (this._el.tableLeftCount) this._el.tableLeftCount.textContent = counts[3];
      if (this._el.tableRightCount) this._el.tableRightCount.textContent = counts[1];
      if (this._el.tableMyCount) this._el.tableMyCount.textContent = counts[0];
      const areas = [
        { area: this._el.tableTopLastPlay, pos: 2 },
        // 队友
        { area: this._el.tableLeftLastPlay, pos: 3 },
        // 上家
        { area: this._el.tableRightLastPlay, pos: 1 },
        // 下家
        { area: this._el.tableMyLastPlay, pos: 0 }
        // 自己
      ];
      for (const { area, pos } of areas) {
        if (!area) continue;
        const play = this._lastPlays[pos];
        if (!play) {
          area.innerHTML = "";
          continue;
        }
        area.innerHTML = play.isPass ? '<span class="table-pass">\u8FC7</span>' : `<span class="mini-cards">${(play.cards || []).map((c) => this._renderTableCard(c)).join("")}</span>`;
      }
    }
    // ---------- 日志 / 提示 ----------
    addLog(msg) {
      this._log.push(msg);
      const div = document.createElement("div");
      div.textContent = msg;
      this._el.logContent.appendChild(div);
      this._el.logContent.scrollTop = this._el.logContent.scrollHeight;
    }
    clearLog() {
      this._log = [];
      this._el.logContent.innerHTML = "";
    }
    showToast(msg, passPending = false) {
      const t = this._el.toast;
      t.textContent = msg;
      t.classList.remove("hidden");
      this._passPending = passPending;
      if (this._toastTimer) clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => {
        t.classList.add("hidden");
        this._passPending = false;
      }, 2200);
    }
    // ---------- 本局结束 ----------
    showDealOver(html, title) {
      this._el.dealOverBox.innerHTML = html;
      this._el.dealOverModal.classList.remove("hidden");
    }
    hideDealOver() {
      this._el.dealOverModal.classList.add("hidden");
    }
    _showSummaryModal(content) {
      this._el.dealOverBox.innerHTML = `<div class="deal-over-body"><h2>\u5BF9\u5C40\u603B\u7ED3</h2><div class="log-content" style="max-height:40vh">${content}</div><div class="modal-actions"><button class="btn ghost-btn" id="btn-back-deal">\u8FD4\u56DE</button></div></div>`;
      const back = document.getElementById("btn-back-deal");
      if (back) back.addEventListener("click", () => {
        this._el.dealOverModal.classList.add("hidden");
      });
    }
    // ---------- 进贡 / 回贡 ----------
    showTributeDialog(options) {
      return new Promise((resolve) => {
        const content = this._el.tributeContent;
        if (options.isResist) {
          const names = (options.resistNames || []).join("\u3001");
          content.innerHTML = `<h3>\u6297\u8D21</h3><p>${names} \u6301\u6709\u53CC\u738B\uFF0C\u672C\u5C40\u514D\u8D21\u3002</p><div class="modal-actions"><button class="btn primary" id="tribute-ok">\u77E5\u9053\u4E86</button></div>`;
        } else {
          const candHtml = (options.candidates || []).map(
            (c, i) => this._renderCard(c, i, i === (options.recommendedIndex ?? 0) ? "selected" : "")
          ).join("");
          const label = options.type === "return" ? "\u56DE\u8D21" : "\u8FDB\u8D21";
          content.innerHTML = `<h3>${label}\uFF1A${POS_NAMES2[options.fromPlayer]} \u2192 ${POS_NAMES2[options.toPlayer]}</h3><p>\u8BF7\u9009\u62E9\u4E00\u5F20\u724C${label}\u3002</p><div class="candidate-row">${candHtml}</div><div class="modal-actions"><button class="btn primary" id="tribute-ok">\u786E\u5B9A</button></div>`;
        }
        this._el.tributeModal.classList.remove("hidden");
        let selectedIndex = options.isResist ? -1 : options.recommendedIndex ?? 0;
        const row = content.querySelector(".candidate-row");
        if (row) {
          row.querySelectorAll(".card").forEach((el) => {
            el.classList.add("clickable");
            el.addEventListener("click", () => {
              row.querySelectorAll(".card").forEach((x) => x.classList.remove("selected"));
              el.classList.add("selected");
              selectedIndex = parseInt(el.dataset.idx, 10);
            });
          });
        }
        content.querySelector("#tribute-ok").addEventListener("click", () => {
          this._el.tributeModal.classList.add("hidden");
          resolve(options.isResist ? null : (options.candidates || [])[selectedIndex]);
        });
      });
    }
    showTributeToast(options) {
      return new Promise((resolve) => {
        const content = this._el.tributeContent;
        const cardHtml = options.card ? this._renderCard(options.card, 0, "") : "";
        const label = options.type === "return" ? "\u56DE\u8D21" : "\u8FDB\u8D21";
        content.innerHTML = `<h3>${label}</h3><p>${POS_NAMES2[options.fromPlayer]} \u5411 ${POS_NAMES2[options.toPlayer]} ${label}\uFF1A</p><div class="candidate-row">${cardHtml}</div><div class="modal-actions"><button class="btn" id="tribute-ok">\u77E5\u9053\u4E86</button></div>`;
        this._el.tributeModal.classList.remove("hidden");
        content.querySelector("#tribute-ok").addEventListener("click", () => {
          this._el.tributeModal.classList.add("hidden");
          resolve();
        });
      });
    }
  };

  // guandan/js/main.js
  var POS_NAMES3 = ["\u81EA\u5DF1", "\u4E0B\u5BB6", "\u961F\u53CB", "\u4E0A\u5BB6"];
  var gameConfig = { level: 2, maxDeals: 20 };
  var guandanTheme = /* @__PURE__ */ (function() {
    const KEY = "guandan-theme";
    function rootEl() {
      return document.querySelector(".gd-root") || document.documentElement;
    }
    function current() {
      try {
        return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
      } catch (e) {
        return "light";
      }
    }
    function apply(t) {
      rootEl().setAttribute("data-theme", t);
      const b = document.getElementById("btn-theme");
      if (b) b.textContent = t === "dark" ? "\u2600\uFE0F" : "\u{1F319}";
    }
    function toggle() {
      const t = current() === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(KEY, t);
      } catch (e) {
      }
      apply(t);
    }
    function init() {
      const b = document.getElementById("btn-theme");
      if (b) b.addEventListener("click", toggle);
      apply(current());
    }
    return { init };
  })();
  var ui = new UI();
  var eventBus = new EventBus();
  var game = null;
  var players = null;
  ui.onNewGame = () => startGame(true);
  function subscribeEvents() {
    eventBus.on("deal", (data) => {
      ui.updateGameInfo(`\u7B2C${data.dealNumber}\u526F | \u7EA7\u724C: ${data.level}`);
      ui.updateHand(data.hands[0]);
      ui.clearLastPlays();
      ui.clearLog();
      ui.addLog(`\u7B2C${data.dealNumber}\u526F\u724C\u5DF2\u53D1\uFF0C\u7EA7\u724C=${data.level}`);
    });
    eventBus.on("play_result", (data) => {
      const name = POS_NAMES3[data.player];
      const count = game.playerCounts[data.player];
      if (data.isPass) {
        game.playHistory.push(`${name} >> PASS (\u4F59${count}\u5F20)`);
        ui.addLog(`${name} >> PASS (\u5269${count}\u5F20)`);
        ui.updateLastPlay(data.player, { isPass: true });
      } else {
        const cardStr = data.cards.map((c) => c.display).join(" ");
        game.playHistory.push(`${name} >> ${data.type} [${cardStr}] (\u4F59${count}\u5F20)`);
        ui.addLog(`${name} >> ${formatHandType(data.type)} [${cardStr}] (\u5269${count}\u5F20)`);
        ui.updateLastPlay(data.player, { cards: data.cards, type: data.type });
      }
      ui.updatePlayerCounts(game.playerCounts);
    });
    eventBus.on("player_finished", (data) => {
      const name = POS_NAMES3[data.player];
      ui.addLog(`\u3010${name}\u3011\u51FA\u5B8C\uFF0C\u540D\u6B21 #${data.rank}`);
    });
    eventBus.on("tribute_request", async (data) => {
      await handleTributeRequest(data);
    });
    eventBus.on("tribute", () => {
    });
  }
  async function handleTributeRequest(data) {
    const { tributes, resistPlayers, dealNumber } = data;
    ui.addLog(`\u7B2C${dealNumber}\u526F - \u5F00\u59CB\u8FDB\u8D21...`);
    if (resistPlayers.length > 0) {
      const resistNames = resistPlayers.map((p) => POS_NAMES3[p]);
      ui.addLog(`\u3010${resistNames.join("\uFF0C")}\u3011\u6297\u8D21\uFF01\u6301\u6709\u4E24\u4E2A\u5927\u738B`);
      await ui.showTributeDialog({
        type: "tribute",
        fromPlayer: resistPlayers[0],
        toPlayer: tributes.find((t) => t.from === resistPlayers[0])?.to || 0,
        candidates: [],
        recommendedCard: null,
        isResist: true,
        resistNames,
        firstPlayerName: POS_NAMES3[resistPlayers[0]]
      });
      game.skipTribute();
      return;
    }
    const tributeSelections = {};
    const returnSelections = {};
    for (const tribute of tributes) {
      const { from, to } = tribute;
      const hand = game.hands[from];
      const candidates = game.getTributeCandidates(from);
      const recommended = selectTributeCard(hand) || null;
      let selectedCard;
      if (from === 0) {
        selectedCard = await ui.showTributeDialog({
          type: "tribute",
          fromPlayer: from,
          toPlayer: to,
          candidates,
          recommendedCard: recommended,
          isResist: false
        });
        if (selectedCard) {
          const validation = game.validateTributeCard(from, selectedCard);
          if (!validation.valid) {
            ui.showToast(`\u9009\u62E9\u65E0\u6548: ${validation.reason}`);
            selectedCard = recommended;
          }
        } else {
          selectedCard = recommended;
        }
      } else {
        selectedCard = recommended;
        await ui.showTributeToast({
          type: "tribute",
          fromPlayer: from,
          toPlayer: to,
          card: selectedCard
        });
      }
      if (selectedCard) {
        tributeSelections[from] = selectedCard;
        ui.addLog(`\u3010${POS_NAMES3[from]}\u3011\u5411\u3010${POS_NAMES3[to]}\u3011\u8FDB\u8D21: ${selectedCard.display || selectedCard.suit + selectedCard.value}`);
      }
    }
    for (const tribute of tributes) {
      const { from, to } = tribute;
      const returnPlayer = to;
      const hand = game.hands[returnPlayer];
      const candidates = game.getReturnCandidates(returnPlayer);
      const recommended = selectReturnCard(hand) || null;
      let selectedCard;
      if (returnPlayer === 0) {
        selectedCard = await ui.showTributeDialog({
          type: "return",
          fromPlayer: returnPlayer,
          toPlayer: from,
          candidates,
          recommendedCard: recommended,
          isResist: false
        });
        if (selectedCard) {
          const validation = game.validateReturnCard(returnPlayer, selectedCard);
          if (!validation.valid) {
            ui.showToast(`\u9009\u62E9\u65E0\u6548: ${validation.reason}`);
            selectedCard = recommended;
          }
        } else {
          selectedCard = recommended;
        }
      } else {
        selectedCard = recommended;
        await ui.showTributeToast({
          type: "return",
          fromPlayer: returnPlayer,
          toPlayer: from,
          card: selectedCard
        });
      }
      if (selectedCard) {
        returnSelections[returnPlayer] = selectedCard;
        ui.addLog(`\u3010${POS_NAMES3[returnPlayer]}\u3011\u5411\u3010${POS_NAMES3[from]}\u3011\u8FD8\u8D21: ${selectedCard.display || selectedCard.suit + selectedCard.value}`);
      }
    }
    game.confirmTribute(tributeSelections, returnSelections);
    ui.updateHand(game.hands[0]);
    ui.updatePlayerCounts(game.playerCounts);
    ui.addLog("\u8FDB\u8D21\u5B8C\u6210\uFF0C\u6E38\u620F\u5F00\u59CB");
  }
  function formatHandType(type) {
    if (!type) return "";
    const map = {
      single: "\u5355\u5F20",
      pair: "\u5BF9\u5B50",
      triple: "\u4E09\u5F20",
      triple_with_pair: "\u4E09\u5E26\u5BF9",
      straight: "\u987A\u5B50",
      flush_straight: "\u540C\u82B1\u987A",
      bomb: "\u70B8\u5F39",
      three_pairs: "\u4E09\u8FDE\u5BF9",
      two_triples: "\u94A2\u677F",
      four_jokers: "\u56DB\u5927\u5929\u738B"
    };
    return map[type.toLowerCase()] || type;
  }
  function createPlayers() {
    const arr = [];
    const analyzer = new EnhancedHandAnalyzer();
    for (let i = 0; i < 4; i++) {
      const strategy = new EnhancedMinBeatStrategy(analyzer, new V2Scorer());
      strategy.setGameState(i, i % 2, {});
      strategy._quiet = true;
      const aiPlayer = new PureAIPlayer(strategy, i);
      arr.push({ mode: "pure-ai", name: POS_NAMES3[i], position: i, aiPlayer, strategy });
    }
    return arr;
  }
  async function startGame(isNewGame = false) {
    players = createPlayers();
    game = new Game({ level: gameConfig.level || 2, eventBus, players });
    for (const p of players) {
      if (p.aiPlayer?.strategy) {
        p.aiPlayer.strategy.setTracker(game.cardTracker);
      }
    }
    ui.clearLog();
    ui.updateGameInfo("");
    ui.setTurnInfo("\u51C6\u5907\u5F00\u59CB...");
    ui.updatePlayerCounts(game.playerCounts);
    const level = gameConfig.level || 2;
    if (isNewGame) {
      game.reset();
      game.level = level;
      game.teamLevels = [level, level];
      game.currentLevel = level;
    }
    await runGame(game, players, ui, eventBus);
  }
  guandanTheme.init();
  subscribeEvents();
  startGame(true);
})();
