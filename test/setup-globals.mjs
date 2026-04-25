import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

globalThis.describe = describe;
globalThis.it = it;
globalThis.before = before;
globalThis.beforeEach = beforeEach;
globalThis.after = after;
globalThis.afterEach = afterEach;

globalThis.expect = (actual) => ({
  toBe(expected) {
    assert.equal(actual, expected);
  },
  toBeTruthy() {
    assert.ok(actual);
  },
  toContain(expected) {
    if (typeof actual === 'string') {
      assert.ok(actual.includes(expected));
      return;
    }

    assert.ok(Array.isArray(actual), 'toContain expects a string or array');
    assert.ok(actual.includes(expected));
  },
  toMatch(expected) {
    assert.equal(typeof actual, 'string', 'toMatch expects a string');
    if (expected instanceof RegExp) {
      assert.match(actual, expected);
      return;
    }

    assert.match(actual, new RegExp(expected));
  },
  toHaveLength(expected) {
    assert.equal(actual?.length, expected);
  },
  toBeGreaterThan(expected) {
    assert.ok(actual > expected);
  },
  toBeGreaterThanOrEqual(expected) {
    assert.ok(actual >= expected);
  },
  toBeLessThan(expected) {
    assert.ok(actual < expected);
  },
  toBeLessThanOrEqual(expected) {
    assert.ok(actual <= expected);
  },
  toBeCloseTo(expected, precision = 2) {
    const tolerance = 10 ** -precision / 2;
    assert.ok(Math.abs(actual - expected) <= tolerance);
  },
});
