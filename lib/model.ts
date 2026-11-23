// Token radar model v2: a peer-calibrated implied value.
import { farmSteps, stepText } from './farm.ts';
//
// A pre-token protocol is worth what the market already pays for the same
// kind of business, scaled by its own size, momentum, age and reach. The
// calibration comes from the snapshot itself: for every category, the
// median market-cap / TVL of the tokenised protocols in that category.
// No protocol name is ever special-cased. Ranked rows are plausible launch
// candidates under the watchlist's own rule: no wrapped, staked or bridged
// product of a token that already trades, no exchange, no versioned pool.
//
//   peer       = median(mcap_usd / tvl_usd) of tokenised peers in the
//                protocol's category (needs n >= 3), else the global
//                median; clamped to [0.05, 1.50]
//   growth     = clamp(change_7d, -50, 150) per cent
//   growthMul  = 1 + 0.006 * growth
//   maturity   = 0.70 + 0.30 * age / (age + 365)   (saturating: a year in
//                gets most of the way; age unknown falls back to the
//                median age of pre-token protocols, computed, not guessed)
//   breadth    = 1 + 0.02 * min(max(chains - 1, 0), 8)
//   implied    = max(1, round(tvl_usd * peer * growthMul * maturity * breadth))
//
// Market cap here is circulating market cap, not fully diluted value, so
// the peer multiple is a floor on what a tokenised peer is worth per TVL
// dollar, never a forecast. The board ranks every rankable pre-token
// protocol in the snapshot, watchlist first in coverage but never in
// privilege: rank comes only from the formula above.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  peer_min_count: number;
  peer_floor: number;
  peer_cap: number;
  growth_floor: number;
  growth_cap: number;
  growth_weight: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_half_life_days: number;
  breadth_per_chain: number;
  breadth_max_chains: number;
}

export const MODEL: ModelConstants = {
  peer_min_count: 3,
  peer_floor: 0.05,
  peer_cap: 1.5,
  growth_floor: -50,
  growth_cap: 150,
  growth_weight: 0.006,
  maturity_floor: 0.7,
  maturity_range: 0.3,
  maturity_half_life_days: 365,
  breadth_per_chain: 0.02,
  breadth_max_chains: 8,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the Live view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    peer_multiple: number;
    peer_count: number;
    peer_fallback: boolean;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  peer_multiple: number;
  peer_count: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  farm_steps: string[];
}

/** One category's peer calibration, for the dashboard's methodology table. */
export interface PeerCalibration {
  category: string;
  peer_count: number;
  median_multiple: number;
  fallback: boolean;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, the calibration and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  watchlist: string[];
  board_size: number;
  live_size: number;
  global_peer_multiple: number;
  global_peer_count: number;
  peers: PeerCalibration[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a non-empty number list. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories the watchlist rule keeps off the board: a wrapped, staked or bridged product of a token
    that already trades is not a launch candidate, and neither is an exchange itself. */
const NOT_A_LAUNCH = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** A whole word that marks a wrapped or staked product. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Exchange names a launch candidate never starts with. */
const EXCHANGES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is one the board may rank: pre-token, and a plausible launch candidate under
 * the same rule the watchlist itself uses — not a wrapped, staked or bridged product of a token that
 * already trades, not an exchange, not a versioned pool. A board topped by WBTC or a bridge would
 * rank products whose token already trades, not launches.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && NOT_A_LAUNCH.has(p.category)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGES.some((e) => p.name.startsWith(e))) return false;
  return !VERSIONED.test(p.name);
}

