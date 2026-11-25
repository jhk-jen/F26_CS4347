# Leaf & Brew – Report Materials

**CS 4347 Team 4 · Final Report – due Dec 4, 2026**

This document contains the sample SQL statements, results, and schema elements needed for the Results section of the final report.

---

## Schema Overview

```sql
Users(user_id PK, user_type, user_name, email, password, address, phone_no, payment_info)
Products(product_id PK, p_name, tea_type, price, stock_qty, description)
DailyMetrics(date PK, visits)
Orders(order_id PK, user_id FK→Users, order_date, order_status)
OrderItem(order_id FK→Orders, product_id FK→Products, qty, price_at_purchase) PK(order_id,product_id)
Reviews(user_id FK→Users, product_id FK→Products, rating_value, review_title, review_str, review_date) PK(user_id,product_id)
```

---

## Sample SELECT

### Shop page — product list with avg rating and filter

```sql
SELECT p.*,
       ROUND(COALESCE(AVG(r.rating_value), 0), 1) AS avg_rating,
       COUNT(r.user_id)                            AS review_count
FROM Products p
LEFT JOIN Reviews r ON p.product_id = r.product_id
WHERE p.tea_type IN ('Green', 'Black')
  AND p.price <= 20
GROUP BY p.product_id
ORDER BY avg_rating DESC;
```

**Example output:**

| product_id | p_name           | tea_type | price | stock_qty | avg_rating | review_count |
|------------|------------------|----------|-------|-----------|------------|--------------|
| 1          | Sencha Green Tea | Green    | 12.00 | 53        | 5.0        | 5            |
| 8          | Jasmine Green Tea| Green    | 13.00 | 30        | 4.3        | 2            |
| 2          | Earl Grey        | Black    | 14.00 | 80        | 4.3        | 7            |

---

### Product detail — reviews joined with Users

```sql
SELECT r.rating_value, r.review_title, r.review_str, r.review_date, u.user_name
FROM Reviews r
JOIN Users u ON r.user_id = u.user_id
WHERE r.product_id = 1
ORDER BY r.review_date DESC;
```

**Example output:**

| rating_value | review_title    | review_str                      | review_date | user_name    |
|--------------|-----------------|---------------------------------|-------------|--------------|
| 5            | Best I've had   | Better than anything from …     | 2026-11-05  | Grace Walker |
| 4            | Really good     | Great flavor, just a touch …    | 2026-11-05  | Noah Brown   |
| 5            | Will reorder    | Arrived fast and tastes …       | 2026-10-27  | Michael Johnson |

---

### My orders — aggregated per order

```sql
SELECT o.order_id, o.order_date, o.order_status,
       COUNT(oi.product_id)               AS item_count,
       SUM(oi.qty * oi.price_at_purchase) AS total
FROM Orders o
LEFT JOIN OrderItem oi ON o.order_id = oi.order_id
WHERE o.user_id = 5
GROUP BY o.order_id, o.order_date, o.order_status
ORDER BY o.order_date DESC;
```

**Example output (user_id=5, Sophia Chen):**

| order_id | order_date | order_status | item_count | total  |
|----------|------------|--------------|------------|--------|
| 1056     | 2026-11-01 | Delivered    | 2          | 84.00  |
| 1041     | 2026-09-12 | Shipped      | 2          | 47.00  |
| 1021     | 2026-10-15 | Delivered    | 3          | 94.00  |

---

### Admin orders — all orders with customer info

```sql
SELECT o.order_id, u.user_name, u.email, o.order_date, o.order_status,
       COUNT(oi.product_id)                     AS item_count,
       SUM(oi.qty * oi.price_at_purchase)       AS total
FROM Orders o
JOIN Users u ON o.user_id = u.user_id
LEFT JOIN OrderItem oi ON o.order_id = oi.order_id
WHERE o.order_status = 'Shipped'
GROUP BY o.order_id, u.user_name, u.email, o.order_date, o.order_status
ORDER BY o.order_date DESC;
```

---

## Sample INSERT (Create)

### Checkout — place an order (inside a transaction)

```sql
-- Step 1: insert order header
INSERT INTO Orders (user_id, order_date, order_status)
VALUES (5, CURDATE(), 'Pending');

-- Step 2: insert each line item (price_at_purchase locks in the current price)
INSERT INTO OrderItem (order_id, product_id, qty, price_at_purchase)
VALUES (LAST_INSERT_ID(), 1, 2, 12.00);

-- Step 3: decrement stock
UPDATE Products SET stock_qty = stock_qty - 2 WHERE product_id = 1;
```

### Write a review (upsert)

```sql
INSERT INTO Reviews (user_id, product_id, rating_value, review_title, review_str, review_date)
VALUES (5, 2, 4, 'Solid choice', 'Good everyday tea with nice aroma.', CURDATE())
ON DUPLICATE KEY UPDATE
  rating_value = VALUES(rating_value),
  review_title = VALUES(review_title),
  review_str   = VALUES(review_str),
  review_date  = CURDATE();
```

---

## Sample UPDATE

### Admin — update order status

```sql
UPDATE Orders
SET order_status = 'Delivered'
WHERE order_id = 1011;
```

### Admin — cancel order and restore stock (transaction)

Cancelling an order runs inside a transaction so that stock is always restored atomically. If any step fails, the whole operation rolls back.

