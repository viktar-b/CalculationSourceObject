import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      animation: {
        'bounce-x': 'bounce-x 1.5s ease-in-out infinite',
      },
    },
    screens: {
      'max-2xl': { max: '1399px' },
      'min-2xl': { min: '1400px' },
      'max-xl': { max: '1200px' },
      'min-xl': { min: '1201px' },
      'max-lg': { max: '1024px' },
      'min-lg': { min: '1025px' },
      'max-md': { max: '768px' },
      'min-md': { min: '769px' },
      'max-sm': { max: '449px' },
      'min-sm': { min: '450px' },
    },
  },
};

export default config;
