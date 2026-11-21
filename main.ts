// Entry driver: answer every case with our own fast run() from solve.js.
// The harness invokes `node main.ts` (Node 22, erasable TS only, no build
// step, no bundler). Input: $MAKEFUN_INPUT_DIR/cases.json (default /input)
// — a JSON array of { id, input } objects, in the order they must be
// answered. Output: $MAKEFUN_OUTPUT_DIR/answers.json (default /output) —
// a JSON array of {columns, rows, errors} answers, one per case, in the
// same order. Each case is answered on its own, exactly once, in input
// order; run() keeps no state between calls and performs no warmup parses.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';

// V8's incremental marking off, set before solve.js is imported so all of
// its work runs under it (the rules: the house baseline runs with
// --no-incremental-marking, and an entry may tune V8's flags too).
setFlagsFromString('--no-incremental-marking');

/** solve.js, imported by its URL (a .js module carries no types). */
const { run } = (await import(new URL('./solve.js', import.meta.url).href)) as {
  run: (input: unknown) => unknown;
};

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(join(INPUT_DIR, 'cases.json'), 'utf8')) as {
  id: string;
  input: unknown;
}[];
// Preallocated: one answer per case, filled in input order.
const answers: unknown[] = new Array(cases.length);
for (let i = 0; i < cases.length; i++) {
  answers[i] = run(cases[i]!.input);
}
writeFileSync(join(OUTPUT_DIR, 'answers.json'), JSON.stringify(answers));
