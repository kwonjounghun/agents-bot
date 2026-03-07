/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{js,ts,jsx,tsx,html}'],
  theme: {
    extend: {
      colors: {
        // Command Center Palette
        navy: {
          DEFAULT: '#0A1628',
          50: '#1A2A42',
          100: '#152236',
          200: '#0F1C2E',
          300: '#0A1628',
          400: '#081220',
          500: '#060E18',
        },
        cyan: {
          electric: '#00E5FF',
          glow: 'rgba(0, 229, 255, 0.25)',
          dim: 'rgba(0, 229, 255, 0.1)',
        },
        // Agent colors (preserved for compatibility)
        planner: '#8B5CF6',
        executor: '#3B82F6',
        reviewer: '#10B981',
        designer: '#EC4899',
        debugger: '#F97316',
        architect: '#14B8A6',
        analyst: '#6366F1',
        explorer: '#22D3EE',
        verifier: '#84CC16',
        writer: '#F472B6',
      },
      fontFamily: {
        mono: ['Space Mono', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      fontSize: {
        // WCAG compliant minimum sizes
        'xs': ['12px', { lineHeight: '16px' }],
        'sm': ['14px', { lineHeight: '20px' }],
        'base': ['16px', { lineHeight: '24px' }],
        'lg': ['18px', { lineHeight: '28px' }],
      },
      animation: {
        'bounce-slow': 'bounce 2s infinite',
        'pulse-slow': 'pulse 3s infinite',
        'typing': 'typing 1s steps(3) infinite',
        'ring-spin': 'ring-spin 1.5s linear infinite',
        'glow': 'glow 2s ease-in-out infinite',
        'fade-in': 'fade-in 0.2s ease-out',
        'scale-in': 'scale-in 0.2s ease-out',
      },
      keyframes: {
        typing: {
          '0%, 100%': { content: '"."' },
          '33%': { content: '".."' },
          '66%': { content: '"..."' },
        },
        'ring-spin': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        glow: {
          '0%, 100%': { opacity: '0.5' },
          '50%': { opacity: '1' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      boxShadow: {
        'glow-cyan': '0 0 20px rgba(0, 229, 255, 0.3)',
        'glow-sm': '0 0 10px currentColor',
        'glow-md': '0 0 20px currentColor',
      },
    },
  },
  plugins: [],
}
