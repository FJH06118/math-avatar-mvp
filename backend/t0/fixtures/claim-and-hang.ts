import { createT0Pool } from "../database.ts";
import { claimNextStep } from "../lease-worker.ts";

const pool = createT0Pool();
const claim = await claimNextStep(pool, "killed-worker", 80);
process.stdout.write(`${JSON.stringify(claim)}\n`);

if (!claim) {
  await pool.end();
  process.exitCode = 1;
} else {
  await new Promise<void>(() => undefined);
}
