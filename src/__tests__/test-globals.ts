export {};

declare global {
  const describe: (name: string, fn: () => void | Promise<void>) => void;
  const it: (name: string, fn: () => void | Promise<void>) => void;
  const beforeEach: (fn: () => void | Promise<void>) => void;
  const before: (fn: () => void | Promise<void>) => void;
  const afterEach: (fn: () => void | Promise<void>) => void;
  const after: (fn: () => void | Promise<void>) => void;

  const expect: (actual: unknown) => {
    toBe: (expected: unknown) => void;
    toBeTruthy: () => void;
    toContain: (expected: unknown) => void;
    toMatch: (expected: string | RegExp) => void;
    toHaveLength: (expected: number) => void;
    toBeGreaterThan: (expected: number) => void;
    toBeGreaterThanOrEqual: (expected: number) => void;
    toBeLessThan: (expected: number) => void;
    toBeLessThanOrEqual: (expected: number) => void;
    toBeCloseTo: (expected: number, precision?: number) => void;
  };
}
