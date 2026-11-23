import { describe, expect, it } from "vitest";
import { listedGoldenCases, runGoldenCase } from "../../evals/golden/run";

const live = process.env.CAREUNFOLD_EVAL_LIVE === "1" && Boolean(process.env.OPENROUTER_API_KEY?.trim());

describe.skipIf(!live)("golden billing regression", () => {
  it.each(listedGoldenCases())("$id", async (item) => {
    const result = await runGoldenCase(item);
    expect(result.leaks, `${item.id} leaked answer-key fields: ${result.leaks.join(", ")}`).toEqual([]);
    expect(result.unread, `${item.id} unread documents: ${result.unread.join(" | ")}`).toEqual([]);
    const failed = result.score.checks.filter((check) => check.hard && !check.ok).map((check) => check.detail);
    expect(result.score.passed, `${item.id}: ${failed.join("; ")}`).toBe(true);
  }, 600_000);
});
