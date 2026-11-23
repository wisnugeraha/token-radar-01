// Farm plans: seven concrete steps per protocol, derived from the protocol's
// own record (category, chains, TVL, age). Every step carries what it costs
// and how long it takes. No protocol name is ever special-cased: the plan
// follows the category's shape, the capital follows the TVL, and the hold
// follows the age.

import type { FarmStep, SnapshotProtocol } from './model.ts';

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 500;
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 250_000_000) return 150;
  if (p.tvl_usd >= 50_000_000) return 100;
  return 50;
}

/** Gas for one transaction on this position's size. */
function gasFor(capital: number): number {
  if (capital >= 500) return 10;
  if (capital >= 250) return 8;
  if (capital >= 150) return 6;
  if (capital >= 100) return 5;
  return 4;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 60;
  if (age < 180) return 90;
  if (age < 540) return 60;
  return 45;
}

/** The category's primary action, in words a farmer can follow. */
function primaryAction(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Lend $${capital} of USDC into ${name}'s main market on ${chain} and leave the deposit earning.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Add $${capital} of liquidity to ${name}'s deepest pool on ${chain} and keep the position in range.`;
  if (c.includes('yield') || c.includes('aggregator')) return `Deposit $${capital} of USDC into ${name}'s flagship yield vault on ${chain} and hold the receipt tokens.`;
  if (c.includes('bridge') || c.includes('cross chain')) return `Bridge $${capital} of USDC into ${chain} through ${name}, then put the bridged funds to work in its own app.`;
  if (c.includes('restak') || c.includes('staking') || c.includes('liquid')) return `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivat') || c.includes('options')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position on ${chain}.`;
  if (c.includes('prediction')) return `Fund $${capital} and take one position in a live market on ${name}.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Allocate $${capital} into a ${name} vault on ${chain} and hold the vault shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it in the farm wallet.`;
  if (c.includes('basis')) return `Deposit $${capital} into ${name}'s basis strategy on ${chain} and keep the position open.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  if (c.includes('payment')) return `Route $${capital} of payments through ${name} on ${chain} and keep the receipts.`;
  if (c.includes('launchpad')) return `Commit $${capital} to a live sale on ${name} and hold the allocation.`;
  if (c.includes('chain')) return `Bridge $${capital} to ${name}'s chain and use it in one of the chain's own apps.`;
  if (c.includes('privacy')) return `Deposit $${capital} through ${name}'s private pool on ${chain} and keep the note safe.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's second, distinct action: a different product surface of the same protocol. */
function secondAction(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  const small = Math.max(10, Math.round(capital / 5));
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow $${small} against the deposit, hold it a week, then repay it in full so a second activity type is recorded.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Swap $${small} through ${name}'s router on ${chain} so the wallet shows trading activity as well as liquidity.`;
  if (c.includes('yield') || c.includes('aggregator')) return `Claim the vault's yield once, then re-deposit it instead of withdrawing, so the compounding is on record.`;
  if (c.includes('bridge') || c.includes('cross chain')) return `Bridge $${small} back the other way a week later, so the wallet shows two-way volume.`;
  if (c.includes('restak') || c.includes('staking') || c.includes('liquid')) return `Use $${small} of the receipt token in a second ${name} feature, such as a vault or a vote, if one is live.`;
  if (c.includes('perpetual') || c.includes('derivat') || c.includes('options')) return `Close the first position, then open one more with $${small} of margin a week later.`;
  if (c.includes('prediction')) return `Settle the first market, then place a second position of $${small} in a different market.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Allocate $${small} to a second ${name} vault with a different risk profile and hold both shares.`;
  if (c.includes('stable')) return `Swap $${small} of the stable asset into a second asset ${name} supports, then swap it back.`;
  if (c.includes('rwa')) return `Reinvest $${small} of the yield the asset pays into a second ${name} position.`;
  if (c.includes('basis')) return `Withdraw $${small} after two weeks, then re-deposit it so the position shows a fresh entry.`;
  if (c.includes('insurance')) return `File one test claim inquiry on the policy, then leave the cover in place.`;
  if (c.includes('launchpad')) return `Vote with the allocation in ${name}'s next community round, if one opens.`;
  return `Use a second feature of ${name} on ${chain} once, such as its vote, rewards or referral tab, so the wallet is not a one-action wallet.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const gas = gasFor(capital);
  const hold = holdDaysFor(age);
  const action = primaryAction(p, capital, chain);
  const second = secondAction(p, capital, chain);
  return [
    {
      text: `Open a fresh wallet that holds only the funds you plan to farm, and write its seed phrase on paper kept offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${gas} of gas`,
      time: '20 minutes to set up',
    },
    {
      text: second,
      cost: `about $${gas} of gas`,
      time: '15 minutes',
    },
    {
      text: `Come back once a week and repeat one qualifying action, such as a deposit, a borrow, a swap or a vote.`,
      cost: `about $${Math.max(2, gas - 2)} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and check the activity is counted; never pay anyone to claim, and never follow a claim link from a chat or an ad.`,
      cost: 'no fee to check',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction hash in a farm log, and plan the exit in two steps: withdraw half first, then the rest once the first half has landed.`,
      cost: `about $${gas} of gas to unwind`,
      time: '10 minutes',
    },
  ];
}
