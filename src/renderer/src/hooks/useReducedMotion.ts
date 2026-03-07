/**
 * useReducedMotion Hook
 * Detects user's motion preference from system settings
 */

import { useState, useEffect, useMemo } from 'react';

/**
 * Hook to detect if user prefers reduced motion
 * Returns true if the user has enabled "reduce motion" in their OS settings
 */
export function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(() => {
    if (typeof window === 'undefined') return false;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    return mediaQuery.matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    const handleChange = (event: MediaQueryListEvent) => {
      setReducedMotion(event.matches);
    };

    // Modern browsers
    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  return reducedMotion;
}

/**
 * Motion variants that respect reduced motion preference
 */
export interface MotionVariants {
  initial: Record<string, unknown>;
  animate: Record<string, unknown>;
  exit: Record<string, unknown>;
  transition: Record<string, unknown>;
}

/**
 * Get Framer Motion variants that respect reduced motion preference
 */
export function useMotionVariants(): MotionVariants {
  const reducedMotion = useReducedMotion();

  return useMemo(() => {
    if (reducedMotion) {
      return {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.01 },
      };
    }

    return {
      initial: { opacity: 0, y: 10, scale: 0.95 },
      animate: { opacity: 1, y: 0, scale: 1 },
      exit: { opacity: 0, y: -10, scale: 0.95 },
      transition: { duration: 0.2, ease: 'easeOut' },
    };
  }, [reducedMotion]);
}

/**
 * Get animation duration based on reduced motion preference
 */
export function useAnimationDuration(normalDuration: number): number {
  const reducedMotion = useReducedMotion();
  return reducedMotion ? 0 : normalDuration;
}

/**
 * Get transition props for Framer Motion that respect reduced motion
 */
export function useTransition(normalTransition: Record<string, unknown>): Record<string, unknown> {
  const reducedMotion = useReducedMotion();

  return useMemo(() => {
    if (reducedMotion) {
      return { duration: 0 };
    }
    return normalTransition;
  }, [reducedMotion, normalTransition]);
}

export default useReducedMotion;
