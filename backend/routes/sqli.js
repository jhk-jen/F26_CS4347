'use strict';
/*
 * Assignment 5 – SQL Injection Demo
 *
 * /sqli/vulnerable  builds the ORDER LOOKUP query by directly concatenating user
 *   input into the SQL string and executes it with pool.query(). An attacker can
 *   inject SQL that bypasses the phone check or returns every row in the table.
 *
 * /sqli/safe  uses pool.execute() with ? placeholders. The mysql2 driver passes
 *   the values to MySQL as separate protocol parameters; they are never interpreted
 *   as SQL syntax, so the same payloads return 0 rows.
 *
 * Both routes use the read-only leaf_sqli account (SELECT-only grants) so the
 * demo cannot accidentally modify or drop data even on the vulnerable route.
 */
const router     = require('express').Router();
const { sqliPool } = require('../db');

// Base query shared by both routes (column count must match if you try UNION injections)
const BASE_SQL = `
  SELECT o.order_id, u.user_name, u.email, u.phone_no,
         o.order_date, o.order_status,
         COUNT(oi.product_id)                     AS item_count,
         ROUND(SUM(oi.qty * oi.price_at_purchase), 2) AS total
  FROM Orders o
  JOIN Users u ON o.user_id = u.user_id
  LEFT JOIN OrderItem oi ON o.order_id = oi.order_id`;

// ── GET /sqli — landing page ──────────────────────────────────
router.get('/', (req, res) => {
  res.render('sqli/index', { title: 'SQL Injection Demo | Leaf & Brew' });
});

// ── GET /sqli/vulnerable — empty form ────────────────────────
router.get('/vulnerable', (req, res) => {
  res.render('sqli/vulnerable', {
    title: 'Vulnerable Route | SQLi Demo',
    results: null,
    executedSQL: null,
    email: '',
    phone: ''
  });
});

// ── POST /sqli/vulnerable ─────────────────────────────────────
// INTENTIONALLY VULNERABLE: user input is spliced directly into the SQL string.
router.post('/vulnerable', async (req, res) => {
  const email = req.body.email || '';
  const phone = req.body.phone || '';

  // ⚠ NEVER do this in real code — string concatenation allows SQL injection.
  const sql = BASE_SQL +
    `\n  WHERE u.email = '${email}' AND u.phone_no = '${phone}'` +
    `\n  GROUP BY o.order_id, u.user_name, u.email, u.phone_no, o.order_date, o.order_status`;

  let results = [];
  let dbError = null;
  try {
    // pool.query() (not execute) so the injected string runs as-is.
    const [rows] = await sqliPool.query(sql);
    results = rows;
  } catch (err) {
    dbError = err.message;
  }

  res.render('sqli/vulnerable', {
    title: 'Vulnerable Route | SQLi Demo',
    results,
    executedSQL: sql,
    dbError,
    email,
    phone
  });
});

// ── GET /sqli/safe — empty form ───────────────────────────────
router.get('/safe', (req, res) => {
  res.render('sqli/safe', {
    title: 'Safe Route | SQLi Demo',
    results: null,
    templateSQL: null,
    boundValues: null,
    email: '',
    phone: ''
  });
});

// ── POST /sqli/safe ───────────────────────────────────────────
// SAFE: uses pool.execute() with ? placeholders — the driver never interpolates
// user input into SQL syntax.
router.post('/safe', async (req, res) => {
  const email = req.body.email || '';
  const phone = req.body.phone || '';

  const templateSQL = BASE_SQL +
    `\n  WHERE u.email = ? AND u.phone_no = ?` +
    `\n  GROUP BY o.order_id, u.user_name, u.email, u.phone_no, o.order_date, o.order_status`;

  let results = [];
  let dbError = null;
  try {
    const [rows] = await sqliPool.execute(templateSQL, [email, phone]);
    results = rows;
  } catch (err) {
    dbError = err.message;
  }

  res.render('sqli/safe', {
    title: 'Safe Route | SQLi Demo',
    results,
    templateSQL,
    boundValues: [email, phone],
    dbError,
    email,
    phone
  });
});

module.exports = router;
