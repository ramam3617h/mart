

// ============================================
// 2. FILE: routes/settings.js (NEW)
// ============================================
const express2 = require('express');
const pool2 = require('../config/database');
const { authenticate: auth2, authorize: authz2 } = require('../middleware/auth');
const { logAudit: audit2 } = require('../middleware/audit');

const settingsRouter = express2.Router();

// Get all settings
settingsRouter.get('/', auth2, authz2('admin'), async (req, res) => {
  try {
    const [tenant] = await pool2.query(
      'SELECT * FROM tenants WHERE id = ?',
      [req.user.tenantId]
    );

    const [settings] = await pool2.query(
      'SELECT * FROM settings WHERE tenant_id = ?',
      [req.user.tenantId]
    );

    const settingsObj = {};
    settings.forEach(s => {
      settingsObj[s.key_name] = s.value;
    });

    res.json({
      success: true,
      tenant: tenant[0],
      settings: settingsObj
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch settings'
    });
  }
});

// Update tenant info
settingsRouter.put('/tenant', auth2, authz2('admin'), async (req, res) => {
  const { name, email, phone, gst_number, razorpay_key } = req.body;

  try {
    await pool2.query(
      `UPDATE tenants
       SET name = ?, email = ?, phone = ?, gst_number = ?, razorpay_key = ?
       WHERE id = ?`,
      [name, email, phone, gst_number, razorpay_key, req.user.tenantId]
    );

    await audit2(req, 'UPDATE_TENANT_SETTINGS', 'tenant', req.user.tenantId,
      'Updated tenant information');

    res.json({
      success: true,
      message: 'Tenant information updated successfully'
    });
  } catch (error) {
    console.error('Update tenant error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update tenant information'
    });
  }
});

// Update specific setting
settingsRouter.put('/update', auth2, authz2('admin'), async (req, res) => {
  const { key_name, value } = req.body;

  try {
    await pool2.query(
      `INSERT INTO settings (tenant_id, key_name, value)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE value = ?`,
      [req.user.tenantId, key_name, value, value]
    );

    await audit2(req, 'UPDATE_SETTING', 'setting', null,
      `Updated setting: ${key_name}`, { key_name, value });

    res.json({
      success: true,
      message: 'Setting updated successfully'
    });
  } catch (error) {
    console.error('Update setting error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update setting'
    });
  }
});

// Bulk update settings
settingsRouter.post('/bulk', auth2, authz2('admin'), async (req, res) => {
  const { settings } = req.body;

  try {
    for (const [key, value] of Object.entries(settings)) {
      await pool2.query(
        `INSERT INTO settings (tenant_id, key_name, value)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE value = ?`,
        [req.user.tenantId, key, value, value]
      );
    }

    await audit2(req, 'BULK_UPDATE_SETTINGS', 'settings', null,
      'Bulk updated settings', { settingsCount: Object.keys(settings).length });

    res.json({
      success: true,
      message: 'Settings updated successfully'
    });
  } catch (error) {
    console.error('Bulk update settings error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update settings'
    });
  }
});

// Get notification settings
settingsRouter.get('/notifications', auth2, authz2('admin'), async (req, res) => {
  try {
    const notificationSettings = {
      email: {
        enabled: process.env.ENABLE_EMAIL === 'true',
        host: process.env.EMAIL_HOST,
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
      notifications: notificationSettings
    });
  } catch (error) {
    console.error('Get notification settings error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notification settings'
    });
  }
});

module.exports = settingsRouter;
