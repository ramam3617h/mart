// ============================================
// 6. FILE: middleware/audit.js
// ============================================
const pool = require('../config/database');

const logAudit = async (req, action, entityType = null, entityId = null, description = '', metadata = {}) => {
  try {
    if (!req.user) return;

    await pool.query(`
      INSERT INTO audit_logs
      (tenant_id, user_id, action, entity_type, entity_id, description, ip_address, user_agent, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      req.user.tenantId,
      req.user.userId,
      action,
      entityType,
      entityId,
      description,
      req.ip || req.connection.remoteAddress,
      req.headers['user-agent'] || 'Unknown',
      JSON.stringify(metadata)
    ]);
  } catch (error) {
    console.error('Audit log error:', error.message);
  }
};

module.exports = { logAudit };
