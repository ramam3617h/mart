// ============================================
// 11. FILE: routes/audit.js
// ============================================
const express = require('express');
const pool = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, authorize('admin'), async (req, res) => {
  const { page = 1, limit = 50, action, userId, startDate, endDate } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    let query = `
      SELECT a.*, u.name as user_name, u.email as user_email
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE a.tenant_id = ?
    `;
    const params = [req.user.tenantId];

    if (action) {
      query += ' AND a.action = ?';
      params.push(action);
    }

    if (userId) {
      query += ' AND a.user_id = ?';
      params.push(userId);
    }

    if (startDate) {
      query += ' AND a.created_at >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND a.created_at <= ?';
      params.push(endDate);
    }

    query += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const [logs] = await pool.query(query, params);

    const [countResult] = await pool.query(
      'SELECT COUNT(*) as total FROM audit_logs WHERE tenant_id = ?',
      [req.user.tenantId]
    );

    res.json({
      success: true,
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult[0].total
      }
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch audit logs'
    });
  }
});

// Get audit log statistics
router.get('/stats', authenticate, authorize('admin'), async (req, res) => {
  try {
    const [stats] = await pool.query(`
      SELECT
        COUNT(*) as total_logs,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(DISTINCT action) as unique_actions,
        MAX(created_at) as last_activity
      FROM audit_logs
      WHERE tenant_id = ?
    `, [req.user.tenantId]);

    const [topActions] = await pool.query(`
      SELECT action, COUNT(*) as count
      FROM audit_logs
      WHERE tenant_id = ?
      GROUP BY action
      ORDER BY count DESC
      LIMIT 10
    `, [req.user.tenantId]);

    res.json({
      success: true,
      stats: stats[0],
      topActions
    });
  } catch (error) {
    console.error('Get audit stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch audit statistics'
    });
  }
});

module.exports = router;
