// ============================================
// FILE: routes/notifications.js
// Complete Notification Routes
// ============================================

const express = require('express');
const pool = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const notificationService = require('../services/notificationService');

const router = express.Router();

// ============================================
// Get notification logs (Admin only)
// ============================================
router.get('/logs', authenticate, authorize('admin'), async (req, res) => {
  const { page = 1, limit = 50, type, userId, startDate, endDate } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    let query = `
      SELECT n.*, u.name as user_name, u.email as user_email, u.phone as user_phone
      FROM notifications_log n
      JOIN users u ON n.user_id = u.id
      WHERE n.tenant_id = ?
    `;
    const params = [req.user.tenantId];

    if (type) {
      query += ' AND n.type = ?';
      params.push(type);
    }

    if (userId) {
      query += ' AND n.user_id = ?';
      params.push(userId);
    }

    if (startDate) {
      query += ' AND n.created_at >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND n.created_at <= ?';
      params.push(endDate);
    }

    query += ' ORDER BY n.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const [logs] = await pool.query(query, params);

    // Parse metadata JSON
    logs.forEach(log => {
      if (log.metadata) {
        try {
          log.metadata = JSON.parse(log.metadata);
        } catch (e) {
          log.metadata = {};
        }
      }
    });

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM notifications_log WHERE tenant_id = ?';
    const countParams = [req.user.tenantId];

    if (type) {
      countQuery += ' AND type = ?';
      countParams.push(type);
    }

    if (userId) {
      countQuery += ' AND user_id = ?';
      countParams.push(userId);
    }

    const [countResult] = await pool.query(countQuery, countParams);

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
    console.error('Get notification logs error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notification logs'
    });
  }
});

// ============================================
// Get single notification log
// ============================================
router.get('/logs/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const [logs] = await pool.query(
      `SELECT n.*, u.name as user_name, u.email as user_email, u.phone as user_phone
       FROM notifications_log n
       JOIN users u ON n.user_id = u.id
       WHERE n.id = ? AND n.tenant_id = ?`,
      [req.params.id, req.user.tenantId]
    );

    if (logs.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Notification log not found'
      });
    }

    const log = logs[0];
    if (log.metadata) {
      try {
        log.metadata = JSON.parse(log.metadata);
      } catch (e) {
        log.metadata = {};
      }
    }

    res.json({
      success: true,
      log
    });
  } catch (error) {
    console.error('Get notification log error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notification log'
    });
  }
});

// ============================================
// Send test notification (Admin only)
// ============================================
router.post('/test', authenticate, authorize('admin'), async (req, res) => {
  const { type, userId } = req.body;

  if (!type || !userId) {
    return res.status(400).json({
      success: false,
      error: 'Type and userId are required'
    });
  }

  try {
    // Get user details
    const [users] = await pool.query(
      'SELECT * FROM users WHERE id = ? AND tenant_id = ?',
      [userId, req.user.tenantId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const user = users[0];
    let result;

    switch (type) {
      case 'welcome':
        result = await notificationService.sendWelcomeNotifications(user);
        break;

      case 'test_email':
        result = await notificationService.sendTestEmail(user);
        break;

      case 'test_sms':
        result = await notificationService.sendTestSMS(user);
        break;

      case 'test_whatsapp':
        result = await notificationService.sendTestWhatsApp(user);
        break;

      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid notification type. Valid types: welcome, test_email, test_sms, test_whatsapp'
        });
    }

    res.json({
      success: true,
      message: 'Test notification sent successfully',
      result,
      details: {
        email: result.email ? '✅ Sent' : '❌ Not sent',
        sms: result.sms ? '✅ Sent' : '❌ Not sent',
        whatsapp: result.whatsapp ? '✅ Sent' : '❌ Not sent'
      }
    });
  } catch (error) {
    console.error('Send test notification error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send test notification',
      message: error.message
    });
  }
});

