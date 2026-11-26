'use strict';
const router   = require('express').Router();
const bcrypt   = require('bcryptjs');
const { pool } = require('../db');
const { text } = require('../helpers');

// ── GET /login ────────────────────────────────────────────────
router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  const next = text(req.query.next);
  res.render('login', { title: 'Log In', errors: [], old: {}, next });
});

// ── POST /login ───────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const email    = text(req.body.email);
  const password = text(req.body.password);
  // next param comes from a hidden field in the form
  const nextRaw  = text(req.body.next).trim();
  // Only allow relative paths — ignore anything that starts with // or a scheme
  const nextSafe = /^\/(?![\/\\])/.test(nextRaw) ? nextRaw : '';
  const errors   = [];

  if (!email || !email.trim())    errors.push('Email is required.');
  if (!password)                  errors.push('Password is required.');

  if (errors.length) {
    return res.render('login', { title: 'Log In', errors, old: { email }, next: nextSafe });
  }

  try {
    const [[user]] = await pool.execute(
      'SELECT * FROM Users WHERE email = ?',
      [email.trim().toLowerCase()]
    );

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.render('login', {
        title: 'Log In',
        errors: ['Incorrect email or password.'],
        old: { email },
        next: nextSafe
      });
    }

    const userData = {
      user_id:   user.user_id,
      user_name: user.user_name,
      email:     user.email,
      user_type: user.user_type
    };
    const dest = nextSafe || (
      ['Owner', 'Staff'].includes(user.user_type) ? '/admin' : '/'
    );

    // Regenerate session to prevent session fixation; keep cart
    const savedCart = req.session.cart;
    req.session.regenerate(function (err) {
      if (err) {
        console.error(err);
        return res.render('login', { title: 'Log In', errors: ['A server error occurred.'], old: { email }, next: nextSafe });
      }
      req.session.user = userData;
      req.session.cart = savedCart || { items: [], total: 0 };
      res.redirect(dest);
    });
  } catch (err) {
    console.error(err);
    res.render('login', {
      title: 'Log In',
      errors: ['A server error occurred. Please try again.'],
      old: { email },
      next: nextSafe
    });
  }
});

// ── GET /register ─────────────────────────────────────────────
router.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/');
  const next = text(req.query.next);
  res.render('register', { title: 'Create Account', errors: [], old: {}, next });
});

// ── POST /register ────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const user_name        = text(req.body.user_name);
  const email            = text(req.body.email);
  const password         = text(req.body.password);
  const confirm_password = text(req.body.confirm_password);
  const address          = text(req.body.address);
  const phone_no         = text(req.body.phone_no);
  const nextRaw  = text(req.body.next).trim();
  const nextSafe = /^\/(?![\/\\])/.test(nextRaw) ? nextRaw : '';
  const errors = [];

  if (!user_name || !user_name.trim())       errors.push('Full name is required.');
  else if (user_name.trim().length > 100)    errors.push('Full name must be 100 characters or fewer.');
  if (!email    || !email.trim())            errors.push('Email is required.');
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
                                             errors.push('Enter a valid email address.');
  else if (email.trim().length > 255)        errors.push('Email must be 255 characters or fewer.');
  if (!password)                             errors.push('Password is required.');
  else if (password.length < 6)             errors.push('Password must be at least 6 characters.');
  if (password !== confirm_password)         errors.push('Passwords do not match.');
  if (address  && address.trim().length  > 255) errors.push('Address must be 255 characters or fewer.');
  if (phone_no && phone_no.trim().length > 20)  errors.push('Phone number must be 20 characters or fewer.');

  const old = { user_name, email, address, phone_no };

  if (errors.length) {
    return res.render('register', { title: 'Create Account', errors, old, next: nextSafe });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.execute(
      `INSERT INTO Users (user_type, user_name, email, password, address, phone_no)
       VALUES ('Customer', ?, ?, ?, ?, ?)`,
      [
        user_name.trim(),
        email.trim().toLowerCase(),
        hash,
        address ? address.trim() : null,
        phone_no ? phone_no.trim() : null
      ]
    );

    // Auto-login: regenerate session to prevent session fixation, then set user
    const savedCart = req.session.cart;
    req.session.regenerate(function (err) {
      if (err) {
        console.error(err);
        return res.render('register', {
          title: 'Create Account',
          errors: ['A server error occurred. Please try again.'],
          old,
          next: nextSafe
        });
      }
      req.session.user = {
        user_id:   result.insertId,
        user_name: user_name.trim(),
        email:     email.trim().toLowerCase(),
        user_type: 'Customer'
      };
      req.session.cart  = savedCart || { items: [], total: 0 };
      req.session.flash = { type: 'success', msg: 'Welcome! Your account has been created.' };
      res.redirect(nextSafe || '/');
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.render('register', {
        title: 'Create Account',
        errors: ['An account with that email already exists.'],
        old,
        next: nextSafe
      });
    }
    console.error(err);
    res.render('register', {
      title: 'Create Account',
      errors: ['A server error occurred. Please try again.'],
      old,
      next: nextSafe
    });
  }
});

// ── GET /logout ───────────────────────────────────────────────
router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

module.exports = router;