/** The peer calibration of the whole snapshot: per-category medians plus the global one. */
export function calibratePeers(snapshot: Snapshot, model: ModelConstants = MODEL): {
  byCategory: Map<string, { multiple: number; count: number; fallback: boolean }>;
  global: { multiple: number; count: number };
} {
  const multiples = (ps: SnapshotProtocol[]): number[] =>
    ps
      .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
      .map((p) => p.mcap_usd! / p.tvl_usd);
  const all = multiples(snapshot.protocols);
  const globalRaw = all.length > 0 ? median(all) : 0.25;
  const global = { multiple: Math.min(model.peer_cap, Math.max(model.peer_floor, globalRaw)), count: all.length };
  const byCategory = new Map<string, { multiple: number; count: number; fallback: boolean }>();
  const categories = new Set(snapshot.protocols.map((p) => p.category ?? 'Uncategorised'));
  for (const category of categories) {
    const peers = multiples(snapshot.protocols.filter((p) => (p.category ?? 'Uncategorised') === category));
    if (peers.length >= model.peer_min_count) {
      byCategory.set(category, {
        multiple: Math.min(model.peer_cap, Math.max(model.peer_floor, median(peers))),
        count: peers.length,
        fallback: false,
      });
    } else {
      byCategory.set(category, { multiple: global.multiple, count: peers.length, fallback: true });
    }
  }
  return { byCategory, global };
}

/** The median age, in days, of the snapshot's pre-token protocols: the fallback for an unknown age. */
export function medianPreTokenAge(snapshot: Snapshot): number {
  const ages = snapshot.protocols
    .filter(isPreToken)
    .map((p) => ageDays(snapshot.as_of, p.listed_at))
    .filter((a): a is number => a !== null);
  return ages.length > 0 ? Math.round(median(ages)) : 365;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The four factors and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  peers: { byCategory: Map<string, { multiple: number; count: number; fallback: boolean }>; global: { multiple: number; count: number } },
  fallbackAge: number,
  model: ModelConstants = MODEL,
): {
  implied: number;
  peerMultiple: number;
  peerCount: number;
  peerFallback: boolean;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  breadthMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + model.growth_weight * growthPct;
  const ageForModel = age ?? fallbackAge;
  const maturityMult = model.maturity_floor + model.maturity_range * (ageForModel / (ageForModel + model.maturity_half_life_days));
  const extraChains = Math.min(Math.max(protocol.chains.length - 1, 0), model.breadth_max_chains);
  const breadthMult = 1 + model.breadth_per_chain * extraChains;
  const peer = peers.byCategory.get(protocol.category ?? 'Uncategorised') ?? { multiple: peers.global.multiple, count: 0, fallback: true };
  const implied = Math.max(1, Math.round(protocol.tvl_usd * peer.multiple * growthMult * maturityMult * breadthMult));
  return {
    implied,
    peerMultiple: round4(peer.multiple),
    peerCount: peer.count,
    peerFallback: peer.fallback,
    growthPct,
    growthMult: round4(growthMult),
    maturityMult: round4(maturityMult),
    breadthMult: round4(breadthMult),
    age,
  };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const peers = calibratePeers(snapshot, model);
  const fallbackAge = medianPreTokenAge(snapshot);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug it names, even one the snapshot no longer carries.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol, not just the biggest by TVL.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }
  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, peers, fallbackAge, model);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      peer_multiple: s.peerMultiple,
      peer_count: s.peerCount,
      peer_fallback: s.peerFallback,
      growth_pct: s.growthPct,
      growth_multiplier: s.growthMult,
      maturity_multiplier: s.maturityMult,
      breadth_multiplier: s.breadthMult,
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    peer_multiple: row.model.peer_multiple,
    peer_count: row.model.peer_count,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const peers = calibratePeers(snapshot, model);
  const peerTable: PeerCalibration[] = [...peers.byCategory.entries()]
    .map(([category, v]) => ({ category, peer_count: v.count, median_multiple: round4(v.multiple), fallback: v.fallback }))
    .sort((a, b) => b.median_multiple - a.median_multiple || (a.category < b.category ? -1 : 1));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    watchlist: snapshot.watchlist,
    board_size: board.length,
    live_size: live.length,
    global_peer_multiple: round4(peers.global.multiple),
    global_peer_count: peers.global.count,
    peers: peerTable,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
