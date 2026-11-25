'use strict';
const router             = require('express').Router();
const { pool }           = require('../db');
const { requireLogin }   = require('../middleware/auth');
const { recalcCart }     = require('../helpers');

// ── GET /checkout ─────────────────────────────────────────────
// Refresh prices/names from DB (same logic as GET /cart) so the
// summary always shows current figures before the user places the order.
router.get('/checkout', requireLogin, async (req, res, next) => {
  try {
    const cart = req.session.cart || { items: [], total: 0 };
    if (!cart.items.length) {
      req.session.flash = { type: 'error', msg: 'Your cart is empty.' };
      return res.redirect('/cart');
    }

    const ids = cart.items.map(i => i.product_id);
    const [rows] = await pool.execute(
      `SELECT product_id, p_name, price, stock_qty FROM Products WHERE product_id IN (${ids.map(() => '?').join(',')})`,
      ids
    );
    const lookup = Object.fromEntries(rows.map(r => [r.product_id, r]));

    const oosNames = [];
    cart.items = cart.items
      .filter(item => {
        if (!lookup[item.product_id]) return false;
        if (lookup[item.product_id].stock_qty === 0) { oosNames.push(item.p_name); return false; }
        return true;
      })
      .map(item => {
        const p = lookup[item.product_id];
        return { ...item, p_name: p.p_name, price: parseFloat(p.price) };
      });

    req.session.cart = recalcCart(cart);
    res.locals.cart  = req.session.cart;

    if (oosNames.length) {
      res.locals.flash = {
        type: 'error',
        msg: oosNames.map(n => `${n} is now out of stock and was removed.`).join(' ')
      };
    }

    if (!req.session.cart.items.length) {
      req.session.flash = { type: 'error', msg: 'All items in your cart are out of stock.' };
      return res.redirect('/cart');
    }

    res.render('checkout', { title: 'Checkout | Leaf & Brew', cart: req.session.cart });
  } catch (err) { next(err); }
});

// ── POST /checkout ────────────────────────────────────────────
router.post('/checkout', requireLogin, async (req, res, next) => {
  const cart = req.session.cart || { items: [], total: 0 };
  if (!cart.items.length) {
    req.session.flash = { type: 'error', msg: 'Your cart is empty.' };
    return res.redirect('/cart');
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Insert order header
    const [orderResult] = await conn.execute(
      `INSERT INTO Orders (user_id, order_date, order_status)
       VALUES (?, CURDATE(), 'Pending')`,
      [req.session.user.user_id]
    );
    const orderId = orderResult.insertId;

    // First pass: lock all rows, verify stock, detect price drift
    const prodData = [];
    for (const item of cart.items) {
      const [[prod]] = await conn.execute(
        'SELECT stock_qty, price FROM Products WHERE product_id = ? FOR UPDATE',
        [item.product_id]
      );
      if (!prod || prod.stock_qty < item.qty) {
        const ooserr = new Error(
          `"${item.p_name}" only has ${prod ? prod.stock_qty : 0} unit(s) left in stock.`
        );
        ooserr._isOOS = true;
        throw ooserr;
      }
      prodData.push({ product_id: item.product_id, stock_qty: prod.stock_qty, price: parseFloat(prod.price) });
    }

    // If any price changed since the cart was loaded, abort and refresh the cart
    const drifted = prodData.filter((p, i) => Math.abs(p.price - cart.items[i].price) > 0.001);
    if (drifted.length) {
      await conn.rollback();
      drifted.forEach(d => {
        const ci = cart.items.find(i => i.product_id === d.product_id);
        if (ci) ci.price = d.price;
      });
      req.session.cart = recalcCart(cart);
      req.session.flash = {
        type: 'error',
        msg: 'Prices changed since you added these items. Please review your cart.'
      };
      return res.redirect('/cart');
    }

    // Second pass: insert line items and decrement stock
    for (let i = 0; i < cart.items.length; i++) {
      const item = cart.items[i];
      const prod = prodData[i];
      await conn.execute(
        `INSERT INTO OrderItem (order_id, product_id, qty, price_at_purchase) VALUES (?, ?, ?, ?)`,
        [orderId, item.product_id, item.qty, prod.price]
      );
      await conn.execute(
        'UPDATE Products SET stock_qty = stock_qty - ? WHERE product_id = ?',
        [item.qty, item.product_id]
      );
    }

    await conn.commit();
    req.session.cart  = { items: [], total: 0 };
    req.session.flash = { type: 'success', msg: 'Order placed successfully!' };
    res.redirect(`/orders/${orderId}`);
  } catch (err) {
    await conn.rollback();
    if (err._isOOS) {
      // Safe to show our own message
      req.session.flash = { type: 'error', msg: err.message };
    } else {
      console.error(err);
      req.session.flash = { type: 'error', msg: 'An error occurred while placing your order. Please try again.' };
    }
    res.redirect('/cart');
  } finally {
    conn.release();
  }
});

module.exports = router;
