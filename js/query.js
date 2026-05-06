// js/query.js
import { CONFIG, DEFAULT_DB_FILE_PATH, OPFS_DB_FILENAME } from './config.js';
import { loadDatabaseFromOPFS, saveDatabaseToOPFS } from './database.js';
import { helpers } from './helpers.js';

let db = null;
let currentDbSource = 'none';

// Toast helper
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'error' : ''}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Update status indicator
function updateDbStatusIndicator() {
  const indicator = document.getElementById('dbSourceIndicator');
  const textEl = document.getElementById('dbSourceText');
  if (!indicator || !textEl) return;
  switch (currentDbSource) {
    case 'opfs':
      indicator.className = 'inline-block w-2 h-2 rounded-full bg-green-500';
      textEl.textContent = 'DB loaded from OPFS';
      break;
    case 'default':
      indicator.className = 'inline-block w-2 h-2 rounded-full bg-blue-500';
      textEl.textContent = `DB loaded from default path`;
      break;
    case 'upload':
      indicator.className = 'inline-block w-2 h-2 rounded-full bg-purple-500';
      textEl.textContent = 'DB loaded from uploaded file';
      break;
    case 'new':
      indicator.className = 'inline-block w-2 h-2 rounded-full bg-yellow-500';
      textEl.textContent = 'New empty db (in-memory)';
      break;
    default:
      indicator.className = 'inline-block w-2 h-2 rounded-full bg-gray-400';
      textEl.textContent = 'No db loaded';
  }
}

// Load and render column names from profiles table into #fields
async function loadColumnNames() {
  const fieldsContainer = document.getElementById('fields');
  if (!fieldsContainer) return;
  if (!db) {
    fieldsContainer.innerHTML = '<div class="text-xs text-gray-500 p-2">No DB</div>';
    return;
  }
  try {
    // Get column names from profiles table using PRAGMA table_info
    const columns = db.jaferAll("PRAGMA table_info(profiles)");
    if (!columns.length) {
      fieldsContainer.innerHTML = '<div class="text-xs text-gray-500 p-2">No columns found</div>';
      return;
    }
    // Render as clickable list
    fieldsContainer.innerHTML = `
      <div class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-2 pt-2 pb-1">Profiles Columns</div>
      <div class="flex flex-col gap-1">
        ${columns.map(col => `
          <div class="column-item cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 px-2 py-1 rounded text-xs transition flex items-center gap-1 truncate"
               data-column="${helpers.escapeHtml(col.name)}">
            <i class="fa-solid fa-columns text-gray-400 w-3"></i>
            <span class="truncate">${helpers.escapeHtml(col.name)}</span>
          </div>
        `).join('')}
      </div>
    `;
    // Add click handlers for copying
    fieldsContainer.querySelectorAll('.column-item').forEach(el => {
      el.addEventListener('click', async () => {
        const colName = el.dataset.column;
        try {
          await navigator.clipboard.writeText(colName);
          showToast(`Copied "${colName}" to clipboard`, 'success');
        } catch (err) {
          showToast('Failed to copy: ' + err.message, 'error');
        }
      });
    });
  } catch (err) {
    console.error('Error loading column names:', err);
    fieldsContainer.innerHTML = '<div class="text-xs text-red-500 p-2">Error loading columns</div>';
  }
}

// Load and render saved queries
async function loadQueries() {
  if (!db) {
    document.getElementById('queriesList').innerHTML = '<p class="text-gray-500 italic">No db loaded.</p>';
    return;
  }
  try {
    const rows = db.jaferAll('SELECT id, name, sql_text FROM saved_queries ORDER BY name');
    const container = document.getElementById('queriesList');
    if (!rows.length) {
      container.innerHTML = '<p class="text-gray-500 italic">No saved queries. Create one above.</p>';
      return;
    }
    container.innerHTML = rows.map(q => `
      <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-3 flex justify-between items-start">
        <div class="flex-1">
          <div class="font-medium">${helpers.escapeHtml(q.name)}</div>
          <pre class="text-xs text-gray-500 dark:text-gray-400 mt-1 overflow-x-auto query-sql">${helpers.escapeHtml(q.sql_text)}</pre>
        </div>
        <div class="flex gap-2 ml-2">
          <button class="edit-query text-blue-500" data-id="${q.id}" data-name="${helpers.escapeHtml(q.name)}" data-sql="${helpers.escapeHtml(q.sql_text)}"><i class="fa-solid fa-edit"></i></button>
          <button class="delete-query text-red-500" data-id="${q.id}"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
    `).join('');
    
    document.querySelectorAll('.edit-query').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('editId').value = btn.dataset.id;
        document.getElementById('queryName').value = btn.dataset.name;
        document.getElementById('querySql').value = btn.dataset.sql;
        document.getElementById('cancelEditBtn').classList.remove('hidden');
      });
    });
    document.querySelectorAll('.delete-query').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('Delete this query?')) {
          db.jaferRun('DELETE FROM saved_queries WHERE id = ?', [btn.dataset.id]);
          await saveCurrentDbToSource();
          await loadQueries();
          showToast('Query deleted');
        }
      });
    });
  } catch (err) {
    console.error('Error loading queries:', err);
    document.getElementById('queriesList').innerHTML = `<p class="text-red-500">Error: ${err.message}</p>`;
  }
}

