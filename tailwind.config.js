/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{js,ts,jsx,tsx,html}'],
  theme: {
    extend: {
      colors: {
        planner: '#8B5CF6',
        executor: '#3B82F6',
        reviewer: '#10B981',
        designer: '#EC4899',
        debugger: '#F97316',
        architect: '#14B8A6'
      },
      animation: {
        'bounce-slow': 'bounce 2s infinite',
        'pulse-slow': 'pulse 3s infinite',
        'typing': 'typing 1s steps(3) infinite'
      },
      keyframes: {
        typing: {
          '0%, 100%': { content: '"."' },
          '33%': { content: '".."' },
          '66%': { content: '"..."' }
        }
      }
    }
  },
  plugins: []
}
