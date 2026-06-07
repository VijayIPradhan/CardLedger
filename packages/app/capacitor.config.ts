// packages/app/capacitor.config.ts
import type { CapacitorConfig } from '@capacitor/cli';

const isDev = process.env.NODE_ENV !== 'production';

const config: CapacitorConfig = {
  appId: 'com.cardledger.app',
  appName: 'CardLedger',
  webDir: 'dist',
  // Dev mode: point to host server via Android emulator alias 10.0.2.2
  // Production: bundled dist talks directly to deployed server — server key omitted
  ...(isDev && {
    server: {
      url: 'http://10.0.2.2:5173',
      cleartext: true,
    },
  }),
  plugins: {
    SplashScreen: { launchAutoHide: false },
  },
};

export default config;
