export class CircuitBreaker {
  private readonly failures = new Map<string, { count: number; openUntil: number }>();
  private readonly threshold: number;
  private readonly coolDownMs: number;

  constructor(threshold = 5, coolDownMs = 30_000) {
    this.threshold = threshold;
    this.coolDownMs = coolDownMs;
  }

  assertClosed(key: string): void {
    const state = this.failures.get(key);
    if (!state) {
      return;
    }
    if (state.count >= this.threshold && Date.now() < state.openUntil) {
      throw new Error(`Circuit open for ${key}`);
    }
    if (Date.now() >= state.openUntil) {
      this.failures.delete(key);
    }
  }

  recordSuccess(key: string): void {
    this.failures.delete(key);
  }

  recordFailure(key: string): void {
    const current = this.failures.get(key) ?? { count: 0, openUntil: 0 };
    current.count += 1;
    if (current.count >= this.threshold) {
      current.openUntil = Date.now() + this.coolDownMs;
    }
    this.failures.set(key, current);
  }
}
