/**
 * Flash Attention 2 GPU Backend Detection
 *
 * Provides runtime detection of GPU backends that support Flash Attention 2:
 *   - CUDA  (Linux / Windows via nvidia-smi)
 *   - Metal (macOS via system_profiler)
 *   - WebGPU (browser / Deno / Bun via navigator.gpu)
 *
 * The detection result is cached after the first call so repeated
 * initialisation of SONA engines in the same process pays the probe cost
 * only once.
 *
 * @module flash-attention
 */

// ============================================================================
// Result cache
// ============================================================================

let cachedResult: boolean | undefined;

// ============================================================================
// detectFlashAttentionSupport
// ============================================================================

/**
 * Detect whether a GPU backend capable of Flash Attention 2 is available.
 *
 * Detection order:
 *   1. WebGPU  — `navigator.gpu.requestAdapter()` (browser / edge runtimes)
 *   2. CUDA    — `nvidia-smi` (Linux / Windows)
 *   3. Metal   — `system_profiler SPDisplaysDataType` (macOS)
 *
 * The function is intentionally non-throwing: any failure returns false so
 * the caller can safely proceed with a CPU-only configuration.
 *
 * Results are cached in-process; pass `force = true` to bypass the cache
 * (useful in tests or after a hardware change).
 *
 * @param force - Re-run detection even if a cached result exists
 * @returns true when a supported GPU backend is detected
 */
export async function detectFlashAttentionSupport(force = false): Promise<boolean> {
  if (!force && cachedResult !== undefined) {
    return cachedResult;
  }

  const detected = await probe();
  cachedResult = detected;
  return detected;
}

// ============================================================================
// Internal probe
// ============================================================================

async function probe(): Promise<boolean> {
  // 1. WebGPU (browser / Deno / Bun / edge workers)
  if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
    try {
      const gpu = (navigator as unknown as { gpu: { requestAdapter(): Promise<unknown> } }).gpu;
      const adapter = await gpu.requestAdapter();
      if (adapter !== null) return true;
    } catch {
      // WebGPU adapter request failed
    }
  }

  // 2 & 3. Node.js child_process path
  try {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const { platform } = await import('os');
    const execFileAsync = promisify(execFile);
    const os = platform();

    if (os === 'linux' || os === 'win32') {
      // CUDA: nvidia-smi exits 0 when at least one GPU is present
      try {
        await execFileAsync('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader'], {
          timeout: 3000,
        });
        return true;
      } catch {
        // nvidia-smi not found or no CUDA GPU present
      }
    }

    if (os === 'darwin') {
      // Metal: all Apple Silicon and modern Intel Macs expose Metal
      try {
        const { stdout } = await execFileAsync('system_profiler', ['SPDisplaysDataType'], {
          timeout: 3000,
        });
        if (stdout.includes('Metal')) return true;
      } catch {
        // system_profiler unavailable
      }
    }
  } catch {
    // child_process or os module unavailable (edge runtime)
  }

  return false;
}
