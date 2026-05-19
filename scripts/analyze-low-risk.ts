import * as fs from "node:fs";

const md = fs.readFileSync(
  "backtest-results/by-league-2026-05-16T06-27-20-737Z.md",
  "utf8",
);

type Bucket = { tot: number; ok: number; bad: number; nd: number };
const counts: Record<string, Bucket> = {};

for (const line of md.split("\n")) {
  if (!line.startsWith("|")) continue;
  const parts = line.split("|").map((s) => s.trim());
  // header / separator rows
  if (parts.length < 8) continue;
  const risk = parts[4];
  if (risk !== "low") continue;
  const pick = parts[5];
  const result = parts[7]; // ✓ ✗ or n/d
  if (!counts[pick]) counts[pick] = { tot: 0, ok: 0, bad: 0, nd: 0 };
  counts[pick].tot++;
  if (result === "✓") counts[pick].ok++;
  else if (result === "✗") counts[pick].bad++;
  else if (result === "n/d") counts[pick].nd++;
}

console.log("low-risk picks breakdown:");
console.log("market".padEnd(40), "tot", "ok", "bad", "nd", "hit%");
const settleable: Record<string, Bucket> = {};
for (const [k, s] of Object.entries(counts).sort(
  (a, b) => b[1].tot - a[1].tot,
)) {
  const settled = s.ok + s.bad;
  const hit = settled > 0 ? ((s.ok / settled) * 100).toFixed(0) + "%" : "n/d";
  console.log(
    k.padEnd(40),
    String(s.tot).padStart(3),
    String(s.ok).padStart(3),
    String(s.bad).padStart(3),
    String(s.nd).padStart(3),
    hit.padStart(5),
  );
  if (settled > 0) settleable[k] = s;
}

console.log("\nonly settleable:");
let totSet = 0,
  totOk = 0;
for (const [k, s] of Object.entries(settleable)) {
  totSet += s.ok + s.bad;
  totOk += s.ok;
}
console.log(
  `n=${totSet}  hit=${((totOk / totSet) * 100).toFixed(1)}%  (${totOk}/${totSet})`,
);
