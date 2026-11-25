'use strict';
const router   = require('express').Router();
const { pool } = require('../db');
const { withImg, recalcCart } = require('../helpers');

function getCart(req) {
  if (!req.session.cart) req.session.cart = { items: [], total: 0 };
  return req.session.cart;
}

// ── POST /cart/add ────────────────────────────────────────────
// Guests are allowed to add to cart; login is only required at checkout.
router.post('/cart/add', async (req, res, next) => {
  try {
    const pid = parseInt(req.body.product_id);
    const qty = Math.max(1, parseInt(req.body.qty) || 1);

    if (isNaN(pid)) return res.redirect('/');

    const [[product]] = await pool.execute(
      'SELECT product_id, p_name, price, stock_qty, tea_type FROM Products WHERE product_id = ?',
      [pid]
    );
    if (!product) return res.redirect('/');

    const cart  = getCart(req);
    const exist = cart.items.find(i => i.product_id === pid);

    const addQty = exist ? exist.qty + qty : qty;
    if (addQty > product.stock_qty) {
      req.session.flash = { type: 'error', msg: `Only ${product.stock_qty} units in stock.` };
      return res.redirect(req.get('Referer') || '/');
    }

    if (exist) {
      exist.qty   = addQty;
      exist.price = parseFloat(product.price); // keep price fresh
    } else {
      const p = withImg(product);
      cart.items.push({ product_id: pid, p_name: product.p_name, price: parseFloat(product.price), qty, img: p.img });
    }

    req.session.cart = recalcCart(cart);
    req.session.flash = { type: 'success', msg: `${product.p_name} added to cart.` };
    res.redirect(req.get('Referer') || '/');
  } catch (err) { next(err); }
});

// ── GET /cart ─────────────────────────────────────────────────
// Refresh prices and names from DB on every cart view so stale data is fixed.
router.get('/cart', async (req, res, next) => {
  try {
    const cart = getCart(req);
    if (cart.items.length) {
      const ids = cart.items.map(i => i.product_id);
      const [rows] = await pool.execute(
        `SELECT product_id, p_name, price, stock_qty FROM Products WHERE product_id IN (${ids.map(() => '?').join(',')})`,
        ids
      );
      const lookup = Object.fromEntries(rows.map(r => [r.product_id, r]));
      const oosNames = [];
      cart.items = cart.items
        .filter(item => {
          if (!lookup[item.product_id]) return false;   // product deleted
          if (lookup[item.product_id].stock_qty === 0) {
            oosNames.push(item.p_name);
            return false;                               // out of stock → remove
          }
          return true;
        })
        .map(item => {
          const p = lookup[item.product_id];
          return { ...item, p_name: p.p_name, price: parseFloat(p.price) };
        });
      req.session.cart = recalcCart(cart);
      res.locals.cart  = req.session.cart;        // keep template in sync
      if (oosNames.length) {
        // Set res.locals.flash directly — flash middleware already ran, so
        // req.session.flash would only appear on the *next* page.
        res.locals.flash = {
          type: 'error',
          msg: oosNames.map(n => `${n} is now out of stock and was removed from your cart.`).join(' ')
        };
      }
    }
    res.render('cart', { title: 'Your Cart | Leaf & Brew' });
  } catch (err) { next(err); }
});

// ── POST /cart/remove ─────────────────────────────────────────
router.post('/cart/remove', (req, res) => {
  const pid  = parseInt(req.body.product_id);
  const cart = getCart(req);
  cart.items = cart.items.filter(i => i.product_id !== pid);
  req.session.cart = recalcCart(cart);
  res.redirect('/cart');
});

// ── POST /cart/update ─────────────────────────────────────────
// Form uses name="qty_<id>" (not nested qty[id]) to avoid qs array coercion.
router.post('/cart/update', async (req, res, next) => {
  try {
    const cart = getCart(req);

    if (!cart.items.length) return res.redirect('/cart');

    // Build { product_id -> qty } from fields named qty_<id>
    const qtys = {};
    for (const [key, val] of Object.entries(req.body)) {
      const m = key.match(/^qty_(\d+)$/);
      if (m) qtys[parseInt(m[1])] = val;
    }

    // Fetch current stock for all items in one query
    const ids = cart.items.map(i => i.product_id);
    const [rows] = await pool.execute(
      `SELECT product_id, stock_qty FROM Products WHERE product_id IN (${ids.map(() => '?').join(',')})`,
      ids
    );
    const stockMap = Object.fromEntries(rows.map(r => [r.product_id, r.stock_qty]));

    let capped = false;
    const oosNames = [];
    cart.items = cart.items
      .map(item => {
        let q = parseInt(qtys[item.product_id]);
        if (isNaN(q) || q <= 0) return null;         // qty 0 or blank → remove
        const max = stockMap[item.product_id] ?? 0;
        if (max === 0) { oosNames.push(item.p_name); return null; } // out of stock → remove
        if (q > max) { q = max; capped = true; }
        return { ...item, qty: q };
      })
      .filter(Boolean);

    req.session.cart = recalcCart(cart);
    if (oosNames.length) {
      req.session.flash = {
        type: 'error',
        msg: oosNames.map(n => `${n} is now out of stock and was removed from your cart.`).join(' ')
              + (capped ? ' Some other quantities were reduced to match current stock.' : '')
      };
    } else if (capped) {
      req.session.flash = { type: 'error', msg: 'Some quantities were reduced to match current stock.' };
    }
    res.redirect('/cart');
  } catch (err) { next(err); }
});

module.exports = router;
