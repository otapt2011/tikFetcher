// js/view.js
import { helpers } from './helpers.js';
import { CONFIG, DEFAULT_DB_FILE_PATH, OPFS_DB_FILENAME } from './config.js';
import { loadDatabaseFromOPFS, saveDatabaseToOPFS } from './database.js';

let db = null;
let currentQueryResult = null;

// DOM references
const dropZone = document.getElementById('dropZone');
const dbFileInput = document.getElementById('dbFileInput');
const loadDefaultDbBtn = document.getElementById('loadDefaultDbBtn');
const schemaList = document.getElementById('schemaList');
const sidebarStats = document.getElementById('sidebarStats');
const statProfiles = document.getElementById('statProfiles');
const statFollowing = document.getElementById('statFollowing');
const statFriends = document.getElementById('statFriends');
const statBlocked = document.getElementById('statBlocked');
const tabButtons = document.querySelectorAll('.tab-btn');
const dashboardContent = document.getElementById('dashboardContent');
const browseInfo = document.getElementById('browseInfo');
const currentTableName = document.getElementById('currentTableName');
const currentRowCount = document.getElementById('currentRowCount');
const browseTableEl = document.getElementById('browseTable');
const sqlInput = document.getElementById('sqlInput');
const runQueryBtn = document.getElementById('runQueryBtn');
const downloadJsonBtn = document.getElementById('downloadJsonBtn');
const queryResultTable = document.getElementById('queryResultTable');
const exportModal = document.getElementById('exportModal');
const exportOverlay = document.getElementById('exportOverlay');
const closeExportModal = document.getElementById('closeExportModal');
const exportAsJson = document.getElementById('exportAsJson');
const exportAsCsv = document.getElementById('exportAsCsv');
const exportFullDb = document.getElementById('exportFullDb');
const savedQueriesList = document.getElementById('savedQueriesList');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText = document.getElementById('loadingText');
const toastContainer = document.getElementById('toastContainer');
const ownerModal = document.getElementById('ownerModal');
const ownerModalOverlay = document.getElementById('ownerModalOverlay');
const ownerSelect = document.getElementById('ownerSelect');
const ownerModalRun = document.getElementById('ownerModalRun');
const ownerModalCancel = document.getElementById('ownerModalCancel');

// ---------- Toast helper ----------
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ---------- Loading overlay helpers ----------
function showLoading(message = 'Processing…') {
  loadingText.textContent = message;
  loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
  loadingOverlay.classList.add('hidden');
}

// ---------- Tab switching ----------
tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    tabButtons.forEach(b => {
      b.classList.remove('border-pink-600', 'font-medium');
      b.classList.add('border-transparent');
    });
    btn.classList.remove('border-transparent');
    btn.classList.add('border-pink-600', 'font-medium');

    const tab = btn.dataset.tab;
    document.getElementById('tab-dashboard').classList.add('hidden');
    document.getElementById('tab-browse').classList.add('hidden');
    document.getElementById('tab-query').classList.add('hidden');
    document.getElementById(`tab-${tab}`).classList.remove('hidden');

    if (tab === 'query' && db) {
      loadSavedQueries();
    }
  });
});

// ---------- Theme toggle ----------
(function() {
  const toggleBtn = document.getElementById('themeToggle');
  if (!toggleBtn) return;
  const icon = toggleBtn.querySelector('i');
  const html = document.documentElement;
  const savedTheme = localStorage.getItem('theme') || 'dark';
  if (savedTheme === 'light') {
    html.classList.remove('dark');
    icon.classList.remove('fa-moon');
    icon.classList.add('fa-sun');
  } else {
    html.classList.add('dark');
    icon.classList.add('fa-moon');
    icon.classList.remove('fa-sun');
  }
  toggleBtn.addEventListener('click', () => {
    if (html.classList.contains('dark')) {
      html.classList.remove('dark');
      icon.classList.remove('fa-moon');
      icon.classList.add('fa-sun');
      localStorage.setItem('theme', 'light');
    } else {
      html.classList.add('dark');
      icon.classList.remove('fa-sun');
      icon.classList.add('fa-moon');
      localStorage.setItem('theme', 'dark');
    }
  });
})();

// ---------- File handling ----------
dropZone.addEventListener('click', () => dbFileInput.click());
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-active');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-active'));
dropZone.addEventListener('drop', async (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-active');
  const file = e.dataTransfer.files[0];
  if (file) await loadDatabaseFile(file);
});
dbFileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (file) await loadDatabaseFile(file);
});

