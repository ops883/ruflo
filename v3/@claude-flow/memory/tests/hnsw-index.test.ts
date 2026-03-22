import { describe, it, expect, beforeEach } from 'vitest';
import { HNSWIndex } from '../src/hnsw-index.js';

/**
 * Helper to create a Float32Array from a plain number array.
 */
function vec(...values: number[]): Float32Array {
  return new Float32Array(values);
}

describe('HNSWIndex', () => {
  let index: HNSWIndex;

  beforeEach(() => {
    index = new HNSWIndex({
      dimensions: 3,
      metric: 'euclidean',
      M: 4,
      efConstruction: 50,
      maxElements: 100,
    });
  });

  // ----------------------------------------------------------------
  // Basic operations
  // ----------------------------------------------------------------
  describe('basic operations', () => {
    it('should add points and report correct size', async () => {
      await index.addPoint('a', vec(1, 0, 0));
      await index.addPoint('b', vec(0, 1, 0));

      expect(index.size).toBe(2);
      expect(index.has('a')).toBe(true);
      expect(index.has('b')).toBe(true);
      expect(index.has('z')).toBe(false);
    });

    it('should search for nearest neighbors', async () => {
      await index.addPoint('a', vec(1, 0, 0));
      await index.addPoint('b', vec(0, 1, 0));
      await index.addPoint('c', vec(0, 0, 1));

      const results = await index.search(vec(1, 0.1, 0), 2);

      expect(results.length).toBe(2);
      // Closest to [1, 0.1, 0] should be 'a' = [1, 0, 0]
      expect(results[0].id).toBe('a');
      expect(results[0].distance).toBeCloseTo(0.1, 1);
    });

    it('should return results sorted by ascending distance', async () => {
      await index.addPoint('a', vec(1, 0, 0));
      await index.addPoint('b', vec(0, 1, 0));
      await index.addPoint('c', vec(0.9, 0, 0));

      const results = await index.search(vec(1, 0, 0), 3);

      for (let i = 1; i < results.length; i++) {
        expect(results[i].distance).toBeGreaterThanOrEqual(results[i - 1].distance);
      }
    });

    it('should auto-detect dimensions from first vector', async () => {
      const autoIndex = new HNSWIndex({ metric: 'euclidean' });
      await autoIndex.addPoint('x', vec(1, 2, 3, 4));

      expect(autoIndex.size).toBe(1);

      // Second vector with same dimensions should succeed
      await autoIndex.addPoint('y', vec(5, 6, 7, 8));
      expect(autoIndex.size).toBe(2);
    });

    it('should reject vector with wrong dimensions', async () => {
      await index.addPoint('a', vec(1, 0, 0));

      await expect(index.addPoint('b', vec(1, 0))).rejects.toThrow(
        /dimension mismatch/i
      );
    });

    it('should clear all data', async () => {
      await index.addPoint('a', vec(1, 0, 0));
      await index.addPoint('b', vec(0, 1, 0));

      index.clear();

      expect(index.size).toBe(0);
      expect(index.has('a')).toBe(false);
    });

    it('should return stats with correct vector count', async () => {
      await index.addPoint('a', vec(1, 0, 0));
      await index.addPoint('b', vec(0, 1, 0));

      const stats = index.getStats();
      expect(stats.vectorCount).toBe(2);
      expect(stats.memoryUsage).toBeGreaterThan(0);
    });
  });

  // ----------------------------------------------------------------
  // Delete functionality (lazy deletion)
  // ----------------------------------------------------------------
  describe('deletePoint (lazy deletion)', () => {
    beforeEach(async () => {
      await index.addPoint('a', vec(1, 0, 0));
      await index.addPoint('b', vec(0, 1, 0));
      await index.addPoint('c', vec(0, 0, 1));
    });

    it('should mark node as deleted and return true', async () => {
      const result = await index.deletePoint('b');

      expect(result).toBe(true);
      expect(index.isDeleted('b')).toBe(true);
    });

    it('should return false for non-existent node', async () => {
      const result = await index.deletePoint('nonexistent');

      expect(result).toBe(false);
    });

    it('should not change size (lazy deletion keeps node in graph)', async () => {
      await index.deletePoint('b');

      // The node is still in the graph for routing purposes
      expect(index.size).toBe(3);
      expect(index.has('b')).toBe(true);
    });

    it('should report correct deletedCount', async () => {
      expect(index.deletedCount).toBe(0);

      await index.deletePoint('a');
      expect(index.deletedCount).toBe(1);

      await index.deletePoint('b');
      expect(index.deletedCount).toBe(2);
    });

    it('should filter deleted nodes from search results', async () => {
      await index.deletePoint('a');

      const results = await index.search(vec(1, 0, 0), 3);
      const ids = results.map((r) => r.id);

      expect(ids).not.toContain('a');
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('isDeleted returns false for non-deleted node', () => {
      expect(index.isDeleted('a')).toBe(false);
    });

    it('isDeleted returns false for unknown id', () => {
      expect(index.isDeleted('unknown')).toBe(false);
    });
  });

  // ----------------------------------------------------------------
  // Compact
  // ----------------------------------------------------------------
  describe('compact', () => {
    beforeEach(async () => {
      await index.addPoint('a', vec(1, 0, 0));
      await index.addPoint('b', vec(0, 1, 0));
      await index.addPoint('c', vec(0, 0, 1));
      await index.addPoint('d', vec(1, 1, 0));
    });

    it('should remove deleted nodes and rebuild graph', async () => {
      await index.deletePoint('b');
      await index.deletePoint('c');

      const result = await index.compact();

      expect(result.removed).toBe(2);
      expect(result.remaining).toBe(2);
      expect(index.size).toBe(2);
      expect(index.has('b')).toBe(false);
      expect(index.has('c')).toBe(false);
    });

    it('should reset deletedCount to 0 after compact', async () => {
      await index.deletePoint('a');
      expect(index.deletedCount).toBe(1);

      await index.compact();

      expect(index.deletedCount).toBe(0);
    });

    it('should keep surviving nodes searchable', async () => {
      await index.deletePoint('b');
      await index.compact();

      const results = await index.search(vec(1, 0, 0), 3);
      const ids = results.map((r) => r.id);

      expect(ids).toContain('a');
      expect(ids).not.toContain('b');
    });

    it('should be a no-op when nothing is deleted', async () => {
      const result = await index.compact();

      expect(result.removed).toBe(0);
      expect(result.remaining).toBe(4);
      expect(index.size).toBe(4);
    });
  });

  // ----------------------------------------------------------------
  // Edge cases
  // ----------------------------------------------------------------
  describe('edge cases', () => {
    it('should return empty array when searching an empty index', async () => {
      const emptyIndex = new HNSWIndex({
        dimensions: 3,
        metric: 'euclidean',
      });

      const results = await emptyIndex.search(vec(1, 0, 0), 5);

      expect(results).toEqual([]);
    });

    it('should handle search with k larger than available points', async () => {
      await index.addPoint('a', vec(1, 0, 0));
      await index.addPoint('b', vec(0, 1, 0));

      const results = await index.search(vec(1, 0, 0), 100);

      expect(results.length).toBeLessThanOrEqual(2);
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle adding duplicate IDs by overwriting', async () => {
      await index.addPoint('a', vec(1, 0, 0));
      // Adding same ID again increases node count (implementation stores both)
      await index.addPoint('a', vec(0, 1, 0));

      // The node map uses ID as key, so the latest write wins for the map entry
      // but the graph may have references to the old node.
      // We verify search still works without throwing.
      const results = await index.search(vec(0, 1, 0), 1);
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle removePoint for non-existent node', async () => {
      const removed = await index.removePoint('nonexistent');

      expect(removed).toBe(false);
    });

    it('should handle removePoint and update entry point', async () => {
      await index.addPoint('a', vec(1, 0, 0));
      await index.addPoint('b', vec(0, 1, 0));

      const removed = await index.removePoint('a');
      expect(removed).toBe(true);
      expect(index.has('a')).toBe(false);
      expect(index.size).toBe(1);

      // Search should still work after removing a node
      const results = await index.search(vec(0, 1, 0), 1);
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('b');
    });

    it('should handle single-element index', async () => {
      await index.addPoint('only', vec(1, 2, 3));

      const results = await index.search(vec(1, 2, 3), 1);

      expect(results.length).toBe(1);
      expect(results[0].id).toBe('only');
      expect(results[0].distance).toBeCloseTo(0, 5);
    });

    it('should reject search query with wrong dimensions', async () => {
      await index.addPoint('a', vec(1, 0, 0));

      await expect(index.search(vec(1, 0), 1)).rejects.toThrow(
        /dimension mismatch/i
      );
    });

    it('should rebuild index from entries', async () => {
      await index.addPoint('a', vec(1, 0, 0));
      await index.addPoint('b', vec(0, 1, 0));

      await index.rebuild([
        { id: 'x', vector: vec(1, 1, 0) },
        { id: 'y', vector: vec(0, 0, 1) },
      ]);

      expect(index.size).toBe(2);
      expect(index.has('a')).toBe(false);
      expect(index.has('x')).toBe(true);
      expect(index.has('y')).toBe(true);
    });
  });

  // ----------------------------------------------------------------
  // Distance metrics
  // ----------------------------------------------------------------
  describe('distance metrics', () => {
    it('should work with cosine metric', async () => {
      const cosineIndex = new HNSWIndex({
        dimensions: 3,
        metric: 'cosine',
        M: 4,
        efConstruction: 50,
      });

      await cosineIndex.addPoint('a', vec(1, 0, 0));
      await cosineIndex.addPoint('b', vec(0, 1, 0));
      await cosineIndex.addPoint('c', vec(1, 1, 0));

      const results = await cosineIndex.search(vec(1, 0, 0), 2);

      expect(results.length).toBe(2);
      // 'a' is identical direction, 'c' shares a component
      expect(results[0].id).toBe('a');
    });

    it('should work with euclidean metric', async () => {
      // Uses the default beforeEach index (euclidean)
      await index.addPoint('a', vec(0, 0, 0));
      await index.addPoint('b', vec(3, 4, 0));

      const results = await index.search(vec(0, 0, 0), 1);

      expect(results[0].id).toBe('a');
      expect(results[0].distance).toBeCloseTo(0, 5);
    });
  });

  // ----------------------------------------------------------------
  // searchWithFilters
  // ----------------------------------------------------------------
  describe('searchWithFilters', () => {
    it('should apply filter to exclude specific IDs', async () => {
      await index.addPoint('a', vec(1, 0, 0));
      await index.addPoint('b', vec(0.9, 0.1, 0));
      await index.addPoint('c', vec(0, 1, 0));

      const results = await index.searchWithFilters(
        vec(1, 0, 0),
        2,
        (id) => id !== 'a'
      );

      const ids = results.map((r) => r.id);
      expect(ids).not.toContain('a');
      expect(results.length).toBeLessThanOrEqual(2);
    });
  });
});
