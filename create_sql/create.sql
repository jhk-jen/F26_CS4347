-- ============================================================
-- Leaf & Brew - CS 4347 Phase 3, Task C
-- create.sql : creates all tables for the project database
-- Requires MySQL 8.0.16 or later (CHECK constraints are enforced)
-- ============================================================

CREATE DATABASE IF NOT EXISTS leaf_and_brew;
USE leaf_and_brew;

-- Drop child tables first so foreign keys do not block the drops
DROP TABLE IF EXISTS Reviews;
DROP TABLE IF EXISTS OrderItem;
DROP TABLE IF EXISTS Orders;
DROP TABLE IF EXISTS Products;
DROP TABLE IF EXISTS Users;
DROP TABLE IF EXISTS DailyMetrics;

-- ------------------------------------------------------------
-- Parent tables
-- ------------------------------------------------------------

CREATE TABLE Users (
    user_id       INT            NOT NULL AUTO_INCREMENT,
    user_type     VARCHAR(20)    NOT NULL,
    user_name     VARCHAR(100)   NOT NULL,
    email         VARCHAR(255)   NOT NULL,
    password      VARCHAR(255)   NOT NULL,
    address       VARCHAR(255),
    phone_no      VARCHAR(20),
    payment_info  VARCHAR(255),
    PRIMARY KEY (user_id),
    UNIQUE (email)                          -- FD2: email -> all attributes
);

CREATE TABLE Products (
    product_id    INT            NOT NULL AUTO_INCREMENT,
    p_name        VARCHAR(100)   NOT NULL,
    tea_type      VARCHAR(50),
    price         DECIMAL(10, 2) NOT NULL,
    stock_qty     INT            NOT NULL DEFAULT 0,
    description   VARCHAR(255),
    PRIMARY KEY (product_id),
    UNIQUE (p_name),                        -- FD2: p_name -> all attributes
    CHECK (price >= 0),
    CHECK (stock_qty >= 0)
);

CREATE TABLE DailyMetrics (
    date          DATE           NOT NULL,
    visits        INT            NOT NULL DEFAULT 0,
    PRIMARY KEY (date),
    CHECK (visits >= 0)
);

-- ------------------------------------------------------------
-- Orders (references Users)
-- ------------------------------------------------------------

CREATE TABLE Orders (
    order_id      INT            NOT NULL AUTO_INCREMENT,
    user_id       INT            NOT NULL,
    order_date    DATE           NOT NULL,
    order_status  VARCHAR(30)    NOT NULL DEFAULT 'Pending',
    PRIMARY KEY (order_id),
    FOREIGN KEY (user_id) REFERENCES Users(user_id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
);

-- ------------------------------------------------------------
-- Weak entities (reference Orders, Products, Users)
-- ------------------------------------------------------------

CREATE TABLE OrderItem (
    order_id           INT            NOT NULL,
    product_id         INT            NOT NULL,
    qty                INT            NOT NULL,
    price_at_purchase  DECIMAL(10, 2) NOT NULL,
    PRIMARY KEY (order_id, product_id),
    FOREIGN KEY (order_id) REFERENCES Orders(order_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    FOREIGN KEY (product_id) REFERENCES Products(product_id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CHECK (qty > 0),
    CHECK (price_at_purchase >= 0)
);

CREATE TABLE Reviews (
    user_id       INT            NOT NULL,
    product_id    INT            NOT NULL,
    rating_value  INT            NOT NULL,
    review_title  VARCHAR(100),
    review_str    VARCHAR(500),
    review_date   DATE           NOT NULL,
    PRIMARY KEY (user_id, product_id),
    FOREIGN KEY (user_id) REFERENCES Users(user_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    FOREIGN KEY (product_id) REFERENCES Products(product_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CHECK (rating_value BETWEEN 1 AND 5)
);
