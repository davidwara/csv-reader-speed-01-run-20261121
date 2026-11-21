# csv-reader-speed-01-run-20261121

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/davidwara/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/davidwara/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A dependency-free, fast CSV reader written from scratch in plain JavaScript. `run({text, header})` returns exactly the answer csv-reader 1.0.0 returns — `{columns, rows, errors}` — for every input, broken rows included: stray CRs, junk after closing quotes, unterminated quotes, short and long rows, multi-line quoted fields.

`solve.js` is a single ES module with no dependencies. `main.ts` is the harness driver: it reads the cases from `$MAKEFUN_INPUT_DIR/cases.json`, answers each one in isolation with `run()`, and writes the answers in order to `$MAKEFUN_OUTPUT_DIR/answers.json`.

Design: slice, never build char by char. A record with no quote at all is split in one C++ call; a record that holds a quote is read field by field with `indexOf` delimiter searches, so quoted fields are sliced too — doubled quotes spliced in as one literal quote, CRLF and lone CR inside quotes each becoming one LF, line numbers kept exactly.

## Run it

```sh
node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=z5073zsc&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
