'use strict';
const router             = require('express').Router();
const { pool }           = require('../db');
const { requireLogin }   = require('../middleware/auth');

// ── GET /orders — My orders ───────────────────────────────────
router.get('/orders', requireLogin, async (req, res, next) => {
  try {
    const [orders] = await pool.execute(
      `SELECT o.order_id, o.order_date, o.order_status,
              COUNT(oi.product_id)                     AS item_count,
              SUM(oi.qty * oi.price_at_purchase)       AS total
       FROM Orders o
       LEFT JOIN OrderItem oi ON o.order_id = oi.order_id
       WHERE o.user_id = ?
       GROUP BY o.order_id, o.order_date, o.order_status
       ORDER BY o.order_date DESC, o.order_id DESC`,
      [req.session.user.user_id]
    );
    res.render('orders', { title: 'My Orders | Leaf & Brew', orders });
  } catch (err) { next(err); }
});

// ── GET /orders/:id — Order detail ───────────────────────────
router.get('/orders/:id', requireLogin, async (req, res, next) => {
  try {
    const oid = parseInt(req.params.id);
    if (isNaN(oid)) return res.status(404).render('404', {
      title: 'Order Not Found',
      message: 'That order does not exist.'
    });

    const [[order]] = await pool.execute(
      `SELECT o.*, u.user_name, u.email, u.phone_no, u.address
       FROM Orders o
       JOIN Users u ON o.user_id = u.user_id
       WHERE o.order_id = ? AND o.user_id = ?`,
      [oid, req.session.user.user_id]
    );
    if (!order) return res.status(404).render('404', {
      title: 'Order Not Found',
      message: 'That order does not exist.'
    });

    const [items] = await pool.execute(
      `SELECT oi.*, p.p_name, p.tea_type
       FROM OrderItem oi
       JOIN Products p ON oi.product_id = p.product_id
       WHERE oi.order_id = ?`,
      [oid]
    );

    const total = items.reduce((s, i) => s + i.qty * parseFloat(i.price_at_purchase), 0);

    res.render('order-detail', {
      title: `Order #${oid} | Leaf & Brew`,
      order,
      items,
      total
    });
  } catch (err) { next(err); }
});

module.exports = router;
