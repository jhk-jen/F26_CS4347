-- ============================================================
-- Leaf & Brew - CS 4347 Phase 3, Task C
-- load.sql : loads the CSV files in data/ into the tables
--
-- Run from the db/ folder (paths below are relative to it):
--   mysql --local-infile=1 -u root -p < create.sql
--   mysql --local-infile=1 -u root -p < load.sql
-- If the server refuses LOCAL INFILE, run once as root:
--   SET GLOBAL local_infile = 1;
-- MySQL Workbench / XAMPP: run create.sql, then this file, with
-- OPT_LOCAL_INFILE=1 set on the connection (Workbench: Advanced tab).
--
-- Data comes from generate_data.py. \N in a CSV field loads as NULL.
-- All dummy accounts use the password "password123" (stored bcrypt-hashed).
-- ============================================================

USE leaf_and_brew;

-- Parents first, then children, so every foreign key already exists.

LOAD DATA LOCAL INFILE 'data/Users.csv'
INTO TABLE Users
FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 LINES
(user_id, user_type, user_name, email, password, address, phone_no, payment_info);

LOAD DATA LOCAL INFILE 'data/Products.csv'
INTO TABLE Products
FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 LINES
(product_id, p_name, tea_type, price, stock_qty, description);

LOAD DATA LOCAL INFILE 'data/Orders.csv'
INTO TABLE Orders
FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 LINES
(order_id, user_id, order_date, order_status);

LOAD DATA LOCAL INFILE 'data/OrderItem.csv'
INTO TABLE OrderItem
FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 LINES
(order_id, product_id, qty, price_at_purchase);

LOAD DATA LOCAL INFILE 'data/Reviews.csv'
INTO TABLE Reviews
FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 LINES
(user_id, product_id, rating_value, review_title, review_str, review_date);

LOAD DATA LOCAL INFILE 'data/DailyMetrics.csv'
INTO TABLE DailyMetrics
FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 LINES
(date, visits);
