# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/{owner}/{repo}/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/{owner}/{repo}/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: every rankable pre-token protocol in the DefiLlama snapshot, ranked by an implied value calibrated on the snapshot itself — the median market-cap / TVL of the tokenised protocols in each category — scaled by 7-day growth, age with no token, and chain breadth. Each row carries a seven-step farm plan with costs and times. The dashboard is a static page: sortable board, filters, a detail view per protocol, and the peer calibration behind the model.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref={referral_code}&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
