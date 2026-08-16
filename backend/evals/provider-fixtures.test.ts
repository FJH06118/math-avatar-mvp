import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { evaluateAgentFixtures } from "../app/agent-evaluator.ts";

interface ProviderFixtureManifest {
  schemaVersion: string;
  sampleCount: number;
  categoryCounts: Record<string, number>;
  samples: Array<{
    id: string;
    category: string;
    title: string;
    extractedText: string;
    notes: string;
    formulas: string[];
    format: "json" | "fenced";
  }>;
}

test("P3 offline provider fixture inventory covers 100 slide-level samples and one bounded repair", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("./provider-fixtures/manifest.json", import.meta.url), "utf8"),
  ) as ProviderFixtureManifest;
  assert.equal(manifest.schemaVersion, "stage-p3-provider-eval-v1");
  assert.equal(manifest.sampleCount, 100);
  assert.equal(manifest.samples.length, 100);
  assert.deepEqual(manifest.categoryCounts, {
    "high-math-formula": 20,
    "chinese-long-text": 20,
    "image-page": 20,
    "chart-page": 20,
    "low-confidence": 20,
  });
  assert.deepEqual(
    Object.fromEntries([...new Set(manifest.samples.map((sample) => sample.category))].map((category) => [
      category,
      manifest.samples.filter((sample) => sample.category === category).length,
    ])),
    manifest.categoryCounts,
  );

  const report = evaluateAgentFixtures(manifest.samples.map((sample) => ({
    id: sample.id,
    slideIds: [sample.id],
    content: sample.format === "fenced" ? `\`\`\`json\n${validContent(sample)}\n\`\`\`` : validContent(sample),
  })));
  assert.deepEqual(report.firstPassSchemaRate, { numerator: 90, denominator: 100, percent: 90 });
  assert.deepEqual(report.afterRepairSchemaRate, { numerator: 100, denominator: 100, percent: 100 });
  assert.equal(report.repairLimit, 2);
  assert.equal(report.failures.length, 0);
});

function validContent(sample: ProviderFixtureManifest["samples"][number]): string {
  return JSON.stringify({
    schemaVersion: "stage-tc-agent-v1",
    slides: [{
      slideId: sample.id,
      teachingGoal: `理解${sample.title}中的核心概念，并识别需要核验的证据。`,
      narration: [{
        displayText: `${sample.extractedText} 本页结论需结合${sample.notes}进行讲解。`,
        spokenText: `${sample.extractedText} 本页结论需结合${sample.notes}进行讲解。`,
      }],
      derivation: sample.formulas.length ? [{
        input: sample.formulas[0],
        output: "保守解释",
        transformation: "逐步说明",
        explanation: "只陈述输入中可验证的变换关系。",
        risk: "L1",
      }] : [],
      scenes: [{ durationMs: 2_000 }],
      preservationMode: "FULL_PRESERVE",
    }],
  });
}
