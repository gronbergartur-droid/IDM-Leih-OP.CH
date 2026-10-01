import { describe, expect, it } from 'vitest';
import { computeDHashFromGrayscale, hammingDistance, similarityPercent } from './imageHash';

function grid(width: number, height: number, value: (x: number, y: number) => number): number[] {
  const pixels: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      pixels.push(value(x, y));
    }
  }
  return pixels;
}

describe('computeDHashFromGrayscale', () => {
  it('throws for a grid that is not 9x8', () => {
    expect(() => computeDHashFromGrayscale([1, 2, 3])).toThrow();
  });

  it('produces a 16-character hex string', () => {
    const pixels = grid(9, 8, (x) => x * 10);
    const hash = computeDHashFromGrayscale(pixels);
    expect(hash).toHaveLength(16);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is deterministic for the same input', () => {
    const pixels = grid(9, 8, (x, y) => (x + y) % 5);
    expect(computeDHashFromGrayscale(pixels)).toBe(computeDHashFromGrayscale(pixels));
  });

  it('produces all-zero bits for a strictly left-to-right darkening gradient', () => {
    // Each pixel is darker than its left neighbour, so every "left < right" comparison is false.
    const pixels = grid(9, 8, (x) => 255 - x * 10);
    expect(computeDHashFromGrayscale(pixels)).toBe('0000000000000000');
  });

  it('produces all-one bits for a strictly left-to-right brightening gradient', () => {
    const pixels = grid(9, 8, (x) => x * 10);
    expect(computeDHashFromGrayscale(pixels)).toBe('ffffffffffffffff');
  });
});

describe('hammingDistance', () => {
  it('is 0 for identical hashes', () => {
    expect(hammingDistance('0000000000000000', '0000000000000000')).toBe(0);
    expect(hammingDistance('ffffffffffffffff', 'ffffffffffffffff')).toBe(0);
  });

  it('is 64 for maximally different hashes', () => {
    expect(hammingDistance('0000000000000000', 'ffffffffffffffff')).toBe(64);
  });

  it('counts a single differing bit', () => {
    // 0x1 = 0001, 0x0 = 0000 -> 1 differing bit in the last hex digit.
    expect(hammingDistance('0000000000000000', '0000000000000001')).toBe(1);
  });

  it('treats mismatched-length hashes as maximally different', () => {
    expect(hammingDistance('00', '0000000000000000')).toBe(64);
  });
});

describe('similarityPercent', () => {
  it('is 100 for identical hashes', () => {
    expect(similarityPercent('abcdef0123456789', 'abcdef0123456789')).toBe(100);
  });

  it('is 0 for maximally different hashes', () => {
    expect(similarityPercent('0000000000000000', 'ffffffffffffffff')).toBe(0);
  });

  it('is roughly proportional to the number of matching bits', () => {
    // 1 differing bit out of 64 -> ~98%.
    expect(similarityPercent('0000000000000000', '0000000000000001')).toBe(98);
  });
});
