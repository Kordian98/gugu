// Prints the gate-style last line: `STATUS: ok` or `STATUS: fail <n> failed: <first test> (file:line) — <first error line>`.
import type { FullResult, Reporter, TestCase, TestResult } from "@playwright/test/reporter";

export default class StatusReporter implements Reporter {
  private failures: string[] = [];
  private passed = 0;

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.retry < test.retries && test.outcome() !== "expected") return;
    const outcome = test.outcome();
    if (outcome === "expected") this.passed++;
    else if (outcome === "unexpected") {
      const first = (result.error?.message ?? "").split("\n").find((l) => l.trim()) ?? "";
      // eslint-disable-next-line no-control-regex
      const clean = first.replace(/\u001b\[[0-9;]*m/g, "").slice(0, 200);
      this.failures.push(
        `${test.titlePath().slice(1).join(" › ")} (${test.location.file.split("/e2e/web/")[1] ?? test.location.file}:${String(test.location.line)}) — ${clean}`,
      );
    }
  }

  onEnd(result: FullResult): void {
    const secs = Math.round(result.duration / 1000);
    if (result.status === "passed") {
      process.stdout.write(
        `\nSTATUS: ok e2e-web ${String(this.passed)} passed in ${String(secs)}s\n`,
      );
    } else {
      process.stdout.write(`\n${this.failures.map((f) => `FAILED ${f}`).join("\n")}\n`);
      process.stdout.write(
        `STATUS: fail e2e-web ${String(this.failures.length)} failed (${result.status}): ${this.failures[0] ?? "see report"}\n`,
      );
    }
  }
}