```sql
START TRANSACTION;

-- Restore stock for every line item in the order
UPDATE Products SET stock_qty = stock_qty + 2 WHERE product_id = 1;
UPDATE Products SET stock_qty = stock_qty + 1 WHERE product_id = 3;

-- Mark the order as Cancelled
UPDATE Orders SET order_status = 'Cancelled' WHERE order_id = 1056;

COMMIT;
```

Cancelled orders cannot be re-activated (the status form is hidden on the order-detail page once `order_status = 'Cancelled'`).

### Admin — change user role

```sql
UPDATE Users
SET user_type = 'Staff'
WHERE user_id = 5;
```

### Admin — edit product

```sql
UPDATE Products
SET p_name='Sencha Green Tea', tea_type='Green', price=13.50, stock_qty=60, description='Updated description.'
WHERE product_id = 1;
```

---

## Sample DELETE

### Admin — delete a product (succeeds when no OrderItem references it)

```sql
DELETE FROM Products WHERE product_id = 9;
-- If product_id appears in OrderItem, MySQL raises ER_ROW_IS_REFERENCED_2 (FK RESTRICT).
-- The app catches this and shows a friendly error instead of crashing.
```

### Customer — delete own review

```sql
DELETE FROM Reviews
WHERE user_id = 5 AND product_id = 1;
```

---

## Views (db/views.sql)

### View 1: v_product_summary

Used by the **shop page** (`GET /`) and **product detail page** (`GET /product/:id`) to avoid repeating the `LEFT JOIN Reviews … GROUP BY` aggregation inline. The shop route queries `SELECT * FROM v_product_summary WHERE …` with the same filter/sort params; the product detail route does `SELECT * FROM v_product_summary WHERE product_id = ?`.

```sql
CREATE OR REPLACE VIEW v_product_summary AS
SELECT
    p.product_id,
    p.p_name,
    p.tea_type,
    p.price,
    p.stock_qty,
    p.description,
    ROUND(COALESCE(AVG(r.rating_value), 0), 1) AS avg_rating,
    COUNT(r.user_id)                            AS review_count
FROM Products p
LEFT JOIN Reviews r ON p.product_id = r.product_id
GROUP BY p.product_id, p.p_name, p.tea_type, p.price, p.stock_qty, p.description;
```

**Sample query and output:**
```sql
SELECT p_name, avg_rating, review_count
FROM v_product_summary
ORDER BY avg_rating DESC;
```

| p_name            | avg_rating | review_count |
|-------------------|------------|--------------|
| Sencha Green Tea  | 4.8        | 5            |
| Ceremonial Matcha | 4.6        | 5            |
| Silver Needle     | 4.4        | 5            |
| Jasmine Green Tea | 4.3        | 3            |

---

### View 2: v_sales_by_tea_type

```sql
CREATE OR REPLACE VIEW v_sales_by_tea_type AS
SELECT
    p.tea_type,
    COUNT(DISTINCT o.order_id)              AS order_count,
    SUM(oi.qty)                             AS total_units,
    ROUND(SUM(oi.qty * oi.price_at_purchase), 2) AS total_revenue
FROM Products p
JOIN OrderItem oi ON p.product_id = oi.product_id
JOIN Orders   o  ON oi.order_id   = o.order_id
WHERE o.order_status <> 'Cancelled'
GROUP BY p.tea_type
ORDER BY total_revenue DESC;
```

**Sample output:**
```sql
SELECT * FROM v_sales_by_tea_type;
```

| tea_type | order_count | total_units | total_revenue |
|----------|-------------|-------------|---------------|
| Matcha   | 20          | 44          | 1176.80       |
| Oolong   | 22          | 54          | 854.40        |
| Black    | 24          | 55          | 762.90        |
| White    | 20          | 47          | 741.60 (est.) |
| Pu-erh   | 24          | 56          | 970.20 (est.) |
| Green    | 24          | 68          | 834.00 (est.) |
| Herbal   | 23          | 56          | 582.00 (est.) |

---

## SQL Injection Demo Queries

### Vulnerable (string concatenation — NEVER do this in production)

```sql
-- User inputs: email = "olivia.martinez@example.com' #", phone = "anything_wrong"
-- Resulting SQL (injected):
SELECT o.order_id, u.user_name, u.email, u.phone_no, o.order_date, o.order_status,
       COUNT(oi.product_id) AS item_count,
       ROUND(SUM(oi.qty * oi.price_at_purchase), 2) AS total
FROM Orders o
JOIN Users u ON o.user_id = u.user_id
LEFT JOIN OrderItem oi ON o.order_id = oi.order_id
WHERE u.email = 'olivia.martinez@example.com' #' AND u.phone_no = 'anything_wrong'
GROUP BY o.order_id, u.user_name, u.email, u.phone_no, o.order_date, o.order_status;
-- The # comments out the phone check → Olivia's 7 orders returned without her phone
```

### Safe (prepared statement — user input never touches SQL syntax)

```sql
-- Template SQL (unchanged regardless of input):
SELECT o.order_id, u.user_name, u.email, u.phone_no, o.order_date, o.order_status,
       COUNT(oi.product_id) AS item_count,
       ROUND(SUM(oi.qty * oi.price_at_purchase), 2) AS total
FROM Orders o
JOIN Users u ON o.user_id = u.user_id
LEFT JOIN OrderItem oi ON o.order_id = oi.order_id
WHERE u.email = ? AND u.phone_no = ?
GROUP BY o.order_id, u.user_name, u.email, u.phone_no, o.order_date, o.order_status;

-- Bound values: ["olivia.martinez@example.com' #", "anything_wrong"]
-- The ' and # are treated as literal characters in the string — 0 rows returned.
```
