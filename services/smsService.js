// ============================================
// 4. FILE: services/smsService.js
// ============================================
const twilio = require('twilio');

class SMSService {
  constructor() {
    this.client = null;
    this.phoneNumber = process.env.TWILIO_PHONE_NUMBER;
    
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      this.client = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
    }
  }

  async verifyConnection() {
    try {
      if (!this.client) {
        console.log('⚠️  SMS service not configured');
        return false;
      }
      console.log('✅ SMS service connected');
      return true;
    } catch (error) {
      console.error('❌ SMS service connection failed:', error.message);
      return false;
    }
  }

  async sendSMS(to, message) {
    if (process.env.ENABLE_SMS !== 'true' || !this.client) {
      console.log('SMS notifications disabled or not configured');
      return null;
    }

    try {
      const result = await this.client.messages.create({
        body: message,
        from: this.phoneNumber,
        to: to
      });

      console.log('📱 SMS sent:', result.sid);
      return result;
    } catch (error) {
      console.error('SMS send error:', error.message);
      throw error;
    }
  }

  async sendOrderConfirmation(order, user) {
    const message = `Hi ${user.name},\n\nYour order ${order.order_number} has been confirmed! Total: ₹${order.total_amount}.\n\nTrack: ${process.env.FRONTEND_URL}/orders/${order.id}\n\n- market.vrksatechnology.com`;
    
    return await this.sendSMS(user.phone, message);
  }

  async sendOrderStatusUpdate(order, user, newStatus) {
    const statusMessages = {
      'processing': 'is being processed',
      'in-transit': 'is out for delivery',
      'delivered': 'has been delivered',
      'cancelled': 'has been cancelled'
    };

    const message = `Hi ${user.name},\n\nYour order ${order.order_number} ${statusMessages[newStatus]}.\n\n- market.vrksatechnology.com`;
    
    return await this.sendSMS(user.phone, message);
  }

  async sendDeliveryOTP(order, user, otp) {
    const message = `Your market.vrksatechnology.com delivery OTP is: ${otp}\n\nOrder: ${order.order_number}\nPlease share this with delivery agent.\n\n- market.vrksatechnology.com`;
    
    return await this.sendSMS(user.phone, message);
  }

  async sendWelcomeSMS(user) {
    const message = `Welcome to market.vrksatechnology.com, ${user.name}! 🎉\n\nStart shopping fresh groceries now: ${process.env.FRONTEND_URL}\n\n- market.vrksatechnology.com`;
    
    return await this.sendSMS(user.phone, message);
  }
}

module.exports = new SMSService();
