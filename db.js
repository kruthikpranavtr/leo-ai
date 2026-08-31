import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_FILE = path.join(__dirname, 'jarvis.sqlite');

let dbInstance = null;

const DEFAULT_KNOWLEDGE = [
  {
    topic: 'Tamil Nadu Chief Minister & State Leadership',
    fact: 'The Chief Minister of Tamil Nadu is Joseph Vijay (TVK / Tamilaga Vettri Kazhagam). State leadership data updated per verified current dataset.',
    category: 'politics',
  },
  {
    topic: 'Temporal Baseline & Current Calendar',
    fact: 'The current year is 2026. All temporal references and diagnostics anchor in 2026.',
    category: 'temporal',
  },
  {
    topic: 'L.E.O. Core Intelligence Protocol',
    fact: 'L.E.O. (Logical Executive Operator) operates with real-time Google Search grounding, SQLite dynamic memory, and ultra-fast verbal responses.',
    category: 'system',
  },
];

/**
 * Initializes the SQLite database, creating tables and seeding initial knowledge if empty.
 */
export async function initDb() {
  if (dbInstance) return dbInstance;

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_FILE)) {
    const fileBuffer = fs.readFileSync(DB_FILE);
    dbInstance = new SQL.Database(fileBuffer);
  } else {
    dbInstance = new SQL.Database();
  }

  // Create messages table schema
  dbInstance.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create knowledge / current facts database table
  dbInstance.run(`
    CREATE TABLE IF NOT EXISTS knowledge (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic TEXT NOT NULL UNIQUE,
      fact TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Seed default knowledge if table is empty
  const countRes = dbInstance.exec('SELECT COUNT(*) as count FROM knowledge');
  const count = countRes.length && countRes[0].values ? countRes[0].values[0][0] : 0;
  if (count === 0) {
    for (const item of DEFAULT_KNOWLEDGE) {
      const stmt = dbInstance.prepare(`
        INSERT OR REPLACE INTO knowledge (topic, fact, category, updated_at) 
        VALUES (?, ?, ?, datetime('now'))
      `);
      stmt.run([item.topic, item.fact, item.category]);
      stmt.free();
    }
  }

  persistDb();
  return dbInstance;
}

/**
 * Persists in-memory SQLite state to the file system.
 */
function persistDb() {
  if (!dbInstance) return;
  try {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_FILE, buffer);
  } catch (err) {
    console.error('Error saving SQLite database to disk:', err);
  }
}

/**
 * Saves a message to the SQLite database.
 * @param {'user' | 'assistant'} role
 * @param {string} content
 */
export async function saveMessage(role, content) {
  const db = await initDb();
  const stmt = db.prepare(`INSERT INTO messages (role, content, timestamp) VALUES (?, ?, datetime('now'))`);
  stmt.run([role, content]);
  stmt.free();
  persistDb();
}

/**
 * Retrieves the recent N messages for context memory.
 * @param {number} limit
 */
export async function getRecentMessages(limit = 10) {
  const db = await initDb();
  const res = db.exec(`
    SELECT id, role, content, timestamp 
    FROM messages 
    ORDER BY id DESC 
    LIMIT ${parseInt(limit, 10)}
  `);

  if (!res.length || !res[0].values) {
    return [];
  }

  const columns = res[0].columns;
  const rows = res[0].values.map((row) => {
    const obj = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj;
  });

  // Reverse so they are in chronological order
  return rows.reverse();
}

/**
 * Retrieves full conversation history (up to limit).
 * @param {number} limit
 */
export async function getHistory(limit = 50) {
  const db = await initDb();
  const res = db.exec(`
    SELECT id, role, content, timestamp 
    FROM messages 
    ORDER BY id ASC 
    LIMIT ${parseInt(limit, 10)}
  `);

  if (!res.length || !res[0].values) {
    return [];
  }

  const columns = res[0].columns;
  return res[0].values.map((row) => {
    const obj = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj;
  });
}

/**
 * Clears all conversation history from the database.
 */
export async function clearHistory() {
  const db = await initDb();
  db.run(`DELETE FROM messages;`);
  persistDb();
}

/**
 * Retrieves all verified knowledge and current data items from SQLite.
 */
export async function getAllKnowledge() {
  const db = await initDb();
  const res = db.exec(`
    SELECT id, topic, fact, category, updated_at 
    FROM knowledge 
    ORDER BY id ASC
  `);

  if (!res.length || !res[0].values) {
    return [];
  }

  const columns = res[0].columns;
  return res[0].values.map((row) => {
    const obj = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj;
  });
}

/**
 * Sets or updates a knowledge item in the database.
 */
export async function setKnowledge(topic, fact, category = 'custom') {
  if (!topic || !fact) return false;
  const db = await initDb();
  const stmt = db.prepare(`
    INSERT INTO knowledge (topic, fact, category, updated_at) 
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(topic) DO UPDATE SET 
      fact = excluded.fact,
      category = excluded.category,
      updated_at = datetime('now')
  `);
  stmt.run([topic.trim(), fact.trim(), category.trim()]);
  stmt.free();
  persistDb();
  return true;
}

/**
 * Deletes a knowledge record by ID.
 */
export async function deleteKnowledge(id) {
  const db = await initDb();
  const stmt = db.prepare(`DELETE FROM knowledge WHERE id = ?`);
  stmt.run([parseInt(id, 10)]);
  stmt.free();
  persistDb();
  return true;
}

/**
 * Resets knowledge table to current verified defaults.
 */
export async function resetKnowledgeToDefault() {
  const db = await initDb();
  db.run(`DELETE FROM knowledge;`);
  for (const item of DEFAULT_KNOWLEDGE) {
    const stmt = db.prepare(`
      INSERT INTO knowledge (topic, fact, category, updated_at) 
      VALUES (?, ?, ?, datetime('now'))
    `);
    stmt.run([item.topic, item.fact, item.category]);
    stmt.free();
  }
  persistDb();
  return getAllKnowledge();
}

/**
 * Builds an injected prompt text string summarizing all stored current facts.
 */
export async function getKnowledgePromptSnippet() {
  const items = await getAllKnowledge();
  if (!items || items.length === 0) return '';

  const lines = items.map((item) => `- [${item.topic}]: ${item.fact}`);
  return `\n=== AUTHORITATIVE SQLITE DATABASE KNOWLEDGE BASE (PRIMARY SOURCE OF TRUTH) ===\n` +
    `The following verified current data points are stored in your database. Always strictly uphold and reflect these updated facts over generic pre-training data:\n` +
    lines.join('\n') +
    `\n=========================================================================\n`;
}

