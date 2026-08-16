import { z } from "zod";

export const REVIEW_CONFIDENCE_THRESHOLD = 0.9;

export const ReviewFlagSchema = z.enum([
  "LOW_CONFIDENCE",
  "PARSE_WARNING",
  "FORMULA_REVIEW",
  "HIGH_RISK_DERIVATION",
]);

export type ReviewFlag = z.infer<typeof ReviewFlagSchema>;

export interface ParseReviewInput {
  parseConfidence: number;
  parseWarnings: readonly string[];
  formulas: ReadonlyArray<{ status: "valid" | "warning" | "error" }>;
}

export function deriveParseReviewFlags(input: ParseReviewInput): ReviewFlag[] {
  const flags: ReviewFlag[] = [];
  if (input.parseConfidence < REVIEW_CONFIDENCE_THRESHOLD) {
    flags.push("LOW_CONFIDENCE");
  }
  if (input.parseWarnings.length > 0) {
    flags.push("PARSE_WARNING");
  }
  if (input.formulas.some((formula) => formula.status !== "valid")) {
    flags.push("FORMULA_REVIEW");
  }
  return flags;
}

export function deriveDerivationReviewFlags(
  derivation: ReadonlyArray<{ risk: "L0" | "L1" | "L2" | "L3" }>,
): ReviewFlag[] {
  return derivation.some((step) => step.risk === "L2" || step.risk === "L3")
    ? ["HIGH_RISK_DERIVATION"]
    : [];
}

export function mergeReviewFlags(...flagSets: readonly ReviewFlag[][]): ReviewFlag[] {
  return [...new Set(flagSets.flat())];
}
