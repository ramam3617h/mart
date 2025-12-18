// ============================================
// 11. COMPLETE FILE: routes/orders.js (WITH NOTIFICATIONS)
// ============================================
const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');
const notificationService = require('../services/notificationService');

const router = express.Router();

// Get all orders
router.get('/', authenticate, async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    let query = `
      SELECT o.*, u.name as customer_name, u.email as customer_email, u.phone as customer_phone,
             d.name as delivery_agent_name
      FROM orders o
      JOIN users u ON o.customer_id = u.id
      LEFT JOIN users d ON o.delivery_agent_id = d.id
      WHERE o.tenant_id = ?
    `;
    const params = [req.user.tenantId];

    if (req.user.role === 'customer') {
      query += ' AND o.customer_id = ?';
      params.push(req.user.userId);
    } else if (req.user.role === 'delivery') {
      query += ' AND (o.delivery_agent_id = ? OR o.status IN ("pending", "processing"))';
      params.push(req.user.userId);
    }

    if (status) {
      query += ' AND o.status = ?';
      params.push(status);
    }

    query += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const [orders] = await pool.query(query, params);

    for (let order of orders) {
      const [items] = await pool.query(
        'SELECT * FROM order_items WHERE order_id = ?',
        [order.id]
      );
      order.items = items;
    }

    res.json({
      success: true,
      orders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch orders'
    });
  }
});

// Get single order
router.get('/:id', authenticate, async (req, res) => {
  try {
    let query = `
      SELECT o.*, u.name as customer_name, u.email as customer_email, u.phone as customer_phone,
             d.name as delivery_agent_name
      FROM orders o
      JOIN users u ON o.customer_id = u.id
      LEFT JOIN users d ON o.delivery_agent_id = d.id
      WHERE o.id = ? AND o.tenant_id = ?
    `;
    const params = [req.params.id, req.user.tenantId];

    if (req.user.role === 'customer') {
      query += ' AND o.customer_id = ?';
      params.push(req.user.userId);
    } else if (req.user.role === 'delivery') {
      query += ' AND o.delivery_agent_id = ?';
      params.push(req.user.userId);
    }

    const [orders] = await pool.query(query, params);

    if (orders.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    const [items] = await pool.query(
      'SELECT * FROM order_items WHERE order_id = ?',
      [req.params.id]
    );

    orders[0].items = items;
    res.json({
      success: true,
      order: orders[0]
    });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch order'
    });
  }
});

// Create order (Customer only)
router.post('/', authenticate, authorize('customer'), [
  body('items').isArray({ min: 1 }),
  body('delivery_address').trim().notEmpty(),
  body('payment_method').notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const { items, delivery_address, payment_method, payment_id, razorpay_order_id, notes } = req.body;

    let totalAmount = 0;
    const validatedItems = [];

    for (const item of items) {
      const [products] = await connection.query(
        'SELECT id, name, price, stock FROM products WHERE id = ? AND tenant_id = ? AND is_active = TRUE',
        [item.product_id, req.user.tenantId]
      );

      if (products.length === 0) {
        throw new Error(`Product ${item.product_id} not found or unavailable`);
      }

      const product = products[0];

      if (product.stock < item.quantity) {
        throw new Error(`Insufficient stock for ${product.name}. Available: ${product.stock}`);
      }

      const subtotal = product.price * item.quantity;
      totalAmount += subtotal;

      validatedItems.push({
        product_id: product.id,
        product_name: product.name,
        quantity: item.quantity,
        price: product.price,
        subtotal
      });

      await connection.query(
        'UPDATE products SET stock = stock - ? WHERE id = ?',
        [item.quantity, product.id]
      );
    }

    //const deliveryCharge = totalAmount < 500 ? 0 : 0;
     const deliveryCharge = 0;
     totalAmount += deliveryCharge;

    const orderNumber = 'ORD' + Date.now();

    const [orderResult] = await connection.query(
      `INSERT INTO orders 
       (tenant_id, customer_id, order_number, total_amount, delivery_charge, 
        payment_method, payment_id, razorpay_order_id, payment_status, delivery_address, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.tenantId,
        req.user.userId,
        orderNumber,
        totalAmount,
        deliveryCharge,
        payment_method,
        payment_id,
        razorpay_order_id,
        payment_id ? 'paid' : 'pending',
        delivery_address,
        notes
      ]
    );

    const orderId = orderResult.insertId;

    for (const item of validatedItems) {
      await connection.query(
        `INSERT INTO order_items (order_id, product_id, product_name, quantity, price, subtotal)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orderId, item.product_id, item.product_name, item.quantity, item.price, item.subtotal]
      );
    }

    await connection.commit();

    // Get full order details
    const [orderDetails] = await connection.query(
      'SELECT * FROM orders WHERE id = ?',
      [orderId]
    );

    const [orderItems] = await connection.query(
      'SELECT * FROM order_items WHERE order_id = ?',
      [orderId]
    );

    const fullOrder = {
      ...orderDetails[0],
      items: orderItems
    };

    // Get user details
    const [users] = await connection.query(
      'SELECT id, name, email, phone, tenant_id FROM users WHERE id = ?',
      [req.user.userId]
    );

    // Send order confirmation notifications
    if (users.length > 0) {
      notificationService.sendOrderConfirmationNotifications(fullOrder, users[0])
        .catch(err => console.error('Notification error:', err));
    }

    await logAudit(req, 'CREATE_ORDER', 'order', orderId,
      `Created order: ${orderNumber}`, { orderNumber, totalAmount });

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      orderId,
      orderNumber,
      totalAmount
    });

  } catch (error) {
    await connection.rollback();
    console.error('Create order error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create order'
    });
  } finally {
    connection.release();
  }
});

