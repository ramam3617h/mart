// ============================================
// 5. FILE: services/whatsappService.js
// ============================================
const twilio = require('twilio');

class WhatsAppService {
  constructor() {
    this.client = null;
    this.whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER;
    
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
        console.log('⚠️  WhatsApp service not configured');
        return false;
      }
      console.log('✅ WhatsApp service connected');
      return true;
    } catch (error) {
      console.error('❌ WhatsApp service connection failed:', error.message);
      return false;
    }
  }

  async sendWhatsAppMessage(to, message) {
    if (process.env.ENABLE_WHATSAPP !== 'true' || !this.client) {
      console.log('WhatsApp notifications disabled or not configured');
      return null;
    }

    try {
      // Format phone number for WhatsApp
      const whatsappTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
      
      const result = await this.client.messages.create({
        body: message,
        from: this.whatsappNumber,
        to: whatsappTo
      });

      console.log('💬 WhatsApp sent:', result.sid);
      return result;
    } catch (error) {
      console.error('WhatsApp send error:', error.message);
      throw error;
    }
  }

  async sendOrderConfirmation(order, user) {
    const itemsList = order.items.map(item => 
      `• ${item.product_name} x ${item.quantity} - ₹${item.subtotal}`
    ).join('\n');

    const message = `🎉 *Order Confirmed!*

Hi ${user.name},

Your order has been placed successfully!

*Order Details:*
Order #: ${order.order_number}
Date: ${new Date(order.created_at).toLocaleString()}

*Items:*
${itemsList}

*Total: ₹${order.total_amount}*

Delivery Address:
${order.delivery_address}

Track your order: ${process.env.FRONTEND_URL}/orders/${order.id}

Thank you for shopping with market.vrksatechnology.com! 🛒`;

    return await this.sendWhatsAppMessage(user.phone, message);
  }

  async sendOrderStatusUpdate(order, user, newStatus) {
    const statusEmojis = {
      'processing': '⏳',
      'in-transit': '🚚',
      'delivered': '✅',
      'cancelled': '❌'
    };

    const statusMessages = {
      'processing': 'Your order is being processed',
      'in-transit': 'Your order is out for delivery',
      'delivered': 'Your order has been delivered',
      'cancelled': 'Your order has been cancelled'
    };

    const message = `${statusEmojis[newStatus]} *Order Update*

Hi ${user.name},

${statusMessages[newStatus]}

Order #: ${order.order_number}
Status: *${newStatus.toUpperCase()}*

${newStatus === 'delivered' ? 'Thank you for shopping with market.vrksatechnology.com! 🎉' : ''}
${newStatus === 'in-transit' ? 'Your delivery agent will contact you shortly.' : ''}

View details: ${process.env.FRONTEND_URL}/orders/${order.id}`;

    return await this.sendWhatsAppMessage(user.phone, message);
  }

  async sendWelcomeMessage(user) {
    const message = `🎉 *Welcome to market.vrksatechnology.com!*

Hi ${user.name},

Thank you for joining us! We're excited to have you on board.

Start shopping for fresh groceries, vegetables, fruits and more:
${process.env.FRONTEND_URL}

*What you can do:*
🛒 Browse fresh products
📦 Place orders easily
💳 Secure payments
🚚 Track deliveries

Need help? Just reply to this message.

Happy Shopping! 🌟`;

    return await this.sendWhatsAppMessage(user.phone, message);
  }
}

module.exports = new WhatsAppService();
