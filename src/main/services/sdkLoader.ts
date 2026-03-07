/**
 * SDK Loader Module
 * Single Responsibility: Lazy loading and caching of Claude Agent SDK
 *
 * Usage:
 *   const loader = createSDKLoader();
 *   const sdk = await loader.getSDK();
 */

export type ClaudeAgentSDK = typeof import('@anthropic-ai/claude-agent-sdk');

export interface SDKLoader {
  /**
   * Get the Claude Agent SDK module.
   * Loads lazily on first call and caches for subsequent calls.
   */
  getSDK(): Promise<ClaudeAgentSDK>;

  /**
   * Check if SDK has been loaded.
   */
  isLoaded(): boolean;

  /**
   * Reset the loader (for testing purposes).
   */
  reset(): void;
}

/**
 * Create a new SDK loader instance.
 * The loader ensures the SDK is only loaded once (singleton pattern).
 */
export function createSDKLoader(): SDKLoader {
  let sdkModule: ClaudeAgentSDK | null = null;
  let loadPromise: Promise<ClaudeAgentSDK> | null = null;

  return {
    async getSDK(): Promise<ClaudeAgentSDK> {
      // Return cached module if available
      if (sdkModule) {
        return sdkModule;
      }

      // Return existing load promise to prevent duplicate loads
      if (loadPromise) {
        return loadPromise;
      }

      // Start loading
      loadPromise = import('@anthropic-ai/claude-agent-sdk').then((module) => {
        sdkModule = module;
        return module;
      });

      return loadPromise;
    },

    isLoaded(): boolean {
      return sdkModule !== null;
    },

    reset(): void {
      sdkModule = null;
      loadPromise = null;
    }
  };
}

// Default singleton instance
let defaultLoader: SDKLoader | null = null;

/**
 * Get the default SDK loader singleton.
 */
export function getDefaultSDKLoader(): SDKLoader {
  if (!defaultLoader) {
    defaultLoader = createSDKLoader();
  }
  return defaultLoader;
}

/**
 * Convenience function to get the SDK using the default loader.
 */
export async function getSDK(): Promise<ClaudeAgentSDK> {
  return getDefaultSDKLoader().getSDK();
}
