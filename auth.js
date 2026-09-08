// ===== AUTHENTICATION LOGIC =====
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./database');

// In a real production app, this secret would be a long random string
// stored as an environment variable, never written in code. For this
// learning project, a hardcoded string is fine.
const JWT_SECRET = process.env.JWT_SECRET;

// ===== REGISTER =====
function registerUser(req, res) {
  const { firstName, lastName, email, phone, dob, password } = req.body;

  if (!firstName || !lastName || !email || !password) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  // Validate email format on the backend too — never trust the frontend alone.
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    return res.status(400).json({ error: 'Please provide a valid email address.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  if (firstName.length > 50 || lastName.length > 50) {
    return res.status(400).json({ error: 'Name fields are too long.' });
  }

  // Check if this email is already registered.
  const normalizedEmail = email.trim().toLowerCase();
  const existingUser = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);
  if (existingUser) {
    return res.status(400).json({ error: 'An account with this email already exists.' });
  }

  // Hash the password before storing it. The "10" is the "salt rounds" —
  // a higher number is more secure but slower. 10 is a common default.
  const hashedPassword = bcrypt.hashSync(password, 10);

  const insertUser = db.prepare(`
    INSERT INTO users (firstName, lastName, email, phone, dob, password)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
    const result = insertUser.run(firstName, lastName, normalizedEmail, phone, dob, hashedPassword);
  const newUserId = result.lastInsertRowid;

  // Automatically create a starting Current + Savings account for the new user,
  // just like our seeded demo user, but starting at $0.
  const insertAccount = db.prepare(`
    INSERT INTO accounts (id, userId, name, number, type, balance, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const randomAccountNumber = () => Math.floor(1000000000 + Math.random() * 9000000000).toString();

  insertAccount.run(`current-${newUserId}`, newUserId, 'Current Account', randomAccountNumber(), 'Current', 0, 'Active');
  insertAccount.run(`savings-${newUserId}`, newUserId, 'Savings Account', randomAccountNumber(), 'Savings', 0, 'Active');

  res.status(201).json({ message: 'Account created successfully.' });
}

// ===== LOGIN =====
function loginUser(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

    const normalizedEmail = email.trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  // Compare the plain password the user typed against the stored hash.
  // bcrypt handles this comparison safely — we never "un-hash" anything.
  const passwordMatches = bcrypt.compareSync(password, user.password);
  if (!passwordMatches) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  // Create a signed token containing the user's ID.
  // This expires in 24 hours for security.
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' });

    res.json({
    token,
    user: { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email, isAdmin: !!user.isAdmin }
  });
}

// ===== MIDDLEWARE: verify a token on protected routes =====
// "Middleware" is a function that runs BEFORE a route's main logic,
// usually to check something (like "is this request allowed?").
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization; // expected format: "Bearer <token>"

  if (!authHeader) {
    return res.status(401).json({ error: 'No token provided.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId; // attach the logged-in user's ID to the request
    next(); // move on to the actual route handler
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}
// ===== MIDDLEWARE: verify the logged-in user is an admin =====
function requireAdmin(req, res, next) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);

  if (!user || !user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required.' });
  }

  next();
}
// ===== GET PROFILE =====
function getProfile(req, res) {
  const user = db.prepare('SELECT id, firstName, lastName, email, phone, dob, address, isAdmin FROM users WHERE id = ?').get(req.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }
  res.json(user);
}

// ===== UPDATE PROFILE =====
function updateProfile(req, res) {
  const { firstName, lastName, phone, dob, address } = req.body;

  if (!firstName || !lastName) {
    return res.status(400).json({ error: 'First and last name are required.' });
  }

  if (firstName.length > 50 || lastName.length > 50) {
    return res.status(400).json({ error: 'Name fields are too long.' });
  }

  db.prepare(`
    UPDATE users SET firstName = ?, lastName = ?, phone = ?, dob = ?, address = ?
    WHERE id = ?
  `).run(firstName, lastName, phone || null, dob || null, address || null, req.userId);

  const updatedUser = db.prepare('SELECT id, firstName, lastName, email, phone, dob, address, isAdmin FROM users WHERE id = ?').get(req.userId);
  res.json(updatedUser);
}
module.exports = { registerUser, loginUser, requireAuth, requireAdmin, getProfile, updateProfile, JWT_SECRET };