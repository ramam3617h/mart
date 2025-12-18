// ============================================
// 6. FILE: services/notificationService.js
// ============================================
const emailService = require('./emailService');
const smsService = require('./smsService');
const whatsappService = require('./whatsappService');
const pool = require('../config/database');

class NotificationService {
  async sendWelcomeNotifications(user) {
    const results = {
      email: null,
      sms: null,
      whatsapp: null
    };

    try {
      // Send Email
      if (process.env.ENABLE_EMAIL === 'true') {
        results.email = await emailService.sendWelcomeEmail(user);
      }

      // Send SMS
      if (process.env.ENABLE_SMS === 'true' && user.phone) {
        results.sms = await smsService.sendWelcomeSMS(user);
      }

      // Send WhatsApp
      if (process.env.ENABLE_WHATSAPP === 'true' && user.phone) {
        results.whatsapp = await whatsappService.sendWelcomeMessage(user);
      }

      // Log notification
      await this.logNotification(
        user.tenant_id,
        user.id,
        'WELCOME',
        'welcome',
        results
      );

      return results;
    } catch (error) {
      console.error('Welcome notification error:', error.message);
      return results;
    }
  }

  async sendOrderConfirmationNotifications(order, user) {
    const results = {
      email: null,
      sms: null,
      whatsapp: null
    };

    try {
      // Send Email
      if (process.env.ENABLE_EMAIL === 'true') {
        results.email = await emailService.sendOrderConfirmation(order, user);
      }

      // Send SMS
      if (process.env.ENABLE_SMS === 'true' && user.phone) {
        results.sms = await smsService.sendOrderConfirmation(order, user);
      }

      // Send WhatsApp
      if (process.env.ENABLE_WHATSAPP === 'true' && user.phone) {
        results.whatsapp = await whatsappService.sendOrderConfirmation(order, user);
      }

      // Log notification
      await this.logNotification(
        user.tenant_id,
        user.id,
        'ORDER_CONFIRMATION',
        order.order_number,
        results
      );

      return results;
    } catch (error) {
      console.error('Order confirmation notification error:', error.message);
      return results;
    }
  }

  async sendOrderStatusUpdateNotifications(order, user, newStatus) {
    const results = {
      email: null,
      sms: null,
      whatsapp: null
    };

    try {
      // Send Email
      if (process.env.ENABLE_EMAIL === 'true') {
        results.email = await emailService.sendOrderStatusUpdate(order, user, newStatus);
      }

      // Send SMS
      if (process.env.ENABLE_SMS === 'true' && user.phone) {
        results.sms = await smsService.sendOrderStatusUpdate(order, user, newStatus);
      }

      // Send WhatsApp
      if (process.env.ENABLE_WHATSAPP === 'true' && user.phone) {
        results.whatsapp = await whatsappService.sendOrderStatusUpdate(order, user, newStatus);
      }

      // Log notification
      await this.logNotification(
        user.tenant_id,
        user.id,
        'ORDER_STATUS_UPDATE',
        order.order_number,
        { ...results, status: newStatus }
      );

      return results;
    } catch (error) {
      console.error('Order status update notification error:', error.message);
      return results;
    }
  }

  async logNotification(tenantId, userId, type, reference, metadata) {
    try {
      await pool.query(
        `INSERT INTO notifications_log 
         (tenant_id, user_id, type, reference, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [tenantId, userId, type, reference, JSON.stringify(metadata)]
      );
    } catch (error) {
      console.error('Notification log error:', error.message);
    }
  }

  async verifyAllServices() {
    console.log('\n🔔 Verifying Notification Services...');
    await emailService.verifyConnection();
    await smsService.verifyConnection();
    await whatsappService.verifyConnection();
    console.log('');
  }
}

module.exports = new NotificationService();
