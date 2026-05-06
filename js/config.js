// js/config.js
export const DEFAULT_HIDDEN_COLS = ['username', 'followingCount', 'follower_date', 'friendship'];
export const DEFAULT_DB_FILE_PATH = '/assets/proxyDB/TikTokProfile.db';

// OPFS persistence
export const OPFS_DB_FILENAME = 'TikTokProfile.db';
export const DEFAULT_OPFS_ENABLED = false;

// Live table rendering toggle
export const DEFAULT_LIVE_TABLE_RENDERING = true;

export const CONFIG = {
  apiBaseUrl: 'https://tik-proxy.vercel.app',
  concurrency: parseInt(localStorage.getItem('concurrency')) || 8,
  timeout: parseInt(localStorage.getItem('fetchTimeout')) || 15000,
  fetchAvatarBlobs: localStorage.getItem('fetchAvatarBlobs') === 'true' || false,
  dbFilePath: localStorage.getItem('dbFilePath') || DEFAULT_DB_FILE_PATH,
  opfsEnabled: localStorage.getItem('opfsEnabled') === 'true' || DEFAULT_OPFS_ENABLED,
  liveTableRendering: localStorage.getItem('liveTableRendering') !== 'false' // default true
};