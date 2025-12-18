// ============================================
// COMPLETE BACKEND ROUTES FOR ADMIN FEATURES
// User Management, Settings & Product Management
// ============================================

// ============================================
// 1. FILE: routes/users.js (ENHANCED)
// ============================================
const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const pool = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');

const router = express.Router();

// Get all users (Admin only)
router.get('/', authenticate, authorize('admin'), async (req, res) => {
  const { role, search, page = 1, limit = 50, status } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    let query = `
      SELECT id, name, email, role, phone, address, is_active, created_at, updated_at
      FROM users
      WHERE tenant_id = ?
    `;
    const params = [req.user.tenantId];

    if (role) {
     query += ' AND role = ?';
      params.push(role);
    }

    if (search) {
      query += ' AND (name LIKE ? OR email LIKE ? OR phone LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (status) {
      query += ' AND is_active = ?';
      params.push(status === 'active' ? 1 : 0);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const [users] = await pool.query(query, params);

    const [countResult] = await pool.query(
      'SELECT COUNT(*) as total FROM users WHERE tenant_id = ?',
      [req.user.tenantId]
    );

    res.json({
      success: true,
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult[0].total
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users'
    });
  }
});

// Get single user
router.get('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const [users] = await pool.query(
      'SELECT id, name, email, role, phone, address, is_active, created_at, updated_at FROM users WHERE id = ? AND tenant_id = ?',
      [req.params.id, req.user.tenantId]
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
      error: 'Failed to fetch user'
    });
  }
});


// Create user (Admin only)
router.post('/', authenticate, authorize('admin'), [
  body('email').isEmail(),
  body('password').isLength({ min: 6 }),
  body('name').trim().notEmpty(),
  body('role').isIn(['admin', 'delivery', 'customer'])
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const { email, password, name, role, phone, address } = req.body;

  try {
    const [existing] = await pool.query(
      'SELECT id FROM users WHERE tenant_id = ? AND email = ?',
      [req.user.tenantId, email]
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
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.user.tenantId, name, email, hashedPassword, role, phone, address]
    );

    await logAudit(req, 'CREATE_USER', 'user', result.insertId,
      `Created user: ${name} (${role})`, { email, role });

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      userId: result.insertId
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create user'
    });
  }
});

// Update user
router.put('/:id', authenticate, authorize('admin'), async (req, res) => {
  const { name, email, role, phone, address, is_active } = req.body;

  try {
    const [result] = await pool.query(
      `UPDATE users
       SET name = ?, email = ?, role = ?, phone = ?, address = ?, is_active = ?
       WHERE id = ? AND tenant_id = ?`,
      [name, email, role, phone, address, is_active, req.params.id, req.user.tenantId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    await logAudit(req, 'UPDATE_USER', 'user', req.params.id,
      `Updated user: ${name}`, { email, role, is_active });

    res.json({
      success: true,
      message: 'User updated successfully'
    });
  } catch (error) {
  console.error('Update user error:', error);
    res.status(500).json({
    success: false,
      error: 'Failed to update user'
    });
  }
});


// Update user password
router.patch('/:id/password', authenticate, authorize('admin'), [
  body('password').isLength({ min: 6 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const { password } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      'UPDATE users SET password = ? WHERE id = ? AND tenant_id = ?',
      [hashedPassword, req.params.id, req.user.tenantId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    await logAudit(req, 'UPDATE_PASSWORD', 'user', req.params.id,
      'Updated user password');

    res.json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    console.error('Update password error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update password'
    });
  }
});

// Toggle user status
router.patch('/:id/status', authenticate, authorize('admin'), async (req, res) => {
  const { is_active } = req.body;

  try {
    const [result] = await pool.query(
      'UPDATE users SET is_active = ? WHERE id = ? AND tenant_id = ?',
      [is_active, req.params.id, req.user.tenantId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    await logAudit(req, 'UPDATE_USER_STATUS', 'user', req.params.id,
      `Updated user status to: ${is_active ? 'active' : 'inactive'}`);

    res.json({
      success: true,
      message: 'User status updated successfully'
    });
  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update user status'
    });
  }
});

// Delete user
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.userId) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete your own account'
      });
    }

    const [result] = await pool.query(
      'UPDATE users SET is_active = FALSE WHERE id = ? AND tenant_id = ?',
      [req.params.id, req.user.tenantId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    await logAudit(req, 'DELETE_USER', 'user', req.params.id,
      'Deleted user (soft delete)');

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete user'
    });
  }
});

// Get user statistics
router.get('/stats/summary', authenticate, authorize('admin'), async (req, res) => {
  try {
    const [stats] = await pool.query(`
      SELECT
        COUNT(*) as total_users,
        SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as admins,
        SUM(CASE WHEN role = 'delivery' THEN 1 ELSE 0 END) as delivery_agents,
        SUM(CASE WHEN role = 'customer' THEN 1 ELSE 0 END) as customers,
        SUM(CASE WHEN is_active = TRUE THEN 1 ELSE 0 END) as active_users,
        SUM(CASE WHEN is_active = FALSE THEN 1 ELSE 0 END) as inactive_users
      FROM users
      WHERE tenant_id = ?
    `, [req.user.tenantId]);

    res.json({
      success: true,
      stats: stats[0]
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user statistics'
    });
  }
});

 module.exports = router;
