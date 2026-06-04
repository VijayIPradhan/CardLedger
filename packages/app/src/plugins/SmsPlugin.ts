// packages/app/src/plugins/SmsPlugin.ts
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface SmsMessage {
  sender: string;
  body: string;
  timestamp: number; // Unix ms
}

export interface SmsPlugin {
  readInbox(options: { daysBack: number }): Promise<{ messages: SmsMessage[] }>;
  checkPermissions(): Promise<{ sms: PermissionState }>;
  requestPermissions(): Promise<{ sms: PermissionState }>;
  addListener(
    event: 'smsReceived',
    handler: (msg: SmsMessage) => void,
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

// Web stub: SMS is silently unavailable on PWA — no errors thrown
export const Sms = registerPlugin<SmsPlugin>('SmsPlugin', {
  web: () => ({
    readInbox: async () => ({ messages: [] }),
    checkPermissions: async () => ({ sms: 'denied' as PermissionState }),
    requestPermissions: async () => ({ sms: 'denied' as PermissionState }),
    addListener: async () => ({ remove: async () => {} }),
    removeAllListeners: async () => {},
  }),
});
