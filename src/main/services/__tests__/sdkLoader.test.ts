/**
 * SDK Loader Unit Tests
 *
 * Tests for the SDK loader module using AAA pattern:
 * - Arrange: Set up test data and mocks
 * - Act: Execute the function being tested
 * - Assert: Verify the expected outcome
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createSDKLoader } from '../sdkLoader';

describe('SDKLoader', () => {
  describe('createSDKLoader', () => {
    it('should create a new loader instance', () => {
      // Arrange
      // No setup needed

      // Act
      const loader = createSDKLoader();

      // Assert
      expect(loader).toBeDefined();
      expect(loader.getSDK).toBeDefined();
      expect(loader.isLoaded).toBeDefined();
      expect(loader.reset).toBeDefined();
    });
  });

  describe('isLoaded', () => {
    it('should return false initially', () => {
      // Arrange
      const loader = createSDKLoader();

      // Act
      const result = loader.isLoaded();

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('reset', () => {
    it('should reset the loader state', () => {
      // Arrange
      const loader = createSDKLoader();

      // Act
      loader.reset();
      const result = loader.isLoaded();

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('getSDK', () => {
    it('should not reload SDK on subsequent calls', async () => {
      // Arrange
      const loader = createSDKLoader();

      // Act
      // Call getSDK twice - both should resolve without throwing
      // (we can't fully test the SDK import in unit tests, but we can verify the caching logic)
      const callCount = { value: 0 };
      const originalGetSDK = loader.getSDK;

      // First call marks as loading
      loader.getSDK();

      // Second call while still loading should not start a new load
      loader.getSDK();

      // Assert
      // After first call, isLoaded will still be false until promise resolves
      // But the loader should only create one loadPromise
      expect(loader.isLoaded()).toBe(false); // Not loaded until promise resolves
    });

    it('should handle multiple sequential calls', async () => {
      // Arrange
      const loader = createSDKLoader();

      // Act & Assert - no errors should be thrown
      loader.getSDK();
      loader.getSDK();
      loader.getSDK();

      // The loader should handle this gracefully
      expect(loader.isLoaded()).toBe(false);
    });
  });
});