// Update order status
router.patch('/:id/status', authenticate, async (req, res) => {
  const { status } = req.body;

  const validStatuses = ['pending', 'processing', 'in-transit', 'delivered', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid status'
    });
  }

  try {
    if (req.user.role === 'customer' && status !== 'cancelled') {
      return res.status(403).json({
        success: false,
        error: 'Customers can only cancel orders'
      });
    }

    let query = 'UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?';
    const params = [status, req.params.id, req.user.tenantId];

    if (req.user.role === 'customer') {
      query += ' AND customer_id = ? AND status = "pending"';
      params.push(req.user.userId);
    }

    if (status === 'delivered') {
      query = query.replace('status = ?', 'status = ?, delivered_at = CURRENT_TIMESTAMP');
    }

    const [result] = await pool.query(query, params);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Order not found or cannot be updated'
      });
    }

    if (req.user.role === 'delivery' && status === 'in-transit') {
      await pool.query(
        'UPDATE orders SET delivery_agent_id = ? WHERE id = ?',
        [req.user.userId, req.params.id]
      );
    }

    // Get order and user details for notifications
    const [orders] = await pool.query(
      `SELECT o.*, u.id as user_id, u.email, u.phone, u.name, u.tenant_id
       FROM orders o 
       JOIN users u ON o.customer_id = u.id 
       WHERE o.id = ?`,
      [req.params.id]
    );

    if (orders.length > 0) {
      const order = orders[0];
      const [items] = await pool.query(
        'SELECT * FROM order_items WHERE order_id = ?',
        [order.id]
      );
      order.items = items;

      const user = {
        id: order.user_id,
        email: order.email,
        phone: order.phone,
        name: order.name,
        tenant_id: order.tenant_id
      };

      // Send status update notifications
      notificationService.sendOrderStatusUpdateNotifications(order, user, status)
        .catch(err => console.error('Notification error:', err));
    }

    await logAudit(req, 'UPDATE_ORDER_STATUS', 'order', req.params.id,
      `Updated order status to: ${status}`);

    res.json({
      success: true,
      message: 'Order status updated successfully'
    });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update order status'
    });
  }
});

// Get order statistics (Admin only)
router.get('/stats/dashboard', authenticate, authorize('admin'), async (req, res) => {
  try {
    const [stats] = await pool.query(`
      SELECT 
        COUNT(*) as total_orders,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_orders,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing_orders,
        SUM(CASE WHEN status = 'in-transit' THEN 1 ELSE 0 END) as in_transit_orders,
        SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered_orders,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_orders,
        SUM(CASE WHEN payment_status = 'paid' THEN total_amount ELSE 0 END) as total_revenue
      FROM orders 
      WHERE tenant_id = ?
    `, [req.user.tenantId]);

    res.json({
      success: true,
      stats: stats[0]
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics'
    });
  }
});

module.exports = router;
