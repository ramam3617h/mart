// ============================================
// 8. UPDATED FILE: routes/auth.js
// ============================================
// Add notification service import and update register/login:

//const notificationService = require('../services/notificationService');

// In register route, after user creation:

// Send welcome notifications
/*await notificationService.sendWelcomeNotifications({
  id: result.insertId,
  tenant_id: tenantId,
  name,
  email,
  phone
});
*/

// ============================================
// 7. FILE: routes/auth.js
// ============================================
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const pool = require('../config/database');
const { logAudit } = require('../middleware/audit');
const { authenticate } = require('../middleware/auth');
const notificationService = require('../services/notificationService');

const router = express.Router();

// Register
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('name').trim().notEmpty(),
  body('tenantId').isInt({ min: 1 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const { email, password, name, phone, address, tenantId } = req.body;

  try {
    const [existing] = await pool.query(
      'SELECT id FROM users WHERE tenant_id = ? AND email = ?',
      [tenantId, email]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'User with this email already exists'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      `INSERT INTO users (tenant_id, name, email, password, role, phone, address)
       VALUES (?, ?, ?, ?, 'customer', ?, ?)`,
      [tenantId, name, email, hashedPassword, phone, address]
    );

    const token = jwt.sign(
      { userId: result.insertId, tenantId, role: 'customer', email, name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE }
    ); 
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        id: result.insertId,
        name,
        email,
        role: 'customer',
        tenantId
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed. Please try again.'
    });
  }
  // In register route, after user creation:

// Send welcome notifications
await notificationService.sendWelcomeNotifications({
  id: result.insertId,
  tenant_id: tenantId,
  name,
  email,
  phone
});  


});

// Login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  body('tenantId').isInt({ min: 1 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const { email, password, tenantId } = req.body;

  try {
    const [users] = await pool.query(
      'SELECT * FROM users WHERE tenant_id = ? AND email = ? AND is_active = TRUE',
      [tenantId, email]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    const user = users[0];
    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    const token = jwt.sign(
      {
        userId: user.id,
        tenantId: user.tenant_id,
        role: user.role,
        email: user.email,
        name: user.name
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE }
    );

    // Temporary req object for audit log
    const tempReq = {
      user: { userId: user.id, tenantId: user.tenant_id },
      ip: req.ip,
      headers: req.headers
    };
    await logAudit(tempReq, 'LOGIN', 'user', user.id, `User ${user.name} logged in`);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenantId: user.tenant_id,
        phone: user.phone
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed. Please try again.'
    });
  }
});
// Get Current User 
 router.get('/me', authenticate, async (req, res) => {
  try {
    const [users] = await pool.query(
      'SELECT id, name, email, role, phone, address, tenant_id FROM users WHERE id = ?',
      [req.user.userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      user: users[0]
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user data'
    });
  }
});

module.exports = router;

