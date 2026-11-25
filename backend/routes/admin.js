'use strict';
const router             = require('express').Router();
const { pool }           = require('../db');
const { withImg }        = require('../helpers');
const { requireAdmin }   = require('../middleware/auth');

// ── Auth guard ────────────────────────────────────────────────
router.use(requireAdmin);

// ── SVG chart helper ──────────────────────────────────────────
function buildChart(rows) {
  if (!rows.length) return { pts: [], chartMax: 400 };
  const maxV    = Math.max(...rows.map(r => r.visits));
  const chartMax = Math.ceil(maxV / 50) * 50 || 400;
  const W = 550, H = 180, PL = 40, PT = 10;
  const pts = rows.map((r, i) => ({
    x: (PL + (rows.length > 1 ? (i / (rows.length - 1)) * W : W / 2)).toFixed(1),
    y: (PT + H - (r.visits / chartMax) * H).toFixed(1),
    date:   r.date,
    visits: r.visits
  }));
  return { pts, chartMax };
}

// ── GET /admin — Dashboard ────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const VALID_RANGES = [7, 14, 30];
    const range = VALID_RANGES.includes(parseInt(req.query.range)) ? parseInt(req.query.range) : 7;

    const [[{ totalVisits }]] = await pool.execute(
      'SELECT COALESCE(SUM(visits), 0) AS totalVisits FROM DailyMetrics'
    );
    const [[{ totalOrders }]] = await pool.execute(
      'SELECT COUNT(*) AS totalOrders FROM Orders'
    );
    const [[{ lowStock }]] = await pool.execute(
      'SELECT COUNT(*) AS lowStock FROM Products WHERE stock_qty < 10'
    );
    const [[{ totalUsers }]] = await pool.execute(
      'SELECT COUNT(*) AS totalUsers FROM Users'
    );

    // Chart: most recent N days of DailyMetrics
    const [metrics] = await pool.execute(
      'SELECT date, visits FROM DailyMetrics ORDER BY date DESC LIMIT ?',
      [range]
    );
    const chartData = [...metrics].reverse();
    const { pts, chartMax } = buildChart(chartData);

    // Low-stock products
    const [lowStockProducts] = await pool.execute(
      'SELECT product_id, p_name, stock_qty FROM Products WHERE stock_qty < 10 ORDER BY stock_qty ASC'
    );

    // Recent orders
    const [recentOrders] = await pool.execute(
      `SELECT o.order_id, u.user_name, o.order_date, o.order_status,
              SUM(oi.qty * oi.price_at_purchase) AS total
       FROM Orders o
       JOIN Users u ON o.user_id = u.user_id
       LEFT JOIN OrderItem oi ON o.order_id = oi.order_id
       GROUP BY o.order_id, u.user_name, o.order_date, o.order_status
       ORDER BY o.order_date DESC, o.order_id DESC
       LIMIT 5`
    );

    res.render('admin/dashboard', {
      title: 'Dashboard | Leaf & Brew Admin',
      active: 'dashboard',
      stats: { totalVisits, totalOrders, lowStock, totalUsers },
      chartPts: pts,
      chartMax,
      range,
      lowStockProducts,
      recentOrders
    });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════
// PRODUCTS
// ═══════════════════════════════════════════════════════════════

// GET /admin/products
router.get('/products', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    const params = [];
    let where = '';
    if (q) {
      where = 'WHERE p_name LIKE ? OR tea_type LIKE ?';
      params.push(`%${q}%`, `%${q}%`);
    }
    const [products] = await pool.execute(
      `SELECT * FROM Products ${where} ORDER BY product_id ASC`,
      params
    );
    res.render('admin/products', {
      title: 'Products | Admin',
      active: 'products',
      products: withImg(products),
      q
    });
  } catch (err) { next(err); }
});

// GET /admin/products/new
router.get('/products/new', (req, res) => {
  res.render('admin/product-form', {
    title: 'New Product | Admin',
    active: 'products',
    product: null,
    errors: []
  });
});

