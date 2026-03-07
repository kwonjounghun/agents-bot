/**
 * VisuallyHidden Component
 * Hides content visually while keeping it accessible to screen readers
 */

import React, { ReactNode } from 'react';

interface VisuallyHiddenProps {
  children: ReactNode;
  as?: keyof JSX.IntrinsicElements;
}

/**
 * Renders content that is visually hidden but accessible to screen readers.
 * Use this for providing additional context to assistive technologies.
 *
 * @example
 * <button>
 *   <Icon name="close" />
 *   <VisuallyHidden>Close dialog</VisuallyHidden>
 * </button>
 */
export function VisuallyHidden({
  children,
  as: Component = 'span',
}: VisuallyHiddenProps): JSX.Element {
  return (
    <Component
      className="sr-only"
      style={{
        position: 'absolute',
        width: '1px',
        height: '1px',
        padding: 0,
        margin: '-1px',
        overflow: 'hidden',
        clip: 'rect(0, 0, 0, 0)',
        whiteSpace: 'nowrap',
        border: 0,
      }}
    >
      {children}
    </Component>
  );
}

export default VisuallyHidden;
