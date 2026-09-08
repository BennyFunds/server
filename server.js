require('dotenv').config();
// ===== NOVA BANK BACKEND SERVER =====
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const db = require('./database');
const { registerUser, loginUser, requireAuth, requireAdmin, getProfile, updateProfile } = require('./auth');
const banking = require('./banking');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

// ===== TEST ROUTE =====
app.get('/api/ping', (req, res) => {
  res.json({ message: 'Nova Bank server is running!' });
});

// Limit login/register attempts to 10 per 15 minutes per IP address,
// to slow down brute-force password guessing.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' }
});

app.post('/api/register', authLimiter, registerUser);
app.post('/api/login', authLimiter, loginUser);
// ===== ACCOUNT & TRANSACTION ROUTES =====
app.get('/api/accounts', requireAuth, (req, res) => {
  const accounts = db.prepare('SELECT * FROM accounts WHERE userId = ?').all(req.userId);
  res.json(accounts);
});

app.get('/api/transactions', requireAuth, (req, res) => {
  const transactions = db.prepare('SELECT * FROM transactions WHERE userId = ? ORDER BY date DESC').all(req.userId);
  res.json(transactions);
});

// ===== TRANSFER =====
app.post('/api/transfer', requireAuth, banking.transferMoney);

// ===== BILLS =====
app.get('/api/billers', requireAuth, banking.getBillers);
app.post('/api/bills/pay', requireAuth, banking.payBill);

// ===== CARDS =====
app.get('/api/cards', requireAuth, banking.getCards);
app.patch('/api/cards/:id/freeze', requireAuth, banking.toggleCardFreeze);
app.patch('/api/cards/:id/limit', requireAuth, banking.setCardLimit);

// ===== SAVINGS GOALS =====
app.get('/api/savings', requireAuth, banking.getSavingsGoals);
app.post('/api/savings', requireAuth, banking.createSavingsGoal);

// ===== BENEFICIARIES =====
app.get('/api/beneficiaries', requireAuth, banking.getBeneficiaries);
app.post('/api/beneficiaries', requireAuth, banking.addBeneficiary);
app.delete('/api/beneficiaries/:id', requireAuth, banking.removeBeneficiary);

// ===== ADMIN ROUTES (require both login AND admin privileges) =====
app.get('/api/admin/stats', requireAuth, requireAdmin, banking.getAdminStats);
app.get('/api/admin/transactions', requireAuth, requireAdmin, banking.getAllTransactionsForAdmin);

// ===== PROFILE =====
app.get('/api/profile', requireAuth, getProfile);
app.put('/api/profile', requireAuth, updateProfile);
// ===== SUPPORT =====
app.post('/api/support', requireAuth, banking.createSupportTicket);
app.get('/api/support', requireAuth, banking.getMySupportTickets);

app.listen(PORT, () => {
  console.log(`Nova Bank server running at http://localhost:${PORT}`);
});