// Persist changes to OPFS (if enabled) or just keep in memory
async function saveCurrentDbToSource() {
  if (!db) return;
  if (CONFIG.opfsEnabled && (currentDbSource === 'opfs' || currentDbSource === 'upload' || currentDbSource === 'default' || currentDbSource === 'new')) {
    await saveDatabaseToOPFS(db);
    showToast('Changes saved to OPFS', 'success');
  } else if (!CONFIG.opfsEnabled) {
    showToast('Changes saved in memory (OPFS disabled). Use Download DB to persist.', 'info');
  }
}

// Initialize DB from buffer and set source
async function initDatabaseFromBuffer(buffer, source) {
  if (buffer) {
    db = await JaferSQL.jaferInit(buffer);
  } else {
    db = await JaferSQL.jaferInit();
  }
  currentDbSource = source;
  updateDbStatusIndicator();
  await loadColumnNames(); // <-- load column names after DB ready
  await loadQueries();
  showToast(`Database loaded (${source})`, 'success');
}

// Load from OPFS
async function loadFromOPFS() {
  if (!CONFIG.opfsEnabled) return false;
  const buffer = await loadDatabaseFromOPFS();
  if (buffer) {
    await initDatabaseFromBuffer(buffer, 'opfs');
    return true;
  }
  return false;
}

// Load from default path
async function loadFromDefaultPath() {
  try {
    const response = await fetch(DEFAULT_DB_FILE_PATH);
    if (!response.ok) throw new Error('Not found');
    const buffer = await response.arrayBuffer();
    await initDatabaseFromBuffer(new Uint8Array(buffer), 'default');
    return true;
  } catch (err) {
    console.warn('Default DB not available:', err);
    return false;
  }
}

// Main init: OPFS → default → new
async function initDB() {
  let loaded = false;
  if (CONFIG.opfsEnabled) {
    loaded = await loadFromOPFS();
  }
  if (!loaded) {
    loaded = await loadFromDefaultPath();
  }
  if (!loaded) {
    await initDatabaseFromBuffer(null, 'new');
  }
}

// Upload database file
document.getElementById('uploadDbBtn').addEventListener('click', () => {
  document.getElementById('dbFileInput').click();
});
document.getElementById('dbFileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const buffer = await file.arrayBuffer();
    await initDatabaseFromBuffer(new Uint8Array(buffer), 'upload');
    if (CONFIG.opfsEnabled) {
      await saveDatabaseToOPFS(db);
      showToast('Uploaded database also saved to OPFS', 'success');
    }
  } catch (err) {
    showToast('Failed to load uploaded DB: ' + err.message, 'error');
  }
  e.target.value = '';
});

// Download current database
document.getElementById('downloadDbBtn').addEventListener('click', () => {
  if (!db) {
    showToast('No database loaded', 'error');
    return;
  }
  const buffer = db.jaferExport();
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = OPFS_DB_FILENAME;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Database downloaded', 'success');
});

// Save (add/edit) query
document.getElementById('saveQueryBtn').addEventListener('click', async () => {
  if (!db) {
    showToast('No database loaded', 'error');
    return;
  }
  const id = document.getElementById('editId').value;
  const name = document.getElementById('queryName').value.trim();
  const sql = document.getElementById('querySql').value.trim();
  if (!name || !sql) {
    showToast('Please fill both fields', 'error');
    return;
  }
  try {
    if (id) {
      db.jaferRun('UPDATE saved_queries SET name = ?, sql_text = ? WHERE id = ?', [name, sql, id]);
      showToast('Query updated');
    } else {
      db.jaferRun('INSERT INTO saved_queries (owner_username, name, sql_text) VALUES (?, ?, ?)', [null, name, sql]);
      showToast('Query saved');
    }
    await saveCurrentDbToSource();
    await loadQueries();
    document.getElementById('editId').value = '';
    document.getElementById('queryName').value = '';
    document.getElementById('querySql').value = '';
    document.getElementById('cancelEditBtn').classList.add('hidden');
  } catch (err) {
    showToast('Error saving query: ' + err.message, 'error');
  }
});

document.getElementById('cancelEditBtn').addEventListener('click', () => {
  document.getElementById('editId').value = '';
  document.getElementById('queryName').value = '';
  document.getElementById('querySql').value = '';
  document.getElementById('cancelEditBtn').classList.add('hidden');
});

initDB();