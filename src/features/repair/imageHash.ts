/**
 * Phase 4 (v2.2 roadmap) - Photo Archive: image hashing + archive search.
 *
 * Computes a perceptual difference-hash (dHash) for a repair photo so
 * visually similar/identical photos can be found later without pixel-exact
 * matching - useful for surfacing earlier reports of the same recurring
 * defect. Deliberately not a vision/embedding model call: this is a cheap,
 * deterministic, explainable recommendation signal (the master prompt
 * explicitly marks vector similarity as optional); "Archive matching is a
 * recommendation system, not proof of identity" applies here too.
 */

const HASH_WIDTH = 9;
const HASH_HEIGHT = 8;
const HASH_BITS = (HASH_WIDTH - 1) * HASH_HEIGHT; // 64

const POPCOUNT_4BIT = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

/**
 * Pure dHash computation over a pre-extracted 9x8 grayscale pixel grid -
 * testable without any canvas/DOM dependency. Each bit compares a pixel to
 * its right neighbour within the same row (brighter-to-the-right = 1).
 */
export function computeDHashFromGrayscale(pixels: number[]): string {
  if (pixels.length !== HASH_WIDTH * HASH_HEIGHT) {
    throw new Error(`Erwarte ein ${HASH_WIDTH}x${HASH_HEIGHT}-Graustufenraster (${HASH_WIDTH * HASH_HEIGHT} Werte).`);
  }
  let bits = '';
  for (let y = 0; y < HASH_HEIGHT; y++) {
    for (let x = 0; x < HASH_WIDTH - 1; x++) {
      const left = pixels[y * HASH_WIDTH + x];
      const right = pixels[y * HASH_WIDTH + x + 1];
      bits += left < right ? '1' : '0';
    }
  }
  let hex = '';
  for (let i = 0; i < bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

/** Number of differing bits between two dHash hex strings - 0 is identical, 64 is maximally different. */
export function hammingDistance(hashA: string, hashB: string): number {
  if (hashA.length !== hashB.length) return HASH_BITS;
  let distance = 0;
  for (let i = 0; i < hashA.length; i++) {
    const diff = parseInt(hashA[i], 16) ^ parseInt(hashB[i], 16);
    distance += POPCOUNT_4BIT[diff];
  }
  return distance;
}

/** 0-100 - 100 means the two photos' dHashes are identical, 0 means maximally different. */
export function similarityPercent(hashA: string, hashB: string): number {
  const distance = hammingDistance(hashA, hashB);
  return Math.round(((HASH_BITS - distance) / HASH_BITS) * 100);
}

/** Below this Hamming distance (out of 64 bits), two photos are treated as showing a similar/identical instrument. */
export const SIMILARITY_MATCH_THRESHOLD = 12;

/**
 * Loads an image data URL into an offscreen canvas, downsamples it to 9x8
 * grayscale and computes its dHash. Browser-only (Image + canvas) - thin
 * DOM glue around the pure, independently-tested computeDHashFromGrayscale.
 */
export function computeDHash(imageDataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = HASH_WIDTH;
      canvas.height = HASH_HEIGHT;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D-Kontext nicht verfügbar.'));
        return;
      }
      ctx.drawImage(img, 0, 0, HASH_WIDTH, HASH_HEIGHT);
      const { data } = ctx.getImageData(0, 0, HASH_WIDTH, HASH_HEIGHT);
      const grayscale: number[] = [];
      for (let i = 0; i < data.length; i += 4) {
        grayscale.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      }
      resolve(computeDHashFromGrayscale(grayscale));
    };
    img.onerror = () => reject(new Error('Bild konnte nicht geladen werden.'));
    img.src = imageDataUrl;
  });
}
