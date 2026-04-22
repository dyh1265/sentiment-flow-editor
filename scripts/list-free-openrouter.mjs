// Read the cached /api/v1/models response and print the free-tier models.
// A model is considered free when every listed pricing field is exactly "0"
// (OpenRouter returns prices as stringified numbers). The :free suffix on
// an id is a strong hint but not sufficient — always confirm via pricing.
import { readFileSync } from "node:fs";

const raw = JSON.parse(readFileSync("models.json", "utf8"));
const models = raw.data ?? raw;

const PRICE_FIELDS = ["prompt", "completion", "request", "image"];

function isFree(m) {
  const p = m.pricing ?? {};
  return PRICE_FIELDS.every((k) => {
    const v = p[k];
    return v === undefined || Number.parseFloat(v) === 0;
  });
}

const free = models
  .filter(isFree)
  .map((m) => ({
    id: m.id,
    name: m.name,
    ctx: m.context_length ?? m.top_provider?.context_length ?? null,
  }))
  .sort((a, b) => a.id.localeCompare(b.id));

console.log(`Total models: ${models.length}`);
console.log(`Free models: ${free.length}`);
console.log("");
// Column-aligned table: id | context | name
const idW = Math.max(...free.map((m) => m.id.length));
const ctxW = 8;
for (const m of free) {
  const ctx = m.ctx ? `${(m.ctx / 1000).toFixed(0)}k`.padStart(ctxW) : "?".padStart(ctxW);
  console.log(`${m.id.padEnd(idW)}  ${ctx}  ${m.name}`);
}
