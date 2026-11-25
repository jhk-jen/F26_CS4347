'use strict';
require('dotenv').config();
const mysql = require('mysql2/promise');

// Main application pool — full privileges, used everywhere except the SQLi demo.
const pool = mysql.createPool({
  host:             process.env.DB_HOST || 'localhost',
  user:             process.env.DB_USER || 'root',
  password:         process.env.DB_PASS || '',
  database:         process.env.DB_NAME || 'leaf_and_brew',
  waitForConnections: true,
  connectionLimit:  10,
  dateStrings:      true   // return DATE columns as 'YYYY-MM-DD' strings
});

// Restricted pool for the SQL-injection demo.
// leaf_sqli has SELECT-only grants, so injected payloads cannot modify data.
// multipleStatements is explicitly false to prevent stacked queries (;DROP TABLE…).
const sqliPool = mysql.createPool({
  host:               process.env.DB_HOST || 'localhost',
  user:               process.env.SQLI_USER || 'leaf_sqli',
  password:           process.env.SQLI_PASS || 'sqli_readonly',
  database:           process.env.DB_NAME  || 'leaf_and_brew',
  waitForConnections: true,
  connectionLimit:    5,
  multipleStatements: false,
  dateStrings:        true
});

module.exports = { pool, sqliPool };
