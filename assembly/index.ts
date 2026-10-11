// Batch layout: FIELDS consecutive i32 values per update
// 0 instrumentIndex | 1 priceCents | 2 tradeQuantity | 3 bidCents | 4 askCents | 5 bidQuantity | 6 askQuantity
const MAX_INSTRUMENTS: i32 = 50; // settings maximum
const BATCH_CAPACITY: i32 = 1000; // settings maximum for "updates per batch"
const FIELDS: i32 = 7; // fields per update
const MIN_MID: i32 = 100; // $1.00, keeps prices away from zero
const MAX_MID: i32 = 100000; // $1000.00, keeps sum(price * qty) exact in a JS number
const MAX_STEP: i32 = 25; // random walk: up to ±25 cents per update
const MAX_HALF_SPREAD: i32 = 5; // spread in [2, 10] cents
const MAX_TRADE_QTY: i32 = 100; // tradeQuantity in [1, 100]
const MAX_BOOK_QTY: i32 = 1000; // bid/askQuantity in [0, 1000]; zero is allowed

// Memory of the module. Created once when WASM is loaded and lives until the module is unloaded
const batch = new StaticArray<i32>(BATCH_CAPACITY * FIELDS);
// The last "mid" price of instrument i, in cents
// The next update of this instrument is based on it, so the price wanders
const mid = new StaticArray<i32>(MAX_INSTRUMENTS);
let instrumentCount: i32 = 1;
// 32-bit golden-ratio constant (fractional part of phi * 2^32).
// xorshift locks up if its state is 0, so this stands in for a missing seed.
let rngState: u32 = 0x9e3779b9;

// xorshift32. integer generator: the state is rotated by bit shifts and XOR
// If the state becomes 0, it will forever be 0, so init() with a zero seed replaces it
function nextU32(): u32 {
  let x = rngState;
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  rngState = x;
  return x;
}

// Integer in [0, maxExclusive). The remainder of the division slightly shifts the probabilities
function nextInt(maxExclusive: i32): i32 {
  return i32(nextU32() % u32(maxExclusive));
}

// count - how many instruments to trade, strictly clamped to 1..50
// seed - start the generator; the same seed gives the same result
export function init(count: i32, seed: u32): void {
  instrumentCount = max<i32>(1, min<i32>(count, MAX_INSTRUMENTS));
  rngState = seed == 0 ? 0x9e3779b9 : seed;
  // Starting mid prices: $10.00 to $1000.00
  for (let i = 0; i < MAX_INSTRUMENTS; i++) {
    // 99001 - number of possible initial prices from $10 to $1000 with a step of one cent
    mid[i] = 1000 + nextInt(99001);
  }
}

export function generateBatch(count: i32): i32 {
  const n = max<i32>(0, min<i32>(count, BATCH_CAPACITY));
  for (let i = 0; i < n; i++) {
    // random instrument index
    const idx = nextInt(instrumentCount); // instrument may repeat within a batch

    // Step the previous mid by -25..+25 cents, then clamp it to [$1.00, $1000.00].
    let m = mid[idx] + nextInt(2 * MAX_STEP + 1) - MAX_STEP; // evolves from the previous price
    m = max<i32>(MIN_MID, min<i32>(m, MAX_MID));
    mid[idx] = m;

    const bid = m - 1 - nextInt(MAX_HALF_SPREAD); // [m-5, m-1], always > 0
    const ask = m + 1 + nextInt(MAX_HALF_SPREAD); // [m+1, m+5], always > bid

    const base = i * FIELDS;
    batch[base] = idx;
    batch[base + 1] = (nextU32() & 1) != 0 ? ask : bid; // trade price is the bid or the ask
    batch[base + 2] = 1 + nextInt(MAX_TRADE_QTY);
    batch[base + 3] = bid;
    batch[base + 4] = ask;
    batch[base + 5] = nextInt(MAX_BOOK_QTY + 1);
    batch[base + 6] = nextInt(MAX_BOOK_QTY + 1);
    assert(bid > 0 && bid < ask); // traps in the debug build; stripped in release (noAssert)
  }
  return n;
}

// Address of `batch` in WASM memory.
export function getBatchPointer(): usize {
  return changetype<usize>(batch);
}

export function getBatchCapacity(): i32 {
  return BATCH_CAPACITY;
}

export function getFieldCount(): i32 {
  return FIELDS;
}

// Exposed for tests: current mid price of an instrument
export function getMidCents(i: i32): i32 {
  return mid[i];
}
