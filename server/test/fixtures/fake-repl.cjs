// A stand-in for the Lean REPL, used to test how the server starts workers and what it says when they fail.
//
// FAKE_REPL_MODE        ok (default), silent (never answers the import) or crash (exits at once)
// FAKE_REPL_DELAY_MS    how long to wait before answering the import
// FAKE_REPL_EXIT        exit code in crash mode
// FAKE_REPL_STDERR      text written to stderr in crash mode
// FAKE_REPL_SLOW_FILE   with FAKE_REPL_SLOW_STARTS=N: the first N starts counted in this file never answer the import,
//                       later ones answer at once (a library that is slow to load the first time)
const fs = require("node:fs");
let mode = process.env.FAKE_REPL_MODE ?? "ok";
if (process.env.FAKE_REPL_SLOW_FILE) {
  let starts = 0;
  try {
    starts = Number(fs.readFileSync(process.env.FAKE_REPL_SLOW_FILE, "utf8")) || 0;
  } catch {
    // first start
  }
  fs.writeFileSync(process.env.FAKE_REPL_SLOW_FILE, String(starts + 1));
  if (starts < Number(process.env.FAKE_REPL_SLOW_STARTS ?? 0)) mode = "silent";
}
const delay = Number(process.env.FAKE_REPL_DELAY_MS ?? 0);

if (mode === "crash") {
  process.stderr.write(process.env.FAKE_REPL_STDERR ?? "boom");
  process.exit(Number(process.env.FAKE_REPL_EXIT ?? 7));
}

let buffer = "";
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  for (;;) {
    const end = buffer.search(/\r?\n\r?\n/);
    if (end < 0) return;
    const raw = buffer.slice(0, end);
    buffer = buffer.slice(end).replace(/^\r?\n\r?\n/, "");
    let command = {};
    try {
      command = JSON.parse(raw);
    } catch {
      // not JSON: answer like an ordinary command
    }
    const isImport = typeof command.cmd === "string" && command.cmd.startsWith("import");
    if (mode === "silent" && isImport) continue;
    setTimeout(() => process.stdout.write(`${JSON.stringify(isImport ? { env: 0 } : { messages: [], env: 1 })}\n\n`), isImport ? delay : 0);
  }
});
