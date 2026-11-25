-- ============================================================
-- Leaf & Brew - CS 4347 Phase 4
-- views.sql : SQL VIEWs for reporting and product summaries
-- Run after create.sql and load.sql:
--   mysql -u root -p leaf_and_brew < db/views.sql
-- ============================================================

USE leaf_and_brew;

-- ------------------------------------------------------------
-- v_product_summary
-- Each product with its average rating and review count.
-- Used by the shop page (GET /), product detail page (GET /product/:id),
-- and related products section.
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- v_sales_by_tea_type
-- Revenue, unit sales, and order count grouped by tea type.
-- Used by the Admin > Report page (GROUP BY aggregate demo).
-- Excludes Cancelled orders so totals reflect actual sales.
-- ------------------------------------------------------------
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
