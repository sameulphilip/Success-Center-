import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#0B2545',
          deep: '#071A33',
          soft: '#163A5F',
          mist: '#E8EEF5',
        },
        gold: {
          DEFAULT: '#C99612',
          soft: '#F7E7B0',
          deep: '#A67C0A',
        },
        ink: '#0F2744',
        sand: '#F3F6FB',
        surface: '#EEF2F8',
        sea: '#0284C7',
        coral: '#EA580C',
        mist: '#D5DEEA',
        sky: {
          DEFAULT: '#0284C7',
          soft: '#E0F2FE',
        },
        teal: {
          DEFAULT: '#0D9488',
          soft: '#CCFBF1',
        },
      },
      fontFamily: {
        display: ['"Cairo"', '"IBM Plex Sans Arabic"', 'Tahoma', 'sans-serif'],
        body: ['"Cairo"', '"IBM Plex Sans Arabic"', 'Tahoma', 'sans-serif'],
      },
      boxShadow: {
        panel: '0 12px 40px rgba(11, 37, 69, 0.08)',
        soft: '0 4px 18px rgba(11, 37, 69, 0.06)',
      },
    },
  },
  plugins: [],
};

export default config;
