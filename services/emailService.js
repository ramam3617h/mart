//============================================
// 3. FILE: services/emailService.js
// ============================================
const nodemailer = require('nodemailer');
const handlebars = require('handlebars');
const fs = require('fs').promises;
const path = require('path');

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });

    this.from = process.env.EMAIL_FROM;
  }

  async verifyConnection() {
    try {
      await this.transporter.verify();
      console.log('✅ Email service connected');
      return true;
    } catch (error) {
      console.error('❌ Email service connection failed:', error.message);
      return false;
    }
  }

  async sendEmail(to, subject, html, text = null) {
    if (process.env.ENABLE_EMAIL !== 'true') {
      console.log('Email notifications disabled');
      return null;
    }

    try {
      const mailOptions = {
        from: this.from,
        to,
        subject,
        html,
        text: text || html.replace(/<[^>]*>/g, '')
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log('📧 Email sent:', info.messageId);
      return info;
    } catch (error) {
      console.error('Email send error:', error.message);
      throw error;
    }
  }

  async sendWelcomeEmail(user) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Welcome to FreshMart!</h1>
          </div>
          <div class="content">
            <h2>Hi ${user.name},</h2>
            <p>Thank you for joining FreshMart! We're excited to have you on board.</p>
            <p>Your account has been successfully created. You can now:</p>
            <ul>
              <li>Browse our fresh products</li>
              <li>Add items to your cart</li>
              <li>Place orders with secure payment</li>
              <li>Track your deliveries</li>
            </ul>
            <p>Start shopping now and enjoy fresh groceries delivered to your doorstep!</p>
            <a href="${process.env.FRONTEND_URL}" class="button">Start Shopping</a>
            <p>If you have any questions, feel free to reach out to our support team.</p>
            <p>Happy Shopping!</p>
          </div>
          <div class="footer">
            <p>© 2024 FreshMart. All rights reserved.</p>
            <p>This email was sent to ${user.email}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail(
      user.email,
      'Welcome to FreshMart! 🎉',
      html
    );
  }

  async sendOrderConfirmation(order, user) {
    const itemsList = order.items.map(item => 
      `<li>${item.product_name} x ${item.quantity} - ₹${item.subtotal}</li>`
    ).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #10b981; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; }
          .order-box { background: white; border: 2px solid #10b981; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .order-details { margin: 15px 0; }
          .total { font-size: 24px; color: #10b981; font-weight: bold; }
          .button { display: inline-block; background: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Order Confirmed!</h1>
          </div>
          <div class="content">
            <h2>Hi ${user.name},</h2>
            <p>Thank you for your order! We've received your order and are preparing it for delivery.</p>
            
            <div class="order-box">
              <h3>Order Details</h3>
              <div class="order-details">
                <p><strong>Order Number:</strong> ${order.order_number}</p>
                <p><strong>Order Date:</strong> ${new Date(order.created_at).toLocaleString()}</p>
                <p><strong>Payment Method:</strong> ${order.payment_method}</p>
                <p><strong>Payment Status:</strong> ${order.payment_status}</p>
              </div>
              
              <h4>Items Ordered:</h4>
              <ul>
                ${itemsList}
              </ul>
              
              <div style="margin-top: 20px; padding-top: 20px; border-top: 2px dashed #ddd;">
                <p><strong>Subtotal:</strong> ₹${order.total_amount - order.delivery_charge}</p>
                <p><strong>Delivery Charge:</strong> ₹${order.delivery_charge}</p>
                <p class="total">Total: ₹${order.total_amount}</p>
              </div>
              
              <h4>Delivery Address:</h4>
              <p>${order.delivery_address}</p>
            </div>
            
            <p>We'll send you another email once your order is out for delivery.</p>
            <a href="${process.env.FRONTEND_URL}/orders/${order.id}" class="button">Track Order</a>
          </div>
          <div class="footer">
            <p>© 2024 FreshMart. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail(
      user.email,
      `Order Confirmed - ${order.order_number}`,
      html
    );
  }

  async sendOrderStatusUpdate(order, user, newStatus) {
    const statusMessages = {
      'processing': 'Your order is being processed',
      'in-transit': 'Your order is out for delivery',
      'delivered': 'Your order has been delivered',
      'cancelled': 'Your order has been cancelled'
    };

    const statusIcons = {
      'processing': '⏳',
      'in-transit': '🚚',
      'delivered': '✅',
      'cancelled': '❌'
    };

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #3b82f6; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .status-box { background: white; border-left: 4px solid #3b82f6; padding: 20px; margin: 20px 0; }
          .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${statusIcons[newStatus]} Order Update</h1>
          </div>
          <div class="content">
            <h2>Hi ${user.name},</h2>
            <div class="status-box">
              <h3>${statusMessages[newStatus]}</h3>
              <p><strong>Order Number:</strong> ${order.order_number}</p>
              <p><strong>Status:</strong> ${newStatus.toUpperCase()}</p>
            </div>
            ${newStatus === 'delivered' ? '<p>We hope you enjoy your purchase! Thank you for shopping with FreshMart.</p>' : ''}
            ${newStatus === 'in-transit' ? `<p>Your delivery agent will contact you shortly at ${user.phone}.</p>` : ''}
            <a href="${process.env.FRONTEND_URL}/orders/${order.id}" class="button">View Order Details</a>
          </div>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail(
      user.email,
      `Order Update - ${order.order_number}`,
      html
    );
  }

  async sendPasswordReset(user, resetToken) {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #ef4444; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; background: #ef4444; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .warning { background: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Password Reset Request</h1>
          </div>
          <div class="content">
            <h2>Hi ${user.name},</h2>
            <p>We received a request to reset your password for your FreshMart account.</p>
            <p>Click the button below to reset your password:</p>
            <a href="${resetUrl}" class="button">Reset Password</a>
            <p>Or copy this link: ${resetUrl}</p>
            <div class="warning">
              <p><strong>⚠️ Important:</strong></p>
              <ul>
                <li>This link will expire in 1 hour</li>
                <li>If you didn't request this, please ignore this email</li>
                <li>Never share this link with anyone</li>
              </ul>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail(
      user.email,
      'Password Reset Request - FreshMart',
      html
    );
  }
}

module.exports = new EmailService();
