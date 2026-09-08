// ===== NOVA BANK DATABASE SETUP =====
// This file creates (or connects to) a SQLite database file, defines our
// tables, and seeds some demo data — similar to what data.js did with
// localStorage, but now it's real, server-side, permanent storage.

const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

// This creates a file called nova-bank.db in the server folder
// (or opens it if it already exists).
const db = new Database('nova-bank.db');

// ===== CREATE TABLES =====
// "CREATE TABLE IF NOT EXISTS" means: only create it if it doesn't
// already exist — so restarting the server doesn't wipe our data.

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    firstName TEXT NOT NULL,
    lastName TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    dob TEXT,
    address TEXT,
    password TEXT NOT NULL,
    isAdmin INTEGER NOT NULL DEFAULT 0
  );
`);
// Safely add the 'address' column if it doesn't already exist,
// without deleting any existing data.
const columns = db.prepare("PRAGMA table_info(users)").all();
const hasAddressColumn = columns.some((col) => col.name === 'address');
if (!hasAddressColumn) {
  db.exec('ALTER TABLE users ADD COLUMN address TEXT');
  console.log('Added address column to users table.');
}

db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    userId INTEGER NOT NULL,
    name TEXT NOT NULL,
    number TEXT NOT NULL,
    type TEXT NOT NULL,
    balance REAL NOT NULL,
    status TEXT NOT NULL,
    FOREIGN KEY (userId) REFERENCES users(id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    userId INTEGER NOT NULL,
    date TEXT NOT NULL,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    reference TEXT NOT NULL,
    FOREIGN KEY (userId) REFERENCES users(id)
  );
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    userId INTEGER NOT NULL,
    type TEXT NOT NULL,
    number TEXT NOT NULL,
    holder TEXT NOT NULL,
    expiry TEXT NOT NULL,
    frozen INTEGER NOT NULL DEFAULT 0,
    spendLimit REAL NOT NULL,
    FOREIGN KEY (userId) REFERENCES users(id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS savings_goals (
    id TEXT PRIMARY KEY,
    userId INTEGER NOT NULL,
    name TEXT NOT NULL,
    target REAL NOT NULL,
    saved REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (userId) REFERENCES users(id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS beneficiaries (
    id TEXT PRIMARY KEY,
    userId INTEGER NOT NULL,
    name TEXT NOT NULL,
    account TEXT NOT NULL,
    FOREIGN KEY (userId) REFERENCES users(id)
  );
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS support_tickets (
    id TEXT PRIMARY KEY,
    userId INTEGER NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Open',
    createdAt TEXT NOT NULL,
    FOREIGN KEY (userId) REFERENCES users(id)
  );
`);

// ===== SEED DEMO DATA =====
// Only insert a demo user if the users table is currently empty,
// so restarting the server doesn't create duplicates every time.

const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get();

if (userCount.count === 0) {
  const insertUser = db.prepare(`
    INSERT INTO users (firstName, lastName, email, phone, dob, password)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
const demoPassword = bcrypt.hashSync('password123', 10);
const result = insertUser.run('Ada', 'Okafor', 'demo@novabank.com', '5551234567', '1995-04-12', demoPassword);
  const demoUserId = result.lastInsertRowid;

  const insertAccount = db.prepare(`
    INSERT INTO accounts (id, userId, name, number, type, balance, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertAccount.run('current', demoUserId, 'Current Account', '0123456789', 'Current', 1275.00, 'Active');
  insertAccount.run('savings', demoUserId, 'Savings Account', '0987654321', 'Savings', 600.00, 'Active');

  const insertTransaction = db.prepare(`
    INSERT INTO transactions (id, userId, date, description, amount, type, status, reference)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertTransaction.run('tx1', demoUserId, '2026-08-29', 'Transfer to John Doe', -75.00, 'Transfer', 'Successful', 'NVB202608290001');
  insertTransaction.run('tx2', demoUserId, '2026-08-28', 'Salary Deposit', 675.00, 'Deposit', 'Successful', 'NVB202608280002');
    const insertCard = db.prepare(`
    INSERT INTO cards (id, userId, type, number, holder, expiry, frozen, spendLimit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertCard.run('virtual', demoUserId, 'Virtual', '5399 8814 2201 0093', 'Demo User', '04/28', 0, 500);
  insertCard.run('debit', demoUserId, 'Debit', '4726 3199 0021 7745', 'Demo User', '09/29', 0, 1000);

  const insertGoal = db.prepare(`
    INSERT INTO savings_goals (id, userId, name, target, saved)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertGoal.run('goal1', demoUserId, 'New Laptop', 2000, 860);
  insertGoal.run('goal2', demoUserId, 'Emergency Fund', 3000, 2040);
  insertGoal.run('goal3', demoUserId, 'Vacation', 1500, 300);

  console.log('Demo user and data seeded into the database.');
  
    // Seed one admin user for testing the Admin Dashboard.
  const adminPassword = bcrypt.hashSync('admin123', 10);
  db.prepare(`
    INSERT INTO users (firstName, lastName, email, phone, dob, password, isAdmin)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('Admin', 'User', 'admin@novabank.com', '5559999999', '1990-01-01', adminPassword, 1);
}

// Export the db connection so server.js (and future files) can use it.
module.exports = db;