// POST /admin/products/create
router.post('/products/create', async (req, res, next) => {
  const { p_name, tea_type, price, stock_qty, description } = req.body;
  const errors = [];

  if (!p_name   || !p_name.trim())   errors.push('Product name is required.');
  if (!tea_type || !tea_type.trim()) errors.push('Tea type is required.');
  else if (!VALID_TEA_TYPES.includes(tea_type)) errors.push(`Tea type must be one of: ${VALID_TEA_TYPES.join(', ')}.`);
  const pNum = parseFloat(price);
  if (isNaN(pNum) || pNum < 0)       errors.push('Price must be a non-negative number.');
  else if (pNum > 9999.99)           errors.push('Price must be at most $9999.99.');
  const sNum = parseInt(stock_qty);
  if (isNaN(sNum) || sNum < 0)       errors.push('Stock must be a non-negative integer.');
  else if (sNum > 100000)            errors.push('Stock must be at most 100,000.');

  if (errors.length) {
    return res.render('admin/product-form', {
      title: 'New Product | Admin',
      active: 'products',
      product: req.body,
      errors
    });
  }

  try {
    await pool.execute(
      `INSERT INTO Products (p_name, tea_type, price, stock_qty, description)
       VALUES (?, ?, ?, ?, ?)`,
      [p_name.trim(), tea_type.trim(), pNum, sNum, description ? description.trim().slice(0, 255) : null]
    );
    req.session.flash = { type: 'success', msg: `"${p_name.trim()}" has been created.` };
    res.redirect('/admin/products');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.render('admin/product-form', {
        title: 'New Product | Admin',
        active: 'products',
        product: req.body,
        errors: ['A product with that name already exists.']
      });
    }
    next(err);
  }
});

// GET /admin/products/:id/edit
router.get('/products/:id/edit', async (req, res, next) => {
  try {
    const [[product]] = await pool.execute(
      'SELECT * FROM Products WHERE product_id = ?',
      [parseInt(req.params.id)]
    );
    if (!product) return res.status(404).render('404', { title: 'Product Not Found', message: 'That product does not exist.' });
    res.render('admin/product-form', {
      title: `Edit ${product.p_name} | Admin`,
      active: 'products',
      product,
      errors: []
    });
  } catch (err) { next(err); }
});

// POST /admin/products/:id/update
router.post('/products/:id/update', async (req, res, next) => {
  const id = parseInt(req.params.id);
  const { p_name, tea_type, price, stock_qty, description } = req.body;
  const errors = [];

  if (!p_name   || !p_name.trim())   errors.push('Product name is required.');
  if (!tea_type || !tea_type.trim()) errors.push('Tea type is required.');
  else if (!VALID_TEA_TYPES.includes(tea_type)) errors.push(`Tea type must be one of: ${VALID_TEA_TYPES.join(', ')}.`);
  const pNum = parseFloat(price);
  if (isNaN(pNum) || pNum < 0)       errors.push('Price must be a non-negative number.');
  else if (pNum > 9999.99)           errors.push('Price must be at most $9999.99.');
  const sNum = parseInt(stock_qty);
  if (isNaN(sNum) || sNum < 0)       errors.push('Stock must be a non-negative integer.');
  else if (sNum > 100000)            errors.push('Stock must be at most 100,000.');

  if (errors.length) {
    return res.render('admin/product-form', {
      title: 'Edit Product | Admin',
      active: 'products',
      product: { ...req.body, product_id: id },
      errors
    });
  }

  try {
    const [result] = await pool.execute(
      `UPDATE Products SET p_name=?, tea_type=?, price=?, stock_qty=?, description=?
       WHERE product_id=?`,
      [p_name.trim(), tea_type.trim(), pNum, sNum, description ? description.trim().slice(0, 255) : null, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).render('404', { title: 'Product Not Found', message: 'That product does not exist.' });
    }
    req.session.flash = { type: 'success', msg: 'Product updated.' };
    res.redirect('/admin/products');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.render('admin/product-form', {
        title: 'Edit Product | Admin',
        active: 'products',
        product: { ...req.body, product_id: id },
        errors: ['A product with that name already exists.']
      });
    }
    next(err);
  }
});

// POST /admin/products/:id/delete
router.post('/products/:id/delete', async (req, res, next) => {
  try {
    await pool.execute('DELETE FROM Products WHERE product_id = ?', [parseInt(req.params.id)]);
    req.session.flash = { type: 'success', msg: 'Product deleted.' };
    res.redirect('/admin/products');
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      req.session.flash = {
        type: 'error',
        msg: `This product has order history and cannot be deleted. Set its stock to 0 to prevent new purchases.`,
        zeroStockId: parseInt(req.params.id)
      };
      return res.redirect('/admin/products');
    }
    next(err);
  }
});

