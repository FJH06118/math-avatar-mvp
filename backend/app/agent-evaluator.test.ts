import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateAgentFixtures, parseAndValidateAgentContent } from "./agent-evaluator.ts";

const slideId = "slide_eval_1";
const valid = {
  schemaVersion: "stage-tc-agent-v1",
  slides: [{
    slideId,
    teachingGoal: "理解导数定义",
    narration: [{ displayText: "导数描述瞬时变化率。", spokenText: "导数描述瞬时变化率。" }],
    derivation: [{ input: "Δy/Δx", output: "f'(x)", transformation: "取极限", explanation: "令增量趋近于零", risk: "L2" }],
    scenes: [{ durationMs: 2_000 }],
    preservationMode: "FULL_PRESERVE",
  }],
};

test("six constrained modules pass and fenced JSON uses one bounded repair", () => {
  const result = parseAndValidateAgentContent(`\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``, [slideId]);
  assert.equal(result.attempts, 2);
  assert.equal(result.modules.length, 6);
  assert(result.modules.every((module) => module.status === "passed"));
});

test("versioned eval reports real first-pass and repaired denominators", () => {
  const invalid = { ...valid, slides: [] };
  const report = evaluateAgentFixtures([
    { id: "valid-1", content: JSON.stringify(valid), slideIds: [slideId] },
    { id: "valid-2", content: JSON.stringify(valid), slideIds: [slideId] },
    { id: "fenced-repair", content: `\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``, slideIds: [slideId] },
    { id: "missing-slide", content: JSON.stringify(invalid), slideIds: [slideId] },
  ]);
  assert.deepEqual(report.firstPassSchemaRate, { numerator: 2, denominator: 4, percent: 50 });
  assert.deepEqual(report.afterRepairSchemaRate, { numerator: 3, denominator: 4, percent: 75 });
  assert.equal(report.failures.length, 1);
  assert(Object.values(report.modulePassCounts).every((count) => count === 3));
});
