'use strict';
const router           = require('express').Router();
const { pool }         = require('../db');
const { requireLogin } = require('../middleware/auth');

// ── GET /account ──────────────────────────────────────────────
router.get('/account', requireLogin, async (req, res, next) => {
  try {
    const uid = req.session.user.user_id;

    const [[user]] = await pool.execute(
      'SELECT user_id, user_name, email, address, phone_no, user_type FROM Users WHERE user_id = ?',
      [uid]
    );

    const [orders] = await pool.execute(
      `SELECT o.order_id, o.order_date, o.order_status,
              COUNT(oi.product_id)               AS item_count,
              SUM(oi.qty * oi.price_at_purchase)  AS total
       FROM Orders o
       LEFT JOIN OrderItem oi ON o.order_id = oi.order_id
       WHERE o.user_id = ?
       GROUP BY o.order_id, o.order_date, o.order_status
       ORDER BY o.order_date DESC, o.order_id DESC
       LIMIT 5`,
      [uid]
    );

    const [reviews] = await pool.execute(
      `SELECT r.*, p.p_name, p.product_id
       FROM Reviews r
       JOIN Products p ON r.product_id = p.product_id
       WHERE r.user_id = ?
       ORDER BY r.review_date DESC`,
      [uid]
    );

    res.render('account', {
      title: 'My Account | Leaf & Brew',
      profileUser: user,
      orders,
      reviews,
      errors: []
    });
  } catch (err) { next(err); }
});

// ── POST /account ─────────────────────────────────────────────
router.post('/account', requireLogin, async (req, res, next) => {
  const uid = req.session.user.user_id;
  const { user_name, phone_no, address } = req.body;
  const errors = [];

  if (!user_name || !user_name.trim()) errors.push('Full name is required.');
  else if (user_name.trim().length > 100) errors.push('Full name must be 100 characters or fewer.');
  if (phone_no && phone_no.trim().length > 20)  errors.push('Phone number must be 20 characters or fewer.');
  if (address  && address.trim().length  > 255) errors.push('Address must be 255 characters or fewer.');

  if (errors.length) {
    // Re-fetch data to re-render the page
    try {
      const [[profileUser]] = await pool.execute(
        'SELECT user_id, user_name, email, address, phone_no, user_type FROM Users WHERE user_id = ?',
        [uid]
      );
      const [orders] = await pool.execute(
        `SELECT o.order_id, o.order_date, o.order_status,
                COUNT(oi.product_id)               AS item_count,
                SUM(oi.qty * oi.price_at_purchase)  AS total
         FROM Orders o
         LEFT JOIN OrderItem oi ON o.order_id = oi.order_id
         WHERE o.user_id = ?
         GROUP BY o.order_id, o.order_date, o.order_status
         ORDER BY o.order_date DESC LIMIT 5`,
        [uid]
      );
      const [reviews] = await pool.execute(
        `SELECT r.*, p.p_name, p.product_id
         FROM Reviews r JOIN Products p ON r.product_id = p.product_id
         WHERE r.user_id = ? ORDER BY r.review_date DESC`,
        [uid]
      );
      return res.render('account', {
        title: 'My Account | Leaf & Brew',
        profileUser: { ...profileUser, user_name, phone_no, address },
        orders, reviews, errors
      });
    } catch (err) { return next(err); }
  }

  try {
    await pool.execute(
      'UPDATE Users SET user_name = ?, phone_no = ?, address = ? WHERE user_id = ?',
      [
        user_name.trim(),
        phone_no ? phone_no.trim() : null,
        address  ? address.trim()  : null,
        uid
      ]
    );
    // Refresh session name
    req.session.user.user_name = user_name.trim();
    req.session.flash = { type: 'success', msg: 'Profile updated.' };
    res.redirect('/account');
  } catch (err) { next(err); }
});

module.exports = router;
