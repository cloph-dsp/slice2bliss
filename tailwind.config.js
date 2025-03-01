/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      animation: {
        'pulse-subtle': 'pulse-subtle 2s infinite ease-in-out',
        'waveform-glow': 'waveform-glow 2s infinite ease-in-out',
      },
      keyframes: {
        'pulse-subtle': {
          '0%, 100%': { opacity: 0.7 },
          '50%': { opacity: 0.9 },
        },
        'waveform-glow': {
          '0%, 100%': { filter: 'drop-shadow(0 0 2px rgba(247, 220, 111, 0.5))' },
          '50%': { filter: 'drop-shadow(0 0 5px rgba(247, 220, 111, 0.8))' },
        },
      },
      boxShadow: {
        'active-slice': '0 0 0 2px rgba(247, 220, 111, 0.8), 0 0 15px rgba(247, 220, 111, 0.5)',
      },
    },
  },
  plugins: [],
}
