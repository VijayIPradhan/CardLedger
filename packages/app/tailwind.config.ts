import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#0A0A0A',
        surface: '#111111',
        elevated: '#1A1A1A',
        gold: '#C8A96E',
        'gold-hi': '#E8C97E',
        muted: '#8A8A8A',
        disabled: '#4A4A4A',
        success: '#2ECC71',
        danger: '#E74C3C',
        warning: '#F39C12',
      },
      borderRadius: {
        card: '24px',
        input: '16px',
        chip: '12px',
      },
      fontFamily: {
        sans: ['Inter var', 'Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
