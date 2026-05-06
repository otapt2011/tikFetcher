import { loadExistingDB, updateStatusDisplay } from './database.js';
import { setupEventListeners, updateOPFSIndicator } from './events.js';
import { renderTable, updateButtons } from './renderer.js';

(async () => {
  await loadExistingDB();
  updateOPFSIndicator();
  updateStatusDisplay();
  setupEventListeners();
  renderTable();
  updateButtons();
})();