// POST /admin/products/:id/zero-stock
router.post('/products/:id/zero-stock', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    await pool.execute('UPDATE Products SET stock_qty = 0 WHERE product_id = ?', [id]);
    req.session.flash = { type: 'success', msg: 'Stock set to 0. The product will no longer appear as purchasable.' };
    res.redirect('/admin/products');
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════
// ORDERS
// ═══════════════════════════════════════════════════════════════

const ORDER_STATUSES  = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
const VALID_TEA_TYPES = ['Green', 'Black', 'Oolong', 'White', 'Herbal', 'Matcha', 'Pu-erh'];

// GET /admin/orders
router.get('/orders', async (req, res, next) => {
  try {
    const status = req.query.status || '';
    const params = [];
    let where = '';
    if (status && ORDER_STATUSES.includes(status)) {
      where = 'WHERE o.order_status = ?';
      params.push(status);
    }
    const [orders] = await pool.execute(
      `SELECT o.order_id, u.user_name, u.email, o.order_date, o.order_status,
              COUNT(oi.product_id) AS item_count,
              SUM(oi.qty * oi.price_at_purchase) AS total
       FROM Orders o
       JOIN Users u ON o.user_id = u.user_id
       LEFT JOIN OrderItem oi ON o.order_id = oi.order_id
       ${where}
       GROUP BY o.order_id, u.user_name, u.email, o.order_date, o.order_status
       ORDER BY o.order_date DESC, o.order_id DESC`,
      params
    );
    res.render('admin/orders', {
      title: 'Orders | Admin',
      active: 'orders',
      orders,
      status,
      statuses: ORDER_STATUSES
    });
  } catch (err) { next(err); }
});

// GET /admin/orders/:id
router.get('/orders/:id', async (req, res, next) => {
  try {
    const oid = parseInt(req.params.id);
    const [[order]] = await pool.execute(
      `SELECT o.*, u.user_name, u.email, u.phone_no, u.address
       FROM Orders o JOIN Users u ON o.user_id = u.user_id
       WHERE o.order_id = ?`,
      [oid]
    );
    if (!order) return res.status(404).render('404', { title: 'Order Not Found', message: 'That order does not exist.' });

    const [items] = await pool.execute(
      `SELECT oi.*, p.p_name, p.tea_type
       FROM OrderItem oi JOIN Products p ON oi.product_id = p.product_id
       WHERE oi.order_id = ?`,
      [oid]
    );
    const total = items.reduce((s, i) => s + i.qty * parseFloat(i.price_at_purchase), 0);

    res.render('admin/order-detail', {
      title: `Order #${oid} | Admin`,
      active: 'orders',
      order,
      items,
      total,
      statuses: ORDER_STATUSES
    });
  } catch (err) { next(err); }
});

// POST /admin/orders/:id/status
router.post('/orders/:id/status', async (req, res, next) => {
  const oid    = parseInt(req.params.id);
  const status = req.body.order_status;

  if (!ORDER_STATUSES.includes(status)) {
    req.session.flash = { type: 'error', msg: 'Invalid status value.' };
    return res.redirect(`/admin/orders/${oid}`);
  }

  if (status === 'Cancelled') {
    // Run the status read AND the stock restore inside a single transaction
    // with FOR UPDATE so concurrent Cancel requests can't both restore stock.
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Lock the row and re-read the current status atomically
      const [[current]] = await conn.execute(
        'SELECT order_status FROM Orders WHERE order_id = ? FOR UPDATE', [oid]
      );
      if (!current) {
        await conn.rollback();
        req.session.flash = { type: 'error', msg: 'Order not found.' };
        return res.redirect('/admin/orders');
      }
      if (current.order_status === 'Cancelled') {
        await conn.rollback();
        req.session.flash = { type: 'error', msg: 'Cancelled orders cannot be changed.' };
        return res.redirect(`/admin/orders/${oid}`);
      }

      const [items] = await conn.execute(
        'SELECT product_id, qty FROM OrderItem WHERE order_id = ?', [oid]
      );
      for (const item of items) {
        await conn.execute(
          'UPDATE Products SET stock_qty = stock_qty + ? WHERE product_id = ?',
          [item.qty, item.product_id]
        );
      }
      await conn.execute(
        'UPDATE Orders SET order_status = ? WHERE order_id = ?', ['Cancelled', oid]
      );
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      return next(err);
    } finally {
      conn.release();
    }
  } else {
    // Non-cancel: still guard against re-activating a Cancelled order
    try {
      const [[current]] = await pool.execute(
        'SELECT order_status FROM Orders WHERE order_id = ?', [oid]
      );
      if (!current) {
        req.session.flash = { type: 'error', msg: 'Order not found.' };
        return res.redirect('/admin/orders');
      }
      if (current.order_status === 'Cancelled') {
        req.session.flash = { type: 'error', msg: 'Cancelled orders cannot be changed.' };
        return res.redirect(`/admin/orders/${oid}`);
      }
      await pool.execute(
        'UPDATE Orders SET order_status = ? WHERE order_id = ?', [status, oid]
      );
    } catch (err) { return next(err); }
  }

  req.session.flash = { type: 'success', msg: `Order #${oid} updated to ${status}.` };
  res.redirect(`/admin/orders/${oid}`);
});

// ═══════════════════════════════════════════════════════════════
// USERS
// ═══════════════════════════════════════════════════════════════

const USER_TYPES = ['Customer', 'Staff', 'Owner'];

