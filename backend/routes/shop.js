'use strict';
const router   = require('express').Router();
const { pool } = require('../db');
const { withImg, getGallery, text } = require('../helpers');

// Valid sort columns (whitelist — never interpolate user input directly into SQL)
const SORT_MAP = {
  featured:   'product_id ASC',
  price_asc:  'price ASC',
  price_desc: 'price DESC',
  rating:     'avg_rating DESC',
  name:       'p_name ASC'
};

// ── GET / — Shop page ─────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const q    = text(req.query.q);
    const sort = text(req.query.sort);
    // tea_type can appear multiple times: ?tea_type=Green&tea_type=Black
    const teaTypes = req.query.tea_type
      ? [].concat(req.query.tea_type)
      : [];

    // Swap min/max if inverted
    let rawMin = req.query.min_price, rawMax = req.query.max_price;
    const mnVal = (rawMin !== undefined && rawMin !== '') ? parseFloat(rawMin) : null;
    const mxVal = (rawMax !== undefined && rawMax !== '') ? parseFloat(rawMax) : null;
    if (mnVal !== null && mxVal !== null && !isNaN(mnVal) && !isNaN(mxVal) && mnVal > mxVal) {
      [rawMin, rawMax] = [rawMax, rawMin];
    }

    const where  = ['1=1'];
    const params = [];

    if (q && q.trim()) {
      where.push('(p_name LIKE ? OR description LIKE ?)');
      params.push(`%${q.trim()}%`, `%${q.trim()}%`);
    }
    if (teaTypes.length) {
      where.push(`tea_type IN (${teaTypes.map(() => '?').join(',')})`);
      params.push(...teaTypes);
    }
    if (rawMin !== undefined && rawMin !== '') {
      const mn = parseFloat(rawMin);
      if (!isNaN(mn) && mn >= 0) { where.push('price >= ?'); params.push(mn); }
    }
    if (rawMax !== undefined && rawMax !== '') {
      const mx = parseFloat(rawMax);
      if (!isNaN(mx) && mx >= 0) { where.push('price <= ?'); params.push(mx); }
    }

    const orderBy = SORT_MAP[sort] || SORT_MAP.featured;

    const sql = `
      SELECT *
      FROM v_product_summary
      WHERE ${where.join(' AND ')}
      ORDER BY ${orderBy}`;

    const [products] = await pool.execute(sql, params);

    const query = {
      q:         q || '',
      tea_type:  teaTypes,
      min_price: rawMin || '',
      max_price: rawMax || '',
      sort:      sort || 'featured'
    };
    res.locals.query = query;   // expose to header partial for search-box value
    res.render('shop', {
      title:    'Shop Tea | Leaf & Brew',
      products: withImg(products),
      query
    });
  } catch (err) { next(err); }
});

// ── GET /product/:id ──────────────────────────────────────────
router.get('/product/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(404).render('404', {
      title: 'Product Not Found',
      message: 'That product does not exist.'
    });

    // Product detail — use the v_product_summary view
    const [[product]] = await pool.execute(
      'SELECT * FROM v_product_summary WHERE product_id = ?',
      [id]
    );
    if (!product) return res.status(404).render('404', {
      title: 'Product Not Found',
      message: 'That product does not exist or may have been removed.'
    });

    // Reviews
    const [reviews] = await pool.execute(
      `SELECT r.*, u.user_name
       FROM Reviews r
       JOIN Users u ON r.user_id = u.user_id
       WHERE r.product_id = ?
       ORDER BY r.review_date DESC`,
      [id]
    );

    // Logged-in user's own review + purchase check
    let myReview     = null;
    let hasPurchased = false;
    if (req.session.user) {
      const [[rev]] = await pool.execute(
        'SELECT * FROM Reviews WHERE user_id = ? AND product_id = ?',
        [req.session.user.user_id, id]
      );
      myReview = rev || null;

      const [[purchRow]] = await pool.execute(
        `SELECT EXISTS(
           SELECT 1 FROM Orders o
           JOIN OrderItem oi ON o.order_id = oi.order_id
           WHERE o.user_id = ? AND oi.product_id = ? AND o.order_status <> 'Cancelled'
         ) AS has_purchased`,
        [req.session.user.user_id, id]
      );
      hasPurchased = !!purchRow.has_purchased;
    }

    // Related products — use the view
    const [related] = await pool.execute(
      'SELECT * FROM v_product_summary WHERE tea_type = ? AND product_id <> ? LIMIT 3',
      [product.tea_type, id]
    );

    const p = withImg(product);

    res.render('product', {
      title:   `${product.p_name} | Leaf & Brew`,
      product: p,
      gallery: getGallery(product.product_id, p.img),
      reviews,
      myReview,
      hasPurchased,
      related: withImg(related)
    });
  } catch (err) { next(err); }
});

// ── POST /product/:id/review ──────────────────────────────────
router.post('/product/:id/review', async (req, res, next) => {
  if (!req.session.user) {
    req.session.flash = { type: 'error', msg: 'Please log in first.' };
    return res.redirect('/login?next=' + encodeURIComponent(`/product/${req.params.id}`));
  }
  try {
    const pid    = parseInt(req.params.id);
    const uid    = req.session.user.user_id;

    if (!pid || isNaN(pid)) return res.redirect('/');

    // Enforce purchase gate
    const [[purchRow]] = await pool.execute(
      `SELECT EXISTS(
         SELECT 1 FROM Orders o
         JOIN OrderItem oi ON o.order_id = oi.order_id
         WHERE o.user_id = ? AND oi.product_id = ? AND o.order_status <> 'Cancelled'
       ) AS has_purchased`,
      [uid, pid]
    );
    if (!purchRow.has_purchased) {
      req.session.flash = { type: 'error', msg: 'You can only review products you have purchased.' };
      return res.redirect(`/product/${pid}`);
    }

    const rating = parseInt(req.body.rating_value);
    const title  = text(req.body.review_title).trim().slice(0, 100);
    const str    = text(req.body.review_str).trim().slice(0, 500);

    if (![1,2,3,4,5].includes(rating)) {
      req.session.flash = { type: 'error', msg: 'Rating must be between 1 and 5.' };
      return res.redirect(`/product/${pid}`);
    }

    // INSERT … ON DUPLICATE KEY UPDATE (one review per user per product)
    await pool.execute(
      `INSERT INTO Reviews (user_id, product_id, rating_value, review_title, review_str, review_date)
       VALUES (?, ?, ?, ?, ?, CURDATE())
       ON DUPLICATE KEY UPDATE
         rating_value = VALUES(rating_value),
         review_title = VALUES(review_title),
         review_str   = VALUES(review_str),
         review_date  = CURDATE()`,
      [uid, pid, rating, title || null, str || null]
    );

    req.session.flash = { type: 'success', msg: 'Your review has been saved.' };
    res.redirect(`/product/${pid}`);
  } catch (err) { next(err); }
});

// ── POST /product/:id/review/delete ───────────────────────────
router.post('/product/:id/review/delete', async (req, res, next) => {
  if (!req.session.user) return res.redirect('/login');
  try {
    const pid = parseInt(req.params.id);
    const uid = req.session.user.user_id;
    await pool.execute(
      'DELETE FROM Reviews WHERE user_id = ? AND product_id = ?',
      [uid, pid]
    );
    req.session.flash = { type: 'success', msg: 'Your review has been deleted.' };
    res.redirect(`/product/${pid}`);
  } catch (err) { next(err); }
});

module.exports = router;
