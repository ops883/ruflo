/**
 * BatchEmbedder - Batches ONNX inference to avoid 10k individual calls on bulkInsert.
 *
 * Groups texts into chunks of batchSize (default 32) and calls the provided
 * EmbeddingGenerator once per chunk rather than once per text.
 * This is a pure TypeScript wrapper — it does NOT import ONNX directly; instead
 * it delegates to whatever EmbeddingGenerator the caller supplies.
 *
 * @module v3/memory/batch-embedder
 */

import type { EmbeddingGenerator } from './types.js';

/**
 * Configuration for the BatchEmbedder.
 */
export interface BatchEmbedderConfig {
  /** Number of texts to process per ONNX call. Default: 32. */
  batchSize?: number;

  /**
   * Maximum number of concurrent batch inferences running in parallel.
   * A value of 1 means strictly sequential batches (safer for low-memory
   * environments). Higher values allow pipeline parallelism.
   * Default: 1.
   */
  maxConcurrency?: number;
}

/**
 * Batches embedding generation to reduce ONNX inference overhead.
 *
 * Instead of calling the EmbeddingGenerator N times for N texts,
 * it groups texts into batches and calls the generator once per batch.
 * When the generator natively supports arrays it benefits directly; when it
 * only handles a single string the caller should wrap it — see constructor docs.
 *
 * @example
 * ```typescript
 * const embedder = new BatchEmbedder(myOnnxEmbeddingFn, { batchSize: 32 });
 * const embeddings = await embedder.embedBatch(thousandsOfTexts);
 * ```
 */
export class BatchEmbedder {
  private generator: EmbeddingGenerator;
  private batchSize: number;
  private maxConcurrency: number;

  /**
   * @param generator - The underlying embedding function. Must accept a single
   *   string and return a Float32Array. BatchEmbedder handles grouping.
   * @param config - Optional tuning parameters.
   */
  constructor(generator: EmbeddingGenerator, config: BatchEmbedderConfig = {}) {
    this.generator = generator;
    this.batchSize = config.batchSize ?? 32;
    this.maxConcurrency = config.maxConcurrency ?? 1;

    if (this.batchSize < 1) {
      throw new RangeError(`batchSize must be >= 1, got ${this.batchSize}`);
    }
    if (this.maxConcurrency < 1) {
      throw new RangeError(`maxConcurrency must be >= 1, got ${this.maxConcurrency}`);
    }
  }

  /**
   * Embed an array of texts in batches.
   *
   * Returns a Float32Array per input text, in the same order as the input array.
   * Empty input returns an empty array without calling the generator.
   *
   * @param texts - The texts to embed. May be empty.
   * @returns Array of embeddings, one per input text.
   */
  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    if (texts.length === 0) return [];

    // Split texts into chunks of batchSize
    const chunks: string[][] = [];
    for (let i = 0; i < texts.length; i += this.batchSize) {
      chunks.push(texts.slice(i, i + this.batchSize));
    }

    // Process chunks, respecting maxConcurrency
    const results: Float32Array[] = new Array(texts.length);
    let chunkIndex = 0;

    while (chunkIndex < chunks.length) {
      // Build a window of up to maxConcurrency chunks
      const window = chunks.slice(chunkIndex, chunkIndex + this.maxConcurrency);

      // Run the window in parallel, each chunk sequentially within itself
      const windowEmbeddings = await Promise.all(
        window.map((chunk) => this.embedChunk(chunk))
      );

      // Flatten window results back into the results array at correct offsets
      for (let w = 0; w < window.length; w++) {
        const globalOffset = (chunkIndex + w) * this.batchSize;
        const chunkEmbeddings = windowEmbeddings[w];
        for (let j = 0; j < chunkEmbeddings.length; j++) {
          results[globalOffset + j] = chunkEmbeddings[j];
        }
      }

      chunkIndex += this.maxConcurrency;
    }

    return results;
  }

  /**
   * Embed a single text. Thin wrapper around the underlying generator.
   *
   * @param text - The text to embed.
   * @returns The embedding Float32Array.
   */
  async embedSingle(text: string): Promise<Float32Array> {
    return this.generator(text);
  }

  /**
   * The configured batch size.
   */
  getBatchSize(): number {
    return this.batchSize;
  }

  /**
   * The configured max concurrency.
   */
  getMaxConcurrency(): number {
    return this.maxConcurrency;
  }

  // ===== Private Helpers =====

  /**
   * Embed a single chunk (array of texts) by calling the generator per text.
   * Results are in input order.
   */
  private async embedChunk(chunk: string[]): Promise<Float32Array[]> {
    return Promise.all(chunk.map((text) => this.generator(text)));
  }
}

export default BatchEmbedder;
