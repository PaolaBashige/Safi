import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { evaluate, evaluateAll, judge } from './corpus-eval';
import { CORPUS, FICTIONAL_EDU, GROUP_NAMES, type CorpusGroup } from './fixtures/corpus';

/**
 * Evaluation corpus for the email detector.
 *
 * These tests do NOT assert that every fixture is classified as a human would hope. Doing so would turn
 * every detector weakness into a red build, or tempt us to bend the expectations. Instead:
 *   1. the corpus itself is checked (shape, fictional data only, deterministic), and
 *   2. current behaviour is pinned in fixtures/corpus-baseline.json, so any change to the detector's
 *      output on this corpus is noticed and has to be reviewed on purpose.
 * Where the pinned result differs from the human expectation, that is a finding. See docs/detection-evaluation.md.
 *
 * Set CORPUS_REPORT_FILE=<path> to write the full per-fixture evaluation as JSON.
 */

const BASELINE_PATH = fileURLToPath(new URL('./fixtures/corpus-baseline.json', import.meta.url));
const baseline: Record<string, string> = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) : {};

describe('corpus shape', () => {
  it('has 25 fixtures, five in each of the five groups, with unique ids', () => {
    expect(CORPUS).toHaveLength(25);
    const ids = new Set(CORPUS.map((c) => c.id));
    expect(ids.size).toBe(25);
    for (const g of Object.keys(GROUP_NAMES) as CorpusGroup[]) {
      expect(CORPUS.filter((c) => c.group === g)).toHaveLength(5);
    }
    for (const c of CORPUS) {
      expect(c.id.startsWith(c.group)).toBe(true);
      expect(c.content.length).toBeGreaterThan(150);
      expect(c.rationale.length).toBeGreaterThan(20);
    }
  });

  it('expects phishing in A and B and legitimate mail in C, D and E', () => {
    for (const c of CORPUS) {
      if (c.group === 'A') expect(c.expected).toBe('HIGH RISK');
      else if (c.group === 'B') expect(c.expected).toBe('SUSPICIOUS+');
      else expect(c.expected).toBe('LOW RISK');
    }
  });

  it('uses only fictional addresses and domains', () => {
    const okHost = (h: string) =>
      h.endsWith('.example') || h === 'bit.ly' || h === 'tinyurl.com' || FICTIONAL_EDU.some((d) => h === d || h.endsWith('.' + d));
    for (const c of CORPUS) {
      for (const url of c.content.match(/https?:\/\/[^\s<>"')]+/g) ?? []) {
        const host = new URL(url.replace(/[.,;:!?]+$/, '')).hostname;
        expect(okHost(host), `${c.id}: ${host}`).toBe(true);
      }
      for (const email of c.content.match(/[\w.+-]+@[\w.-]+\.[a-z]+/gi) ?? []) {
        const host = email.split('@')[1]!.toLowerCase();
        expect(okHost(host), `${c.id}: ${email}`).toBe(true);
      }
    }
  });

  it('has no real-looking phone numbers (only the reserved 555-01xx range)', () => {
    for (const c of CORPUS) {
      for (const phone of c.content.match(/\b\d{3}-\d{4}\b/g) ?? []) expect(phone.startsWith('555-01'), `${c.id}: ${phone}`).toBe(true);
    }
  });
});

describe('evaluation harness', () => {
  it('judges results against broad expectations', () => {
    expect(judge('HIGH RISK', 'HIGH RISK')).toBe('PASS');
    expect(judge('HIGH RISK', 'SUSPICIOUS')).toBe('BORDERLINE');
    expect(judge('HIGH RISK', 'LOW RISK')).toBe('FALSE_NEGATIVE');
    expect(judge('SUSPICIOUS+', 'SUSPICIOUS')).toBe('PASS');
    expect(judge('SUSPICIOUS+', 'HIGH RISK')).toBe('PASS');
    expect(judge('SUSPICIOUS+', 'LOW RISK')).toBe('FALSE_NEGATIVE');
    expect(judge('LOW RISK', 'LOW RISK')).toBe('PASS');
    expect(judge('LOW RISK', 'SUSPICIOUS')).toBe('BORDERLINE');
    expect(judge('LOW RISK', 'HIGH RISK')).toBe('FALSE_POSITIVE');
  });

  it('is deterministic: the same fixtures always give the same results', () => {
    expect(evaluateAll()).toEqual(evaluateAll());
  });

  it('never calls anything but the deterministic engine', () => {
    for (const row of evaluateAll()) expect(row.confidence === 'low' || row.confidence === 'medium' || row.confidence === 'high').toBe(true);
  });

  it('writes the full evaluation as JSON when CORPUS_REPORT_FILE is set', () => {
    const file = process.env.CORPUS_REPORT_FILE;
    if (!file) return;
    writeFileSync(file, JSON.stringify(evaluateAll(), null, 2));
  });
});

describe('current behaviour is pinned (change on purpose, not by accident)', () => {
  it('has a baseline entry for every fixture', () => {
    expect(Object.keys(baseline).sort()).toEqual(CORPUS.map((c) => c.id).sort());
  });

  for (const item of CORPUS) {
    it(`${item.id} still gets the pinned risk level`, () => {
      expect(evaluate(item).actual).toBe(baseline[item.id]);
    });
  }
});
