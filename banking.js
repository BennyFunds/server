// ===== BANKING FEATURE ROUTES =====
// Transfers, bills, cards, savings goals, and beneficiaries —
// all the features we're migrating off localStorage.

const db = require('./database');

// Fixed list of billers — not user data, so no database table needed.
const BILLERS = [
  { id: 'electricity', name: 'Electricity', icon: '⚡' },
  { id: 'airtime', name: 'Airtime', icon: '📱' },
  { id: 'data', name: 'Data', icon: '🌐' },
  { id: 'cable', name: 'Cable TV', icon: '📺' },
  { id: 'internet', name: 'Internet', icon: '📡' }
];

function generateReference() {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = Math.floor(1000 + Math.random() * 9000);
  return `NVB${datePart}${randomPart}`;
}
function transferMoney(req, res) {
  const { fromAccountId, recipientAccount, recipientName, amount, description } = req.body;
  const userId = req.userId;

  if (!fromAccountId || !recipientAccount || !recipientName || !amount || amount <= 0) {
    return res.status(400).json({ error: 'Missing or invalid transfer details.' });
  }

  if (typeof amount !== 'number' || isNaN(amount)) {
    return res.status(400).json({ error: 'Amount must be a valid number.' });
  }

  if (amount > 1000000) {
    return res.status(400).json({ error: 'Amount exceeds the maximum allowed transfer.' });
  }

  if (recipientName.length > 100 || recipientAccount.length > 50) {
    return res.status(400).json({ error: 'Recipient details are too long.' });
  }

  // ---- Look up the SENDER's account ----
  const senderAccount = db.prepare('SELECT * FROM accounts WHERE id = ? AND userId = ?').get(fromAccountId, userId);
  if (!senderAccount) {
    return res.status(404).json({ error: 'Sender account not found.' });
  }
  if (amount > senderAccount.balance) {
    return res.status(400).json({ error: 'Insufficient balance.' });
  }

  // ---- Look up the RECIPIENT's account by account NUMBER (not id) ----
  const recipientAccountRow = db.prepare('SELECT * FROM accounts WHERE number = ?').get(recipientAccount.trim());

  // Prevent sending money to your own account by accident.
  if (recipientAccountRow && recipientAccountRow.userId === userId) {
    return res.status(400).json({ error: 'You cannot transfer money to your own account.' });
  }

  const reference = generateReference();
  const txId = 'tx' + Date.now();
  const today = new Date().toISOString().slice(0, 10);

  // ---- CASE 1: Recipient account number matches a real Nova Bank account ----
  if (recipientAccountRow) {
    // Look up the recipient's actual name for accurate transaction labeling.
    const recipientUser = db.prepare('SELECT * FROM users WHERE id = ?').get(recipientAccountRow.userId);
    const recipientFullName = `${recipientUser.firstName} ${recipientUser.lastName}`;

    // Deduct from sender.
    const newSenderBalance = senderAccount.balance - amount;
    db.prepare('UPDATE accounts SET balance = ? WHERE id = ?').run(newSenderBalance, fromAccountId);

    // Credit the recipient.
    const newRecipientBalance = recipientAccountRow.balance + amount;
    db.prepare('UPDATE accounts SET balance = ? WHERE id = ?').run(newRecipientBalance, recipientAccountRow.id);

        // Transaction record for the SENDER.
    const senderDesc = description || `Transfer to ${recipientFullName}`;
    db.prepare(`
      INSERT INTO transactions (id, userId, date, description, amount, type, status, reference)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(txId, userId, today, senderDesc, -amount, 'Transfer', 'Successful', reference);

    // Get the sender's real name so the recipient sees who sent it.
    const senderUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    const senderFullName = `${senderUser.firstName} ${senderUser.lastName}`;

    // Transaction record for the RECIPIENT (a separate row, different userId).
    const recipientTxId = 'tx' + (Date.now() + 1);
    db.prepare(`
      INSERT INTO transactions (id, userId, date, description, amount, type, status, reference)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(recipientTxId, recipientAccountRow.userId, today, `Transfer from ${senderFullName}`, amount, 'Deposit', 'Successful', reference);

    return res.json({
      message: 'Transfer successful.',
      reference,
      newBalance: newSenderBalance,
      recipientFound: true
    });
  }

  // ---- CASE 2: Recipient account number does NOT match any real user ----
  // We reject it now, since this is a REAL transfer system —
  // no more "simulate sending to anyone" like before.
  return res.status(404).json({
    error: 'Recipient account number not found. Please check the account number and try again.'
  });
}

// ===== BILLS =====
function getBillers(req, res) {
  res.json(BILLERS);
}

function payBill(req, res) {
  const { billerName, meterNumber, amount } = req.body;
  const userId = req.userId;

  if (!billerName || !meterNumber || !amount || amount <= 0) {
    return res.status(400).json({ error: 'Missing or invalid bill payment details.' });
  }

  const account = db.prepare("SELECT * FROM accounts WHERE userId = ? AND type = 'Current'").get(userId);
  if (!account) {
    return res.status(404).json({ error: 'Current account not found.' });
  }
  if (amount > account.balance) {
    return res.status(400).json({ error: 'Insufficient balance.' });
  }

  const newBalance = account.balance - amount;
  db.prepare('UPDATE accounts SET balance = ? WHERE id = ?').run(newBalance, account.id);

  const reference = generateReference();
  const txId = 'tx' + Date.now();
  const today = new Date().toISOString().slice(0, 10);

  db.prepare(`
    INSERT INTO transactions (id, userId, date, description, amount, type, status, reference)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(txId, userId, today, `${billerName} Bill Payment`, -amount, 'Bills', 'Successful', reference);

  res.json({ message: 'Bill payment successful.', reference, newBalance });
}

// ===== CARDS =====
function getCards(req, res) {
  const cards = db.prepare('SELECT * FROM cards WHERE userId = ?').all(req.userId);
  res.json(cards);
}

function toggleCardFreeze(req, res) {
  const { id } = req.params;
  const card = db.prepare('SELECT * FROM cards WHERE id = ? AND userId = ?').get(id, req.userId);
  if (!card) return res.status(404).json({ error: 'Card not found.' });

  const newFrozenState = card.frozen ? 0 : 1;
  db.prepare('UPDATE cards SET frozen = ? WHERE id = ?').run(newFrozenState, id);
  res.json({ message: 'Card updated.', frozen: !!newFrozenState });
}

function setCardLimit(req, res) {
  const { id } = req.params;
  const { limit } = req.body;

  if (!limit || limit <= 0) {
    return res.status(400).json({ error: 'Invalid limit amount.' });
  }

  const card = db.prepare('SELECT * FROM cards WHERE id = ? AND userId = ?').get(id, req.userId);
  if (!card) return res.status(404).json({ error: 'Card not found.' });

  db.prepare('UPDATE cards SET spendLimit = ? WHERE id = ?').run(limit, id);
  res.json({ message: 'Spending limit updated.', spendLimit: limit });
}

// ===== SAVINGS GOALS =====
function getSavingsGoals(req, res) {
  const goals = db.prepare('SELECT * FROM savings_goals WHERE userId = ?').all(req.userId);
  res.json(goals);
}

function createSavingsGoal(req, res) {
  const { name, target } = req.body;
  if (!name || !target || target <= 0) {
    return res.status(400).json({ error: 'Please provide a valid goal name and target.' });
  }

  const id = 'goal' + Date.now();
  db.prepare(`
    INSERT INTO savings_goals (id, userId, name, target, saved)
    VALUES (?, ?, ?, ?, 0)
  `).run(id, req.userId, name, target);

  res.status(201).json({ id, name, target, saved: 0 });
}

// ===== BENEFICIARIES =====
function getBeneficiaries(req, res) {
  const beneficiaries = db.prepare('SELECT * FROM beneficiaries WHERE userId = ?').all(req.userId);
  res.json(beneficiaries);
}

function addBeneficiary(req, res) {
  const { name, account } = req.body;
  if (!name || !account) {
    return res.status(400).json({ error: 'Please provide both name and account number.' });
  }

  const id = 'ben' + Date.now();
  db.prepare('INSERT INTO beneficiaries (id, userId, name, account) VALUES (?, ?, ?, ?)').run(id, req.userId, name, account);

  res.status(201).json({ id, name, account });
}

function removeBeneficiary(req, res) {
  const { id } = req.params;
  db.prepare('DELETE FROM beneficiaries WHERE id = ? AND userId = ?').run(id, req.userId);
  res.json({ message: 'Beneficiary removed.' });
}
// ===== ADMIN STATS =====
function getAdminStats(req, res) {
  const totalCustomers = db.prepare("SELECT COUNT(*) AS count FROM users WHERE isAdmin = 0").get().count;
  const totalAccounts = db.prepare('SELECT COUNT(*) AS count FROM accounts').get().count;
  const totalTransactions = db.prepare('SELECT COUNT(*) AS count FROM transactions').get().count;
  const totalCards = db.prepare('SELECT COUNT(*) AS count FROM cards').get().count;
  const totalBalance = db.prepare('SELECT SUM(balance) AS sum FROM accounts').get().sum || 0;

  res.json({
    totalCustomers,
    totalAccounts,
    totalTransactions,
    totalCards,
    totalBalance
  });
}

function getAllTransactionsForAdmin(req, res) {
  const transactions = db.prepare(`
    SELECT transactions.*, users.firstName, users.lastName
    FROM transactions
    JOIN users ON transactions.userId = users.id
    ORDER BY transactions.date DESC
    LIMIT 50
  `).all();
  res.json(transactions);
}
// ===== SUPPORT TICKETS =====
function createSupportTicket(req, res) {
  const { subject, message } = req.body;
  const userId = req.userId;

  if (!subject || !message) {
    return res.status(400).json({ error: 'Please provide both a subject and a message.' });
  }

  if (subject.length > 150 || message.length > 2000) {
    return res.status(400).json({ error: 'Subject or message is too long.' });
  }

  const id = 'ticket' + Date.now();
  const createdAt = new Date().toISOString().slice(0, 10);

  db.prepare(`
    INSERT INTO support_tickets (id, userId, subject, message, status, createdAt)
    VALUES (?, ?, ?, ?, 'Open', ?)
  `).run(id, userId, subject, message, createdAt);

  res.status(201).json({ id, subject, message, status: 'Open', createdAt });
}

function getMySupportTickets(req, res) {
  const tickets = db.prepare('SELECT * FROM support_tickets WHERE userId = ? ORDER BY createdAt DESC').all(req.userId);
  res.json(tickets);
}
module.exports = {
  transferMoney,
  getBillers,
  payBill,
  getCards,
  toggleCardFreeze,
  setCardLimit,
  getSavingsGoals,
  createSavingsGoal,
  getBeneficiaries,
  addBeneficiary,
  removeBeneficiary,
  getAdminStats,
  getAllTransactionsForAdmin,
  createSupportTicket,
  getMySupportTickets
};