// ============================================
// Get notification statistics (Admin only)
// ============================================
router.get('/stats', authenticate, authorize('admin'), async (req, res) => {
  try {
    // Overall statistics
    const [stats] = await pool.query(`
      SELECT 
        COUNT(*) as total_notifications,
        SUM(CASE WHEN type = 'WELCOME' THEN 1 ELSE 0 END) as welcome_sent,
        SUM(CASE WHEN type = 'ORDER_CONFIRMATION' THEN 1 ELSE 0 END) as order_confirmations,
        SUM(CASE WHEN type = 'ORDER_STATUS_UPDATE' THEN 1 ELSE 0 END) as status_updates,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as successful,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM notifications_log 
      WHERE tenant_id = ?
    `, [req.user.tenantId]);

    // Notifications by type
    const [byType] = await pool.query(`
      SELECT type, COUNT(*) as count
      FROM notifications_log 
      WHERE tenant_id = ?
      GROUP BY type
      ORDER BY count DESC
    `, [req.user.tenantId]);

    // Recent activity (last 7 days)
    const [recentActivity] = await pool.query(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM notifications_log 
      WHERE tenant_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `, [req.user.tenantId]);

    // Top users by notifications
    const [topUsers] = await pool.query(`
      SELECT u.name, u.email, COUNT(n.id) as notification_count
      FROM notifications_log n
      JOIN users u ON n.user_id = u.id
      WHERE n.tenant_id = ?
      GROUP BY n.user_id
      ORDER BY notification_count DESC
      LIMIT 10
    `, [req.user.tenantId]);

    res.json({
      success: true,
      stats: stats[0],
      byType,
      recentActivity,
      topUsers
    });
  } catch (error) {
    console.error('Get notification stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notification statistics'
    });
  }
});

// ============================================
// Get notification settings (Admin only)
// ============================================
router.get('/settings', authenticate, authorize('admin'), async (req, res) => {
  try {
    const settings = {
      email: {
        enabled: process.env.ENABLE_EMAIL === 'true',
        provider: process.env.EMAIL_HOST,
        from: process.env.EMAIL_FROM
      },
      sms: {
        enabled: process.env.ENABLE_SMS === 'true',
        provider: 'Twilio',
        from: process.env.TWILIO_PHONE_NUMBER
      },
      whatsapp: {
        enabled: process.env.ENABLE_WHATSAPP === 'true',
        provider: 'Twilio',
        from: process.env.TWILIO_WHATSAPP_NUMBER
      }
    };

    res.json({
      success: true,
      settings
    });
  } catch (error) {
    console.error('Get notification settings error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notification settings'
    });
  }
});

// ============================================
// Resend notification (Admin only)
// ============================================
router.post('/resend/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    // Get original notification
    const [logs] = await pool.query(
      `SELECT n.*, u.* 
       FROM notifications_log n
       JOIN users u ON n.user_id = u.id
       WHERE n.id = ? AND n.tenant_id = ?`,
      [req.params.id, req.user.tenantId]
    );

    if (logs.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Notification log not found'
      });
    }

    const log = logs[0];
    const user = {
      id: log.user_id,
      tenant_id: log.tenant_id,
      name: log.name,
      email: log.email,
      phone: log.phone
    };

    let result;

    switch (log.type) {
      case 'WELCOME':
        result = await notificationService.sendWelcomeNotifications(user);
        break;
      case 'ORDER_CONFIRMATION':
        // Would need to fetch order details
        return res.status(400).json({
          success: false,
          error: 'Order confirmation resend requires order ID'
        });
      default:
        return res.status(400).json({
          success: false,
          error: 'Cannot resend this notification type'
        });
    }

    res.json({
      success: true,
      message: 'Notification resent successfully',
      result
    });
  } catch (error) {
    console.error('Resend notification error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resend notification'
    });
  }
});

// ============================================
// Delete notification log (Admin only)
// ============================================
router.delete('/logs/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const [result] = await pool.query(
      'DELETE FROM notifications_log WHERE id = ? AND tenant_id = ?',
      [req.params.id, req.user.tenantId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Notification log not found'
      });
    }

    res.json({
      success: true,
      message: 'Notification log deleted successfully'
    });
  } catch (error) {
    console.error('Delete notification log error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete notification log'
    });
  }
});

// ============================================
// Clear old notification logs (Admin only)
// ============================================
router.delete('/logs/clear/old', authenticate, authorize('admin'), async (req, res) => {
  const { days = 90 } = req.query;

  try {
    const [result] = await pool.query(
      `DELETE FROM notifications_log 
       WHERE tenant_id = ? AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [req.user.tenantId, parseInt(days)]
    );

    res.json({
      success: true,
      message: `Deleted ${result.affectedRows} old notification logs`,
      deletedCount: result.affectedRows
    });
  } catch (error) {
    console.error('Clear old logs error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear old notification logs'
    });
  }
});

// ============================================
// Get notification types
// ============================================
router.get('/types', authenticate, authorize('admin'), async (req, res) => {
  try {
    const types = [
      {
        type: 'WELCOME',
        description: 'Welcome message sent to new users',
        channels: ['email', 'sms', 'whatsapp']
      },
      {
        type: 'ORDER_CONFIRMATION',
        description: 'Order confirmation with details',
        channels: ['email', 'sms', 'whatsapp']
      },
      {
        type: 'ORDER_STATUS_UPDATE',
        description: 'Order status change notification',
        channels: ['email', 'sms', 'whatsapp']
      },
      {
        type: 'PASSWORD_RESET',
        description: 'Password reset link',
        channels: ['email']
      }
    ];

    res.json({
      success: true,
      types
    });
  } catch (error) {
    console.error('Get notification types error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notification types'
    });
  }
});

// ============================================
// Get user notification history
// ============================================
router.get('/user/:userId', authenticate, async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    // Check authorization
    if (req.user.role !== 'admin' && req.user.userId !== parseInt(req.params.userId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const [logs] = await pool.query(
      `SELECT * FROM notifications_log 
       WHERE tenant_id = ? AND user_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [req.user.tenantId, req.params.userId, parseInt(limit), offset]
    );

    // Parse metadata
    logs.forEach(log => {
      if (log.metadata) {
        try {
          log.metadata = JSON.parse(log.metadata);
        } catch (e) {
          log.metadata = {};
        }
      }
    });

    const [countResult] = await pool.query(
      'SELECT COUNT(*) as total FROM notifications_log WHERE tenant_id = ? AND user_id = ?',
      [req.user.tenantId, req.params.userId]
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
    console.error('Get user notifications error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user notifications'
    });
  }
});

module.exports = router;
