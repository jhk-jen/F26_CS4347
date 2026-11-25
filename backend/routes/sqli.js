'use strict';
/*
 * Assignment 5 – SQL Injection Demo (Order Lookup by email + phone), one page: /sqli
 *
 * Prepared statements OFF -> lookupVulnerable(): the input is pasted into the SQL
 *   string and run with sqliPool.query(sql). A quote in the input ends the string
 *   literal early, so the rest of the input runs as SQL ("#" comments out the phone
 *   check, "OR 1=1" matches every row).
 *
 * Prepared statements ON  -> lookupSafe(): the SQL is fixed with ? placeholders and
 *   the input is sent separately with sqliPool.execute(sql, [email, phone]). MySQL
 *   treats the values as data only, so the same payloads match nothing.
 *
 * Both use the read-only leaf_sqli account (SELECT only, multipleStatements off),
 * so even the vulnerable path cannot change or drop data.
 */
const router       = require('express').Router();
const { sqliPool } = require('../db');

const BASE_SQL = `SELECT o.order_id, u.user_name, u.email, u.phone_no,
       o.order_date, o.order_status,
       COUNT(oi.product_id) AS item_count,
       ROUND(SUM(oi.qty * oi.price_at_purchase), 2) AS total
FROM Orders o
JOIN Users u ON o.user_id = u.user_id
LEFT JOIN OrderItem oi ON o.order_id = oi.order_id`;
const GROUP_BY = `\nGROUP BY o.order_id, u.user_name, u.email, u.phone_no, o.order_date, o.order_status`;

// The three inputs used in the demo; one click fills the form and runs it.
const PAYLOADS = [
  { label: '1. Normal lookup',        email: 'olivia.martinez@example.com',   phone: '(214) 917-2915' },
  { label: '2. Skip the phone check', email: "olivia.martinez@example.com' #", phone: '000' },
  { label: '3. Return every order',   email: "x' OR 1=1 #",                    phone: '000' }
];

// ── Prepared statements OFF: INTENTIONALLY VULNERABLE ─────────
async function lookupVulnerable(email, phone) {
  const sql = BASE_SQL + `\nWHERE u.email = '${email}' AND u.phone_no = '${phone}'` + GROUP_BY;
  const [rows] = await sqliPool.query(sql);           // runs the string exactly as built
  return rows;
}

// ── Prepared statements ON: SAFE ──────────────────────────────
async function lookupSafe(email, phone) {
  const sql = BASE_SQL + `\nWHERE u.email = ? AND u.phone_no = ?` + GROUP_BY;
  const [rows] = await sqliPool.execute(sql, [email, phone]);
  return rows;
}

// Split the SQL into pieces so the view can highlight the user's input and strike
// out what an injected "#" turned into a comment.
function vulnerableSegments(email, phone) {
  const parts = [
    ['sql', BASE_SQL + "\nWHERE u.email = '"], ['input', email],
    ['sql', "' AND u.phone_no = '"],           ['input', phone],
    ['sql', "'" + GROUP_BY]
  ];
  const chars = [];
  for (const [kind, text] of parts) for (const c of text) chars.push({ c, kind });
  let inComment = false;
  for (const ch of chars) {
    if (ch.c === '\n') inComment = false;
    else if (!inComment && ch.kind === 'input' && ch.c === '#') inComment = true;
    if (inComment) ch.kind = 'comment';
  }
  const segs = [];
  for (const ch of chars) {
    const last = segs[segs.length - 1];
    if (last && last.kind === ch.kind) last.text += ch.c; else segs.push({ kind: ch.kind, text: ch.c });
  }
  return segs;
}

function safeSegments() {
  return [
    { kind: 'sql', text: BASE_SQL + '\nWHERE u.email = ' }, { kind: 'param', text: '?' },
    { kind: 'sql', text: ' AND u.phone_no = ' },            { kind: 'param', text: '?' },
    { kind: 'sql', text: GROUP_BY }
  ];
}

router.get('/', (req, res) => {
  res.render('sqli/index', {
    title: 'SQL Injection Demo | Leaf & Brew', payloads: PAYLOADS,
    prepared: req.query.prepared === 'on', email: '', phone: '',
    results: null, dbError: null, segments: null
  });
});

router.post('/', async (req, res) => {
  const email    = req.body.email || '';
  const phone    = req.body.phone || '';
  const prepared = req.body.prepared === 'on';
  let results = [], dbError = null;
  try {
    results = prepared ? await lookupSafe(email, phone) : await lookupVulnerable(email, phone);
  } catch (err) { dbError = err.message; }
  res.render('sqli/index', {
    title: 'SQL Injection Demo | Leaf & Brew', payloads: PAYLOADS,
    prepared, email, phone, results, dbError,
    segments: prepared ? safeSegments() : vulnerableSegments(email, phone)
  });
});

// Old links keep working.
router.get('/vulnerable', (req, res) => res.redirect('/sqli'));
router.get('/safe',       (req, res) => res.redirect('/sqli?prepared=on'));

module.exports = router;
