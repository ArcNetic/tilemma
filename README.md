# Tilemma

Slide tiles. Prove it.

Tilemma is a puzzle game where you solve each level by writing a small [Lean 4](https://lean-lang.org/) proof. A grid of coloured blocks sits next to a target picture. You change the grid one line at a time, and Lean checks that your moves really turn the start into the target.

> **The idea in one line:** a proof is a fold. `foldl step board moves == target`, where `step` is a pure function and the Lean kernel re-checks every step by `rfl`. Winning a level *is* constructing the proof term.

```
board0 --step m1--> board1 --step m2--> board2 --> ... --> target
   '------ Reach.step m1 (Reach.step m2 (... Reach.refl)) ------'   one term, checked by the kernel
```

Live demo: https://tilemma.indonesiacentral.cloudapp.azure.com

## How to play

Each line is one move:

```lean
swap (0, 0) (0, 1)     -- trade two blocks
paint (1, 2) red       -- recolour a block
rotate (2, 0)          -- turn an arrow 90 degrees clockwise
```

Coordinates are `(row, column)`, counted from 0 at the top left. The board updates as you type. When you stop typing, Lean checks the proof, and the "Verified by Lean" badge appears if it accepts it.

- A move that breaks a rule (locked block, outside the board, nothing to rotate) turns its block red and stops the proof there.
- The timeline under the board lets you step through every line.
- **Show Lean** opens the real Lean file that was checked.
- From level 8 you can write helper functions and call them with `run`:

```lean
def ccw (r c : Nat) : List Move := List.replicate 3 (.rotate (r, c))
```

```lean
run ccw 1 1
```

There are 12 levels. Each one teaches one idea, from a single swap up to a boss level that combines helpers, locked blocks and `List.map`. Stars depend on how few lines you use compared with the level's par.

## Why Lean

The moves are real Lean tactics, not a home-made parser. A solved level is a proof term that the Lean kernel has verified.

- **Moves are pure functions.** `step : Move → Board → Board` has no state and no side effects. A proof is a fold of `step` over a list of moves.
- **A solution is a proof.** `Reach target board` is an inductive predicate. Every line you write adds one `Reach.step`, so a cleared level is a term of that type.
- **Moves are data.** A helper is an ordinary function that returns a `List Move`, and `run` applies it. Helpers use `List.replicate`, `List.map`, `List.range` and `List.flatten`.
- **Properties are proved.** `lean/ProofPuzzle/Lemmas.lean` proves that four rotations are the identity, that painting twice equals painting once, and that moves compose over `++`.

### Why a buggy tactic cannot fake a solve

Each tactic reads the goal, runs the rules, and only proposes the next board. It closes the goal with `Reach.step m b b' (legal m b = true) (step m b = b') rest`, where both equalities are proved by `rfl`. The kernel recomputes them. A bug in a tactic can reject a good proof but never accept a bad one. We checked this with a deliberately cheating tactic, and the kernel rejected it. The server also requires that `#print axioms` shows no `sorryAx`.

## How it works

```
web (React, Vite, TypeScript, CodeMirror 6)
  instant preview from the TypeScript engine, verified result from Lean
        |  POST /api/check
server (Node, Fastify, TypeScript)
  validate -> whitelist sanitizer -> fixed Lean template
  -> Lean runner (warm REPL workers, or one process per check) -> message parser
  cache, concurrency pool, queue, rate limit, timeouts
        |
lean (Lean 4.35.0 and Lake, no Mathlib)
  ProofPuzzle/Core      Board, Cell, Move, legal, step, applyAll, Reach
  ProofPuzzle/Lemmas    proved properties
  ProofPuzzle/Codec     reads boards out of Lean expressions, writes JSON
  ProofPuzzle/Tactics   the swap, paint, rotate and run tactics
```

1. While you type, a small TypeScript copy of the rules (`packages/engine`) updates the board straight away. It is only for feedback and never decides whether you solved a level.
2. After a short pause the browser sends your helpers and proof to the server.
3. The server rejects anything outside a strict whitelist before Lean sees it, then puts your text into a fixed Lean file.
4. Lean runs the file. A warm worker that already has the library loaded answers in about 50 ms. If it is not available, the server falls back to starting Lean per request (about 1.6 s) and switches back to warm workers once they are ready.
5. The server turns Lean's messages into a board for every line, the first failure with the cells involved, and the axiom check. The page shows that result.

A level counts as solved only when the proof compiles, the board equals the target, there are no extra moves and `sorry` is not used.

## Security

User text can reach Lean, and Lean can run code at compile time, so all input is treated as hostile.

1. **Whitelist sanitizer.** Proof lines can only be `swap`, `paint`, `rotate`, `run`, a blank line or a comment. Helpers can only be `def name (n : Nat) : List Move := ...` built from list literals, the three move constructors, tuples, numbers up to 99, `+ - *`, `++` and `List.replicate/map/range/flatten`.
2. **Fixed template.** Player text goes into two slots only. The theorem statement, imports and options belong to the server.
3. **Axiom check** on every solve.
4. **Limits.** 4 s timeout for warm checks and 8 s for cold ones, whole-process-tree kill, worker recycling, a 32 KB request limit, a per-IP rate limit, a bounded queue (HTTP 429) and a container memory cap.

## Getting started

### With Docker

```bash
docker build -f docker/Dockerfile -t tilemma .
docker run --rm -p 8080:8080 --memory=3g --read-only --tmpfs /tmp \
  --cap-drop ALL --security-opt no-new-privileges tilemma
```

Open http://localhost:8080. The image includes the Lean toolchain, the compiled library and the web app, so it runs offline.

### For development

You need Node 20 or newer, [pnpm](https://pnpm.io/) and [elan](https://github.com/leanprover/elan). The Lean version is pinned in `lean/lean-toolchain`.

```bash
pnpm install
(cd lean && lake build)
./scripts/fetch-repl.sh          # optional: warm workers, about 30x faster checks
pnpm -F @pp/web build
pnpm -F @pp/server start         # http://localhost:8080
```

For live reload while working on the UI, run `pnpm -F @pp/web dev` as well and open http://localhost:5173. It proxies `/api` to port 8080. If the server will not start because port 8080 is taken, an older copy is still running.

### Settings

| Variable | Meaning |
|---|---|
| `PORT` | Port to listen on (default 8080) |
| `RUNNER` | `auto`, `warm` or `cold` |
| `WARM_WORKERS` | Number of warm Lean workers |
| `WARM_STARTUP_MS` | How long a worker may take to load the library on its first start (default 120000) |
| `WARM_RETRY_MS`, `WARM_RETRIES` | Background retry interval (30000) and attempts (10) when warm workers failed to start |
| `CHECKS_PER_MINUTE` | Per-IP rate limit |
| `TRUST_PROXY` | Set to `1` behind a reverse proxy so the rate limit uses the real client address |
| `DEBUG_LEAN` | Set to `0` to stop returning the generated Lean file |

The first start after a reboot can take about a minute while the operating system reads the Lean files.

## Testing

| Command | What it checks |
|---|---|
| `pnpm typecheck` and `pnpm lint` | Types and code style |
| `pnpm test` | Engine property tests, server sanitizer, parser, security and integration tests against real Lean, and web component tests |
| `pnpm validate:levels` | All 12 levels: schema, reachability, par and locked cells, plus a breadth-first search that proves par for the small boards |
| `pnpm gen:lean-tests && pnpm test:lean` | Builds the Lean library and runs the positive and negative suites and every level's reference solution through the kernel |
| `pnpm difftest` | 380 random proofs: Lean and the TypeScript engine must agree on every board, status and failing line |
| `pnpm e2e` | Playwright browser tests in both themes, including axe-core accessibility scans |
| `pnpm test:all` | Everything above |

Running `pnpm e2e` saves screenshots to `test-results/screens`.

## Deployment

The live site runs on an Azure VM (Ubuntu, 2 vCPU, 4 GB) with Docker Compose, see `deploy/`:

- Caddy provides HTTPS with an automatic certificate and compresses responses.
- The app container is read-only, drops all capabilities and has a memory cap. It sits on an internal Docker network with no route to the internet, so Lean code cannot call out even if the sandbox failed.

To redeploy, push to `main`, SSH into the VM and run `~/tilemma/deploy/deploy.sh`. To deploy somewhere else, build the image and run `SITE_ADDRESS=your.domain docker compose -f deploy/docker-compose.yml up -d`.

## Project layout

| Folder | Contents |
|---|---|
| `lean/` | The Lean library (rules, tactics, codec, lemmas) and its tests |
| `levels/` | The 12 levels as JSON |
| `packages/engine/` | Shared TypeScript: level schema, rules for the instant preview, Lean file template, line parser |
| `server/` | API, sanitizer, Lean runners, message parser, cache |
| `web/` | The React app |
| `e2e/` | Playwright tests |
| `scripts/` | Level checks, Lean test generation, differential test, benchmarks |
| `deploy/`, `docker/` | Production stack and Dockerfile |

## Known limits

- Boards are at most 6 by 6, and helpers are limited to the grammar above. This keeps checks fast and the sandbox small.
- A `run` expands to at most 64 moves.
- The sandbox relies on Docker plus the whitelist. If you use plain `docker run` on a public host, block outbound traffic yourself.
- The game has not been playtested with real first-time players yet.

## Team

- [ArcNetic](https://github.com/ArcNetic)
- [PRKM0530](https://github.com/PRKM0530)
