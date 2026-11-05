# Leaf & Brew (CS 4347 Team 4)

An online tea shop. Customers browse, filter and order tea and leave reviews. Staff use an admin dashboard for traffic, stock, orders and users.

## Tech stack (plan)

| Layer | Choice |
|---|---|
| Database | MySQL 8 |
| Backend | Node.js + Express, `mysql2` for queries |
| Frontend | HTML + CSS (no framework). Static now; later rendered by Express (EJS templates) with real query results |
| Auth | `express-session`, passwords hashed with `bcryptjs` |
| Local DB | MySQL via Docker or a local install (XAMPP/MySQL Workbench both fine) |

## Layout

```
frontend/   HTML pages, css/, js/, img/   (Phase 3 Task B, done)
backend/    Express server and routes (not started)
db/         Phase 3 Task C
  create.sql        creates the leaf_and_brew database and all tables
  load.sql          loads data/*.csv into the tables
  generate_data.py  writes the dummy CSVs (fixed seed, stdlib only)
  data/*.csv        one CSV per table
```

## Database setup

From the `db/` folder (MySQL 8.0.16+):

```bash
mysql --local-infile=1 -u root -p < create.sql
```

```bash
mysql --local-infile=1 -u root -p < load.sql
```

If LOCAL INFILE is refused, run `SET GLOBAL local_infile = 1;` as root first. To regenerate the CSVs: `python3 db/generate_data.py`.

Dummy data: 8 products (the same teas as the frontend), 40 users (1 Owner, 3 Staff, 36 Customers), 60 orders over the last 90 days, 40 reviews, 90 days of visits. Every account's password is `password123` (stored bcrypt-hashed).
Each product's image is `frontend/img/<file>` from `PRODUCT_IMAGES` in `generate_data.py` (e.g. 1 → `sencha.jpg`, 5 → `matcha.jpg`).

## Pages

| File | Page | Data it will show / write |
|---|---|---|
| `frontend/index.html` | Shop: product grid, search, tea type / price / sort filters | SELECT on Products (+ avg rating from Reviews) |
| `frontend/product.html` | Product: details, add to cart, reviews, write a review | Products row, Reviews + Users; INSERT/UPDATE Reviews |
| `frontend/admin.html` | Admin dashboard: traffic chart, stock, recent orders, users | DailyMetrics, Products, Orders + OrderItem, Users |
| `frontend/css/style.css` | Shared styles | |
| `frontend/js/main.js` | Client-side search/filter/sort, cart badge, gallery, review validation, admin nav/search (stand-ins until the backend) | |

Planned later: login/register, cart and checkout, my orders, and admin CRUD pages for products, orders and users.

## Live preview (GitHub Pages)

`.github/workflows/pages.yml` deploys `frontend/` on every push to `main`.
One-time setup (repo admin): **Settings → Pages → Source: GitHub Actions**. Site: https://jhk-jen.github.io/F26_CS4347/

## Running the frontend

Open `frontend/index.html` in a browser, or:

```bash
python3 -m http.server -d frontend 8765
```

Product photos in `frontend/img/` are placeholders cropped from the Phase 1 mockups and will be replaced.
