/**
 * StreamingIndicator Component
 *
 * Inline streaming dots animation for message bubbles.
 * Pure presentational component.
 */

interface StreamingIndicatorProps {
  color?: string;
}

export function StreamingIndicator({ color = 'bg-white/60' }: StreamingIndicatorProps) {
  return (
    <span className="inline-flex ml-1 items-center">
      <span
        className={`w-1.5 h-1.5 ${color} rounded-full mx-0.5 animate-bounce`}
        style={{ animationDelay: '0ms' }}
      />
      <span
        className={`w-1.5 h-1.5 ${color} rounded-full mx-0.5 animate-bounce`}
        style={{ animationDelay: '150ms' }}
      />
      <span
        className={`w-1.5 h-1.5 ${color} rounded-full mx-0.5 animate-bounce`}
        style={{ animationDelay: '300ms' }}
      />
    </span>
  );
}

export default StreamingIndicator;
