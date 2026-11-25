-- ============================================================
-- Leaf & Brew - CS 4347 Phase 4 / Assignment 5
-- sqli_user.sql : creates a read-only MySQL account used ONLY
-- by the intentionally vulnerable SQL-injection demo route.
--
-- Using a restricted account means that even if an attacker
-- crafts an injection payload, they can only SELECT data —
-- they cannot INSERT, UPDATE, DELETE, or DROP anything.
--
-- Run once as the root (admin) MySQL user:
--   mysql -u root -p < db/sqli_user.sql
-- ============================================================

-- Create the user for every way the app can reach a local MySQL: by socket
-- name (localhost) or over TCP (127.0.0.1 / ::1). Some installs (e.g. Docker)
-- do not map 127.0.0.1 back to "localhost", so all three are listed.
-- Safe to re-run; IF NOT EXISTS skips users that already exist.
CREATE USER IF NOT EXISTS leaf_sqli@localhost IDENTIFIED BY sqli_readonly;
CREATE USER IF NOT EXISTS leaf_sqli@127.0.0.1 IDENTIFIED BY sqli_readonly;
CREATE USER IF NOT EXISTS leaf_sqli@::1       IDENTIFIED BY sqli_readonly;

-- Grant SELECT-only access on every table in leaf_and_brew
GRANT SELECT ON leaf_and_brew.* TO leaf_sqli@localhost;
GRANT SELECT ON leaf_and_brew.* TO leaf_sqli@127.0.0.1;
GRANT SELECT ON leaf_and_brew.* TO leaf_sqli@::1;

FLUSH PRIVILEGES;
