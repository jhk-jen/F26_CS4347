# Leaf & Brew (CS 4347 Team 4)

An online tea shop. Customers browse, filter, and order tea and leave reviews. Staff and owners use an admin dashboard for traffic, stock, orders, users, and reports.

## Tech Stack

| Layer    | Choice |
|----------|--------|
| Database | MySQL 8.4 (Homebrew) |
| Backend  | Node.js 24 + Express 4, `mysql2`, EJS templates |
| Auth     | `express-session`, passwords hashed with `bcryptjs` |
| Frontend | HTML + CSS (no framework) served as Express static files |

## Project Layout

```
backend/        Express server, routes, EJS views
  server.js     — app entry point
  db.js         — mysql2 promise pools
  helpers.js    — shared utilities (image slugs, FLAVOR map, stars, date format)
  routes/       — auth, shop, cart, checkout, orders, admin, sqli
  views/        — EJS templates (partials/, admin/, sqli/)
db/
  create.sql    — creates leaf_and_brew database and all 6 tables
  load.sql      — loads the CSV seed data (run after create.sql)
  views.sql     — creates v_product_summary and v_sales_by_tea_type
  sqli_user.sql — creates the read-only leaf_sqli MySQL account
  generate_data.py — generates the seed CSVs (stdlib only, fixed seed)
  data/         — Users, Products, Orders, OrderItem, Reviews, DailyMetrics CSVs
frontend/       — HTML, CSS, images (served as static files by Express)
docs/           — Report materials
```

---

## Prerequisites (Mac / Homebrew)

**Node.js 24**
```bash
brew install node        # or use nvm
node -v                  # should print v24.x.x
```

**MySQL 8.4**
```bash
brew install mysql@8.4
brew services start mysql@8.4
# If this is a fresh install, set a root password:
mysql_secure_installation
```

**Git** — already installed on most Macs; `git --version` to confirm.

---

## Setup & Run

### 1. Clone and install

```bash
git clone https://github.com/jhk-jen/F26_CS4347.git
cd F26_CS4347/backend
npm install
```

### 2. Configure the environment

```bash
# Still in backend/
cp .env.example .env
# Open .env and set DB_PASS to your own local MySQL root password.
# Every teammate has their own password — do not share or commit .env.
```

`backend/.env` fields:
```
DB_HOST=localhost
DB_USER=root
DB_PASS=your_mysql_root_password   ← change this; everyone's is different
DB_NAME=leaf_and_brew
SESSION_SECRET=any_long_random_string
PORT=3000
SQLI_USER=leaf_sqli                ← leave as is
SQLI_PASS=sqli_readonly            ← leave as is
```

`.env` is listed in `.gitignore` — never commit it.

### 3. Load the database

**⚠ Running create.sql drops and recreates all leaf_and_brew tables.**

`load.sql` uses relative paths (`data/Users.csv`), so it must be run from the `db/` folder. If MySQL refuses `LOAD DATA LOCAL INFILE`, run `SET GLOBAL local_infile = 1;` inside MySQL first, then proceed.

```bash
# From backend/, go up to db/
cd ../db

# (Only needed once if LOAD DATA is refused — run inside mysql, then exit)
# mysql -u root -p -e "SET GLOBAL local_infile = 1;"

mysql --local-infile=1 -u root -p              < create.sql
mysql --local-infile=1 -u root -p leaf_and_brew < load.sql
mysql -u root -p leaf_and_brew                 < views.sql
mysql -u root -p                               < sqli_user.sql
```

To regenerate the seed CSVs from scratch: `python3 generate_data.py`

### 4. Start the server

```bash
cd ../backend
npm start          # production
npm run dev        # auto-reload (node --watch)
```

Open **http://localhost:3000**

**To stop:** `Ctrl+C` in the terminal running the server.

**If the port is busy (EADDRINUSE):**
```bash
lsof -ti :3000 | xargs kill
```

**MySQL on Mac (Homebrew):**
```bash
brew services start mysql@8.4
brew services stop  mysql@8.4
brew services list              # check running status
```

---

## Demo Accounts

All seeded accounts use the password **`password123`**.

| Role     | Email                           | Notes |
|----------|---------------------------------|-------|
| Owner    | emily.tan@example.com           | Full admin access; the only role that can change user roles or delete users |
| Staff    | james.lee@example.com           | Dashboard, products, orders, report; cannot change roles or delete users |
| Customer | sophia.chen@example.com         | Has bought products 1–7 and reviewed 1, 2, 4, 5; can write a new review on 3, 6, 7; cannot review 8 (not purchased) |
| Customer | olivia.martinez@example.com     | Phone: `(214) 917-2915` — target account for the SQL injection demo |

---

## Demo Day Checklist

**Every test run changes the data** (places orders, decrements stock, writes reviews, changes roles). Always reset the DB right before the demo and don't click around afterwards.

### Reset the DB (from the `db/` folder)

```bash
cd db
mysql --local-infile=1 -u root -p              < create.sql
mysql --local-infile=1 -u root -p leaf_and_brew < load.sql
mysql -u root -p leaf_and_brew                 < views.sql
# sqli_user.sql only needs to run once per machine — skip if already done
# mysql -u root -p < sqli_user.sql
```

### Verify the reset

```bash
mysql -u root -p leaf_and_brew -e "
SELECT
  (SELECT COUNT(*) FROM Products) AS products,
  (SELECT COUNT(*) FROM Users)    AS users,
  (SELECT COUNT(*) FROM Orders)   AS orders,
  (SELECT COUNT(*) FROM Reviews)  AS reviews;

SELECT product_id, p_name, stock_qty
FROM Products
WHERE product_id IN (1, 5, 7);"
```

Expected:

| products | users | orders | reviews |
|----------|-------|--------|---------|
| 8        | 40    | 60     | 40      |

| product_id | p_name            | stock_qty |
|------------|-------------------|-----------|
| 1          | Sencha Green Tea  | 53        |
| 5          | Ceremonial Matcha | 4         |
| 7          | Classic Pu-erh    | 4         |

### After the reset

1. **Restart the server** (`Ctrl+C` then `npm start` in `backend/`) so the session store is fresh.
2. **Open two browser windows:**
   - Normal window → customer account (`sophia.chen@example.com`)
   - Private/Incognito window → Owner account (`emily.tan@example.com`)
   - This avoids logging out and in during the demo.
3. **Pre-open tabs:** `/`, `/admin`, `/sqli/vulnerable`, `/sqli/safe`
4. **Keep in a note to copy-paste:**
   - Demo password: `password123`
   - SQLi payload 1: `olivia.martinez@example.com' #`
   - SQLi payload 2: `x' OR 1=1 #`
   - Olivia's phone: `(214) 917-2915`

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `Error: listen EADDRINUSE :::3000` | Another process is on port 3000 | `lsof -ti :3000 \| xargs kill`, then restart |
| `The used command is not allowed with this MySQL version` / `LOAD DATA` refused | `local_infile` is off | Run `mysql -u root -p -e "SET GLOBAL local_infile = 1;"`, then re-run load commands with `--local-infile=1` |
| `Error: connect ECONNREFUSED` / `ER_ACCESS_DENIED` | MySQL not running, or wrong password in `.env` | `brew services start mysql@8.4`; check `DB_PASS` in `backend/.env` |
| Page shows stale / unexpected data | DB not reset after a test run | Reset from `db/`: `create.sql` → `load.sql` → `views.sql`, restart server |
| `load.sql` can't find CSV files | Running from the wrong directory | `cd db` first — `load.sql` uses relative paths like `data/Users.csv` |

---

## Team Workflow

### Branch rules

1. Always sync before starting: `git pull origin main`
2. Create your own branch: `git checkout -b <name>-<topic>` (e.g. `jenna-cart-fix`)
3. Push your branch and open a PR into `main` — do **not** push directly to `main`
4. After merging, delete the feature branch
5. Reset the DB after every test run so the next person starts clean

### How to report a problem

Open a GitHub issue (or message the group chat) with:

```
Page:     /admin/products/3/edit
Action:   Changed price to 17.00, clicked Save
Expected: Product list shows updated price $17.00
Actual:   Price unchanged, no flash message shown
```

Attach a screenshot if the problem is visual.

---

## Pages & Routes

### Customer Side

| Route | Description |
|-------|-------------|
| `GET /` | Shop — search, filter by tea type/price, sort (all SQL) |
| `GET /product/:id` | Product detail, reviews, add to cart |
| `POST /cart/add` | Add item to session cart |
| `GET /cart` | View/update cart |
| `POST /cart/update` | Update quantities |
| `POST /cart/remove` | Remove item |
| `GET /checkout` | Checkout summary |
| `POST /checkout` | Place order (transaction + stock decrement) |
| `GET /orders` | My orders list |
| `GET /orders/:id` | Order detail |
| `POST /product/:id/review` | Create or update own review (1-5 rating) |
| `POST /product/:id/review/delete` | Delete own review |

### Auth

| Route | Description |
|-------|-------------|
| `GET/POST /login` | Log in |
| `GET/POST /register` | Create customer account (auto-logs in) |
| `GET /logout` | Log out |

### Admin (Staff/Owner only)

| Route | Description |
|-------|-------------|
| `GET /admin` | Dashboard — traffic chart, stats, low stock, recent orders |
| `GET /admin/products` | Product list + search + stock column |
| `GET /admin/products/new` | New product form |
| `POST /admin/products/create` | Create product |
| `GET /admin/products/:id/edit` | Edit product form |
| `POST /admin/products/:id/update` | Save changes |
| `POST /admin/products/:id/delete` | Delete (FK-safe error message) |
| `GET /admin/orders` | Order list + filter by status |
| `GET /admin/orders/:id` | Order detail |
| `POST /admin/orders/:id/status` | Update order_status (cancel restores stock) |
| `GET /admin/users` | User list + search |
| `POST /admin/users/:id/role` | Change user_type (Owner only) |
| `POST /admin/users/:id/delete` | Delete user (Owner only; FK-safe error message) |
| `GET /admin/report` | Sales by tea type (GROUP BY + v_sales_by_tea_type VIEW) |

### Assignment 5 — SQL Injection Demo

| Route | Description |
|-------|-------------|
| `GET /sqli` | Landing page with demo payloads listed |
| `GET/POST /sqli/vulnerable` | String-concat SQL — injection works; shows exact query |
| `GET/POST /sqli/safe` | Prepared statements — injection fails; shows template + bound values |

**Demo payloads** (use at `/sqli/vulnerable`, then at `/sqli/safe` to show the fix):

| Email | Phone | Effect |
|-------|-------|--------|
| `olivia.martinez@example.com' #` | (any wrong) | Returns Olivia's 7 orders without knowing her phone |
| `x' OR 1=1 #` | (any) | Returns every order in the database |
| olivia.martinez@example.com | (214) 917-2915 | Legitimate query — returns only her 7 orders |

---

## Database

Dummy data: 8 products, 40 users (1 Owner, 3 Staff, 36 Customers), 60 orders, 40 reviews, 90 days of daily visit metrics. All passwords are `password123` (bcrypt-hashed, salt rounds=10).

Views defined in `db/views.sql`:
- `v_product_summary` — each product with avg rating and review count; used by the shop and product detail pages
- `v_sales_by_tea_type` — revenue, units, order count grouped by tea type (excludes Cancelled); used by the sales report
