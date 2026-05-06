// js/downloads.js
import { state } from './state.js';
import { OPFS_DB_FILENAME } from './config.js';

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadProfilesJSON() {
  if (!state.profileData.length) return;
  try {
    const cleanData = state.profileData.map(({ avatar, avatarObjectURL, ...rest }) => rest);
    const blob = new Blob([JSON.stringify(cleanData, null, 2)], { type: 'application/json' });
    downloadBlob(blob, 'tiktok_profiles.json');
  } catch (err) {
    console.error('Failed to export profiles JSON:', err);
    alert('Export failed: ' + err.message);
  }
}

export function downloadFollowingJSON() {
  if (!state.followingList.length) return;
  try {
    const blob = new Blob([JSON.stringify(state.followingList, null, 2)], { type: 'application/json' });
    downloadBlob(blob, 'tiktok_following.json');
  } catch (err) {
    console.error('Failed to export following JSON:', err);
    alert('Export failed: ' + err.message);
  }
}

export async function downloadSQLiteDB() {
  if (!state.sqliteReady || !state.sqliteDB) return;
  try {
    const buffer = state.sqliteDB.jaferExport();
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    downloadBlob(blob, OPFS_DB_FILENAME); // <-- uses constant from config
  } catch (err) {
    console.error('Failed to export SQLite DB:', err);
    alert('Export failed: ' + err.message);
  }
}