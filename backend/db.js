// db.js
const sqlite3 = require('sqlite3').verbose();
let db;

function initDb() {
  db = new sqlite3.Database('./tasks.db');
  db.run(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT,
    datetime TEXT,
    created_at TEXT,
    status TEXT
  )`);
}

function saveTask(task) {
  return new Promise((resolve, reject) => {
    const q = `INSERT INTO tasks (description, datetime, created_at, status) VALUES (?, ?, ?, ?)`;
    db.run(q, [task.description, task.datetime, task.created_at, task.status], function (err) {
      if (err) return reject(err);
      resolve(this.lastID);
    });
  });
}

function listTasks() {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM tasks ORDER BY id DESC`, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

module.exports = { initDb, saveTask, listTasks };
