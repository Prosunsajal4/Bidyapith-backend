const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'storage.json');

function ensureDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {}
}

function load() {
  try {
    ensureDir();
    if (!fs.existsSync(DATA_FILE)) return null;
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const json = JSON.parse(raw);
    if (json && typeof json === 'object') return json;
  } catch (e) {
    console.warn('fileStore load error:', e.message);
  }
  return null;
}

let saveTimer = null;
function save(state) {
  try {
    ensureDir();
    // debounce to avoid too many writes
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), 'utf8');
        // console.log('fileStore: saved');
      } catch (e) {
        console.warn('fileStore save error:', e.message);
      }
    }, 150);
  } catch (e) {
    console.warn('fileStore schedule save error:', e.message);
  }
}

module.exports = { load, save, DATA_FILE };
