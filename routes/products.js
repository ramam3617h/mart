//============================================
// 8. FILE: routes/products.js                                                                                                                                            // ============================================
const express = require('express');                                                                                                                                       const { body, validationResult } = require('express-validator');
const pool = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');

const router = express.Router();

// Get all products
router.get('/', authenticate, async (req, res) => {
  const { category, search, page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    let query = `
      SELECT p.*, c.name as category_name, c.icon as category_icon
      FROM products p
      JOIN categories c ON p.category_id = c.id
      WHERE p.tenant_id = ? AND p.is_active = TRUE
    `;
    const params = [req.user.tenantId];

    if (category) {
      query += ' AND c.name = ?';
      params.push(category);
    }

    if (search) {
      query += ' AND (p.name LIKE ? OR p.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const [products] = await pool.query(query, params);

    const [countResult] = await pool.query(
      'SELECT COUNT(*) as total FROM products WHERE tenant_id = ? AND is_active = TRUE',
      [req.user.tenantId]
    );

    res.json({
      success: true,
      products,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult[0].total
      }
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch products'
    });
  }
});


// Get single product
router.get('/:id', authenticate, async (req, res) => {
  try {
    const [products] = await pool.query(
      `SELECT p.*, c.name as category_name, c.icon as category_icon
       FROM products p
       JOIN categories c ON p.category_id = c.id
       WHERE p.id = ? AND p.tenant_id = ? AND p.is_active = TRUE`,
      [req.params.id, req.user.tenantId]
    );

    if (products.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    res.json({
      success: true,
      product: products[0]
    });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch product'
    });
  }
});

// Get categories
router.get('/categories/list', authenticate, async (req, res) => {
  try {
    const [categories] = await pool.query(
      'SELECT * FROM categories WHERE tenant_id = ? AND is_active = TRUE ORDER BY name',
      [req.user.tenantId]
    );

    res.json({
      success: true,
      categories
    });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch categories'
    });
  }
});


// ============================================
// 3. UPDATE: routes/products.js (ADD CATEGORY MANAGEMENT)
// ============================================

// ADD THESE ROUTES TO YOUR EXISTING routes/products.js

// Create category (Admin only)
router.post('/categories', authenticate, authorize('admin'), [
  body('name').trim().notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const { name, icon, description } = req.body;

  try {
    const [result] = await pool.query(
      'INSERT INTO categories (tenant_id, name, icon, description) VALUES (?, ?, ?, ?)',
      [req.user.tenantId, name, icon, description]
    );

    await logAudit(req, 'CREATE_CATEGORY', 'category', result.insertId,
      `Created category: ${name}`);

    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      categoryId: result.insertId
    });
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create category'
    });
  }
});

// Update category
router.put('/categories/:id', authenticate, authorize('admin'), async (req, res) => {
  const { name, icon, description, is_active } = req.body;

  try {
    const [result] = await pool.query(
      'UPDATE categories SET name = ?, icon = ?, description = ?, is_active = ? WHERE id = ? AND tenant_id = ?',
      [name, icon, description, is_active, req.params.id, req.user.tenantId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Category not found'
      });
    }

    await logAudit(req, 'UPDATE_CATEGORY', 'category', req.params.id,
      `Updated category: ${name}`);

    res.json({
      success: true,
      message: 'Category updated successfully'
    });
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update category'
    });
  }
});

// Delete category
router.delete('/categories/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const [products] = await pool.query(
      'SELECT COUNT(*) as count FROM products WHERE category_id = ? AND is_active = TRUE',
      [req.params.id]
    );

    if (products[0].count > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete category with active products'
      });
    }

    const [result] = await pool.query(
      'UPDATE categories SET is_active = FALSE WHERE id = ? AND tenant_id = ?',
      [req.params.id, req.user.tenantId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Category not found'
      });
    }

    await logAudit(req, 'DELETE_CATEGORY', 'category', req.params.id,
      'Deleted category');

    res.json({
      success: true,
      message: 'Category deleted successfully'
    });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete category'
    });
  }
});


// Create product (Admin only)
router.post('/', authenticate, authorize('admin'), [
  body('name').trim().notEmpty(),
  body('price').isFloat({ min: 0 }),
  body('stock').isInt({ min: 0 }),
  body('category_id').isInt({ min: 1 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const { name, description, price, stock, category_id, image_url, sku } = req.body;

  try {
    const [result] = await pool.query(
      `INSERT INTO products (tenant_id, category_id, name, description, price, stock, image_url, sku)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.tenantId, category_id, name, description, price, stock, image_url, sku]
    );

    await logAudit(req, 'CREATE_PRODUCT', 'product', result.insertId,
      `Created product: ${name}`, { name, price, stock });

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      productId: result.insertId
    });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create product'
    });
  }
});

// Update product (Admin only)
router.put('/:id', authenticate, authorize('admin'), async (req, res) => {
  const { name, description, price, stock, category_id, image_url, sku, is_active } = req.body;

  try {
    const [result] = await pool.query(
      `UPDATE products
       SET name = ?, description = ?, price = ?, stock = ?, category_id = ?,
           image_url = ?, sku = ?, is_active = ?
       WHERE id = ? AND tenant_id = ?`,
      [name, description, price, stock, category_id, image_url, sku, is_active,
       req.params.id, req.user.tenantId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    await logAudit(req, 'UPDATE_PRODUCT', 'product', req.params.id,
      `Updated product: ${name}`, { name, price, stock });

    res.json({
      success: true,
      message: 'Product updated successfully'
    });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update product'
    });
  }
});

// Delete product (Admin only)
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const [result] = await pool.query(
      'UPDATE products SET is_active = FALSE WHERE id = ? AND tenant_id = ?',
      [req.params.id, req.user.tenantId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    await logAudit(req, 'DELETE_PRODUCT', 'product', req.params.id,
      'Deleted product');

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete product'
    });
  }
});

module.exports = router;