loadDefaultDbBtn.addEventListener('click', async () => {
  await loadDatabaseFromPath(DEFAULT_DB_FILE_PATH);
});

// ---------- Database loading (with OPFS support) ----------
async function loadDatabaseFile(file) {
  showLoading('Loading database file…');
  try {
    const buffer = await file.arrayBuffer();
    const sqlite = await JaferSQL.jaferInit(new Uint8Array(buffer));
    db = sqlite;
    await afterDatabaseLoad();
    if (CONFIG.opfsEnabled) await saveDatabaseToOPFS(db);
    showToast('Database loaded successfully', 'success');
  } catch (err) {
    console.error('Failed to load database file:', err);
    showToast('Failed to load database: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

async function loadDatabaseFromPath(path) {
  showLoading(`Loading database from ${path}…`);
  try {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    const buffer = await response.arrayBuffer();
    const sqlite = await JaferSQL.jaferInit(new Uint8Array(buffer));
    db = sqlite;
    await afterDatabaseLoad();
    if (CONFIG.opfsEnabled) await saveDatabaseToOPFS(db);
    showToast(`Database loaded from ${path}`, 'success');
  } catch (err) {
    console.error('Failed to load database from path:', path, err);
    showToast(`Failed to load database from ${path}: ${err.message}`, 'error');
  } finally {
    hideLoading();
  }
}

async function afterDatabaseLoad() {
  await refreshSchema();
  await loadDashboard();
  sidebarStats.classList.remove('hidden');
  if (db) await loadSavedQueries();
}

// ---------- Schema refresh ----------
async function refreshSchema() {
  if (!db) return;
  const tables = db.jaferTables();
  const views = db.jaferAll("SELECT name FROM sqlite_master WHERE type='view'");
  const viewNames = views.map(v => v.name);
  const allItems = [...tables, ...viewNames].sort();

  schemaList.innerHTML = allItems.map(name => `
    <li class="cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 px-2 py-1 rounded flex items-center gap-1"
        data-name="${helpers.escapeHtml(name)}">
      <i class="fa-solid ${viewNames.includes(name) ? 'fa-eye' : 'fa-table'} text-gray-400 w-4"></i>
      <span>${helpers.escapeHtml(name)}</span>
    </li>
  `).join('');

  schemaList.querySelectorAll('li').forEach(li => {
    li.addEventListener('click', () => {
      const name = li.dataset.name;
      document.querySelector('.tab-btn[data-tab="browse"]').click();
      browseTable(name);
    });
  });

  try {
    const stats = db.jaferAll('SELECT * FROM vw_owner_stats LIMIT 1');
    if (stats.length > 0) {
      const s = stats[0];
      statProfiles.textContent = s.total_profiles;
      statFollowing.textContent = s.following_count;
      statFriends.textContent = s.friend_count;
      statBlocked.textContent = s.blocked_count;
    }
  } catch (e) {
    console.warn('vw_owner_stats not available, using manual counts');
    const total = db.jaferAll('SELECT COUNT(*) AS cnt FROM profiles');
    statProfiles.textContent = total[0]?.cnt || 0;
    const following = db.jaferAll('SELECT COUNT(*) AS cnt FROM profiles WHERE is_following=1');
    statFollowing.textContent = following[0]?.cnt || 0;
    const friends = db.jaferAll('SELECT COUNT(*) AS cnt FROM profiles WHERE is_following=1 AND is_follower=1');
    statFriends.textContent = friends[0]?.cnt || 0;
    const blocked = db.jaferAll('SELECT COUNT(*) AS cnt FROM profiles WHERE is_blocked=1');
    statBlocked.textContent = blocked[0]?.cnt || 0;
  }
}

// ---------- Browse table ----------
async function browseTable(name) {
  if (!db) return;
  showLoading(`Loading table "${name}"…`);
  try {
    currentTableName.textContent = name;
    const rows = db.jaferAll(`SELECT * FROM "${name}" LIMIT 500`);
    currentRowCount.textContent = rows.length;
    renderTable(browseTableEl, rows);
  } catch (err) {
    console.error('Error browsing table:', name, err);
    showToast('Error browsing table: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

// ---------- Render table helper ----------
function renderTable(tableElement, rows) {
  const thead = tableElement.querySelector('thead');
  const tbody = tableElement.querySelector('tbody');
  if (!rows || rows.length === 0) {
    thead.innerHTML = '';
    tbody.innerHTML = '<tr><td colspan="10" class="text-center p-4 text-gray-500">No data</td></tr>';
    return;
  }
  const columns = Object.keys(rows[0]);
  thead.innerHTML = `<tr>${columns.map(col => `<th class="p-1 text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">${helpers.escapeHtml(col)}</th>`).join('')}</tr>`;
  tbody.innerHTML = rows.map(row => `
    <tr class="hover:bg-gray-100 dark:hover:bg-gray-800">
      ${columns.map(col => `<td class="p-1 truncate border-b border-gray-100 dark:border-gray-700">${helpers.escapeHtml(row[col] == null ? '' : String(row[col]))}</td>`).join('')}
    </tr>
  `).join('');
}

// ---------- Dashboard ----------
async function loadDashboard() {
  if (!db) return;
  try {
    const stats = db.jaferAll('SELECT * FROM vw_owner_stats LIMIT 1');
    const owners = db.jaferAll('SELECT * FROM userJson');
    dashboardContent.innerHTML = `
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-white dark:bg-gray-800 shadow rounded-lg p-4 text-center">
          <div class="text-2xl font-bold text-pink-600">${stats[0]?.total_profiles || 0}</div>
          <div class="text-xs text-gray-500">Total Profiles</div>
        </div>
        <div class="bg-white dark:bg-gray-800 shadow rounded-lg p-4 text-center">
          <div class="text-2xl font-bold text-blue-600">${stats[0]?.following_count || 0}</div>
          <div class="text-xs text-gray-500">Following</div>
        </div>
        <div class="bg-white dark:bg-gray-800 shadow rounded-lg p-4 text-center">
          <div class="text-2xl font-bold text-green-600">${stats[0]?.friend_count || 0}</div>
          <div class="text-xs text-gray-500">Friends</div>
        </div>
        <div class="bg-white dark:bg-gray-800 shadow rounded-lg p-4 text-center">
          <div class="text-2xl font-bold text-red-600">${stats[0]?.blocked_count || 0}</div>
          <div class="text-xs text-gray-500">Blocked</div>
        </div>
      </div>
      ${owners.length ? `
        <h3 class="text-sm font-semibold mb-2">Owners</h3>
        <div class="overflow-y-auto max-h-64">
          ${owners.map(o => `<div class="bg-white dark:bg-gray-800 p-2 rounded mb-1 text-xs">@${helpers.escapeHtml(o.userName)} – ${helpers.escapeHtml(o.displayName || '')}</div>`).join('')}
        </div>
      ` : ''}
      <div class="mt-4 text-xs text-gray-500">
        Loaded database with ${stats[0]?.total_profiles || 0} profiles.
      </div>
    `;
  } catch (e) {
    console.error('Error loading dashboard:', e);
    dashboardContent.innerHTML = '<div class="text-red-500">Error loading dashboard: ' + e.message + '</div>';
    showToast('Error loading dashboard', 'error');
  }
}

// ---------- Saved Queries ----------
async function loadSavedQueries() {
  if (!db) return;
  try {
    const queries = db.jaferAll('SELECT id, name, sql_text FROM saved_queries ORDER BY id');
    if (!queries.length) {
      savedQueriesList.innerHTML = '<li class="p-1 text-gray-500 italic">No saved queries found.</li>';
      return;
    }
    savedQueriesList.innerHTML = queries.map(q => `
      <li class="p-1 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between"
          data-sql="${helpers.escapeHtml(q.sql_text)}">
        <span class="truncate">${helpers.escapeHtml(q.name)}</span>
        <i class="fa-solid fa-play text-pink-500 ml-2 text-xs"></i>
      </li>
    `).join('');

    savedQueriesList.querySelectorAll('li[data-sql]').forEach(li => {
      li.addEventListener('click', () => {
        const sql = li.dataset.sql;
        sqlInput.value = sql;
      });
    });
  } catch (e) {
    console.error('Error loading saved queries:', e);
    savedQueriesList.innerHTML = `<li class="p-1 text-red-500">Error: ${e.message}</li>`;
  }
}

// ---------- Query execution with placeholder handling and LIMIT safety ----------
async function executeQuery(sql, params = []) {
  showLoading('Running query…');
  try {
    let finalSql = sql;
    const hasLimit = /\bLIMIT\s+\d+/i.test(sql);
    if (!hasLimit && !sql.toLowerCase().includes('limit')) {
      finalSql = sql + ' LIMIT 1000';
      showToast('No LIMIT clause found, automatically added LIMIT 1000', 'info');
    }
    const stmt = db._db.prepare(finalSql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    currentQueryResult = rows;
    renderTable(queryResultTable, rows);
    if (rows.length === 1000 && !hasLimit) {
      showToast('Only first 1000 rows shown. Add LIMIT to see more.', 'info');
    }
  } catch (err) {
    console.error('Query error:', err);
    showToast('Query error: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

runQueryBtn.addEventListener('click', () => {
  if (!db) {
    showToast('No database loaded', 'error');
    return;
  }
  const sql = sqlInput.value.trim();
  if (!sql) return;

  const placeholderCount = (sql.match(/\?/g) || []).length;
  if (placeholderCount === 0) {
    executeQuery(sql, []);
    return;
  }
  if (placeholderCount > 1) {
    showToast('Multiple ? placeholders not supported – please edit query to use one ?', 'error');
    return;
  }

  const owners = db.jaferAll('SELECT userName FROM userJson ORDER BY userName');
  if (owners.length === 0) {
    showToast('No owners found. Replace ? manually.', 'error');
    return;
  }
  ownerSelect.innerHTML = owners.map(o => `<option value="${helpers.escapeHtml(o.userName)}">@${helpers.escapeHtml(o.userName)}</option>`).join('');
  ownerModal.classList.remove('hidden');
});

ownerModalRun.addEventListener('click', () => {
  const selectedOwner = ownerSelect.value;
  if (!selectedOwner) return;
  ownerModal.classList.add('hidden');
  let sql = sqlInput.value.trim();
  sql = sql.replace(/\?/g, `'${selectedOwner.replace(/'/g, "''")}'`);
  executeQuery(sql, []);
});

ownerModalCancel.addEventListener('click', () => ownerModal.classList.add('hidden'));
ownerModalOverlay.addEventListener('click', () => ownerModal.classList.add('hidden'));

// ---------- Export modal ----------
downloadJsonBtn.addEventListener('click', () => {
  if (!currentQueryResult || currentQueryResult.length === 0) {
    showToast('No data to export. Run a query first.', 'error');
    return;
  }
  exportModal.classList.remove('hidden');
});

closeExportModal.addEventListener('click', () => exportModal.classList.add('hidden'));
exportOverlay.addEventListener('click', () => exportModal.classList.add('hidden'));

exportAsJson.addEventListener('click', () => {
  if (!currentQueryResult || currentQueryResult.length === 0) {
    showToast('No data to export', 'error');
    return;
  }
  const cleaned = currentQueryResult.map(row => {
    const { avatar, ...rest } = row;
    return rest;
  });
  downloadBlob(JSON.stringify(cleaned, null, 2), 'query_result.json', 'application/json');
  exportModal.classList.add('hidden');
});

exportAsCsv.addEventListener('click', () => {
  if (!currentQueryResult || currentQueryResult.length === 0) {
    showToast('No data to export', 'error');
    return;
  }
  const cleaned = currentQueryResult.map(row => {
    const { avatar, ...rest } = row;
    return rest;
  });
  const columns = Object.keys(cleaned[0]);
  const csvRows = [columns.join(',')];
  cleaned.forEach(row => {
    csvRows.push(columns.map(col => {
      let val = row[col];
      if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
        val = '"' + val.replace(/"/g, '""') + '"';
      }
      return val;
    }).join(','));
  });
  downloadBlob(csvRows.join('\n'), 'query_result.csv', 'text/csv');
  exportModal.classList.add('hidden');
});

exportFullDb.addEventListener('click', () => {
  if (!db) {
    showToast('No database loaded', 'error');
    return;
  }
  const data = db.jaferExport();
  downloadBlob(data, OPFS_DB_FILENAME, 'application/octet-stream');
  exportModal.classList.add('hidden');
});

function downloadBlob(data, filename, mimeType) {
  const blob = new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------- Initial load ----------
async function initViewer() {
  let dbBuffer = null;
  if (CONFIG.opfsEnabled) {
    dbBuffer = await loadDatabaseFromOPFS();
    if (dbBuffer) console.log('Loaded database from OPFS');
  }
  if (!dbBuffer && DEFAULT_DB_FILE_PATH) {
    try {
      const response = await fetch(DEFAULT_DB_FILE_PATH);
      if (response.ok) {
        const buffer = await response.arrayBuffer();
        dbBuffer = new Uint8Array(buffer);
      }
    } catch (err) {
      console.warn('Could not load default DB:', err);
    }
  }
  if (dbBuffer) {
    db = await JaferSQL.jaferInit(dbBuffer);
  } else {
    db = await JaferSQL.jaferInit();
  }
  await afterDatabaseLoad();
}

initViewer();