// GET /admin/users
router.get('/users', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    const params = [];
    let where = '';
    if (q) {
      where = 'WHERE user_name LIKE ? OR email LIKE ?';
      params.push(`%${q}%`, `%${q}%`);
    }
    const [users] = await pool.execute(
      `SELECT user_id, user_type, user_name, email, phone_no FROM Users ${where} ORDER BY user_id ASC`,
      params
    );
    res.render('admin/users', {
      title: 'Users | Admin',
      active: 'users',
      users,
      q,
      userTypes: USER_TYPES
    });
  } catch (err) { next(err); }
});

// POST /admin/users/:id/role  — Owner only
router.post('/users/:id/role', async (req, res, next) => {
  try {
    if (req.session.user.user_type !== 'Owner') {
      return res.status(403).render('error', { title: 'Access Denied', message: 'Only Owners may change user roles.' });
    }
    const uid  = parseInt(req.params.id);
    const type = req.body.user_type;

    if (!USER_TYPES.includes(type)) {
      req.session.flash = { type: 'error', msg: 'Invalid user type.' };
      return res.redirect('/admin/users');
    }
    // Nobody can change their own role
    if (uid === req.session.user.user_id) {
      req.session.flash = { type: 'error', msg: 'You cannot change your own role.' };
      return res.redirect('/admin/users');
    }
    // Never demote the last Owner
    const [[target]] = await pool.execute(
      'SELECT user_type FROM Users WHERE user_id = ?', [uid]
    );
    if (target && target.user_type === 'Owner' && type !== 'Owner') {
      const [[{ ownerCount }]] = await pool.execute(
        "SELECT COUNT(*) AS ownerCount FROM Users WHERE user_type = 'Owner'"
      );
      if (ownerCount <= 1) {
        req.session.flash = { type: 'error', msg: 'Cannot demote the last Owner.' };
        return res.redirect('/admin/users');
      }
    }

    await pool.execute('UPDATE Users SET user_type = ? WHERE user_id = ?', [type, uid]);
    req.session.flash = { type: 'success', msg: 'User role updated.' };
    res.redirect('/admin/users');
  } catch (err) { next(err); }
});

// POST /admin/users/:id/delete  — Owner only
router.post('/users/:id/delete', async (req, res, next) => {
  try {
    if (req.session.user.user_type !== 'Owner') {
      return res.status(403).render('error', { title: 'Access Denied', message: 'Only Owners may delete users.' });
    }
    const uid = parseInt(req.params.id);
    // Prevent deleting yourself
    if (uid === req.session.user.user_id) {
      req.session.flash = { type: 'error', msg: 'You cannot delete your own account.' };
      return res.redirect('/admin/users');
    }
    // Protect last Owner
    const [[target]] = await pool.execute(
      'SELECT user_type FROM Users WHERE user_id = ?', [uid]
    );
    if (target && target.user_type === 'Owner') {
      const [[{ ownerCount }]] = await pool.execute(
        "SELECT COUNT(*) AS ownerCount FROM Users WHERE user_type = 'Owner'"
      );
      if (ownerCount <= 1) {
        req.session.flash = { type: 'error', msg: 'Cannot delete the last Owner account.' };
        return res.redirect('/admin/users');
      }
    }

    await pool.execute('DELETE FROM Users WHERE user_id = ?', [uid]);
    req.session.flash = { type: 'success', msg: 'User deleted.' };
    res.redirect('/admin/users');
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      req.session.flash = {
        type: 'error',
        msg: 'Cannot delete this user because they have existing orders.'
      };
      return res.redirect('/admin/users');
    }
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════════
// REPORT
// ═══════════════════════════════════════════════════════════════

// GET /admin/report
router.get('/report', async (req, res, next) => {
  try {
    // Uses the v_sales_by_tea_type VIEW (GROUP BY aggregate report)
    const [salesByType] = await pool.execute(
      'SELECT * FROM v_sales_by_tea_type'
    );
    // Top products by revenue
    const [topProducts] = await pool.execute(
      `SELECT p.p_name, p.tea_type,
              SUM(oi.qty)                             AS total_units,
              ROUND(SUM(oi.qty * oi.price_at_purchase), 2) AS total_revenue
       FROM Products p
       JOIN OrderItem oi ON p.product_id = oi.product_id
       JOIN Orders o     ON oi.order_id  = o.order_id
       WHERE o.order_status <> 'Cancelled'
       GROUP BY p.product_id, p.p_name, p.tea_type
       ORDER BY total_revenue DESC
       LIMIT 8`
    );
    res.render('admin/report', {
      title: 'Sales Report | Admin',
      active: 'report',
      salesByType,
      topProducts
    });
  } catch (err) { next(err); }
});

module.exports = router;
