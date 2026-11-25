'use strict';
require('dotenv').config();

const path    = require('path');
const express = require('express');
const session = require('express-session');
const { pool } = require('./db');
const { stars, price, fmtDate } = require('./helpers');

const app = express();

// ── View engine ──────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── Redirect old static Phase-3 HTML pages to real routes ────
app.get('/index.html',   (req, res) => res.redirect(301, '/'));
app.get('/product.html', (req, res) => res.redirect(301, '/'));
app.get('/admin.html',   (req, res) => res.redirect(301, '/admin'));
// Block any other .html file from being served as a static asset
app.use((req, res, next) => {
  if (/\.html$/i.test(req.path)) return res.redirect(301, '/');
  next();
});

// ── Serve placeholder.svg when any template requests placeholder.jpg ──
app.get('/img/placeholder.jpg', (req, res) => {
  res.setHeader('Content-Type', 'image/svg+xml');
  res.sendFile(path.join(__dirname, '../frontend/img/placeholder.svg'));
});

// ── Static files (CSS, images, JS) — HTML never served as index ──
app.use(express.static(path.join(__dirname, '../frontend'), { index: false }));

// ── Body parsing ──────────────────────────────────────────────
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ── Session ───────────────────────────────────────────────────
app.use(session({
  secret:            process.env.SESSION_SECRET || 'leaf_and_brew_secret',
  resave:            false,
  saveUninitialized: false,
  cookie:            { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// ── Template helpers (available in every EJS file) ───────────
app.locals.stars   = stars;
app.locals.price   = price;
app.locals.fmtDate = fmtDate;

// ── Inject session data into every response ───────────────────
app.use((req, res, next) => {
  res.locals.user  = req.session.user  || null;
  res.locals.cart  = req.session.cart  || { items: [], total: 0 };
  res.locals.flash = req.session.flash || null;
  if (req.session.flash) delete req.session.flash;
  next();
});

// ── Re-read user from DB on every authenticated request ───────
// Keeps role/name current after admin changes; detects deleted accounts.
app.use(async (req, res, next) => {
  if (!req.session.user) return next();
  try {
    const [[row]] = await pool.execute(
      'SELECT user_id, user_name, email, user_type FROM Users WHERE user_id = ?',
      [req.session.user.user_id]
    );
    if (!row) {
      // Account deleted — issue a fresh session so the flash survives the redirect
      return req.session.regenerate(err => {
        if (err) return next(err);
        req.session.flash = { type: 'error', msg: 'Your account no longer exists. Please log in.' };
        res.locals.user = null;
        res.locals.cart = { items: [], total: 0 };
        res.redirect('/login');
      });
    }
    req.session.user = row;
    res.locals.user  = row;
    next();
  } catch (err) { next(err); }
});

// ── Routes ────────────────────────────────────────────────────
app.use('/',      require('./routes/auth'));
app.use('/',      require('./routes/account'));
app.use('/',      require('./routes/shop'));
app.use('/',      require('./routes/cart'));
app.use('/',      require('./routes/checkout'));
app.use('/',      require('./routes/orders'));
app.use('/admin', require('./routes/admin'));
app.use('/sqli',  require('./routes/sqli'));

// ── 404 ───────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render('404', { title: 'Page Not Found', message: "The page you're looking for doesn't exist." });
});

// ── Global error handler ──────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', {
    title:   'Something went wrong',
    message: 'An unexpected error occurred. Please try again.'
  });
});

// ── Start ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Leaf & Brew running at http://localhost:${PORT}`);
});
