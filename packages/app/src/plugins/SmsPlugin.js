// packages/app/src/plugins/SmsPlugin.ts
import { registerPlugin } from '@capacitor/core';
// Web stub: SMS is silently unavailable on PWA — no errors thrown
export const Sms = registerPlugin('SmsPlugin', {
    web: () => ({
        readInbox: async () => ({ messages: [] }),
        checkPermissions: async () => ({ sms: 'denied' }),
        requestPermissions: async () => ({ sms: 'denied' }),
        addListener: async () => ({ remove: async () => { } }),
        removeAllListeners: async () => { },
    }),
});
