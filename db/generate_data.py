"""Generate dummy CSV data for the Leaf & Brew database (Phase 3 Task C).

Writes one CSV per table into db/data/. Output is reproducible (fixed seed).
Run from anywhere:  python3 db/generate_data.py
"""

import csv
import random
from datetime import date, timedelta
from pathlib import Path

random.seed(4347)

OUT = Path(__file__).resolve().parent / "data"
TODAY = date(2026, 11, 5)
DAYS = 90

# All dummy accounts share the password "password123" (bcrypt hash below).
PASSWORD_HASH = "$2b$10$1tCId02pbTlgKGXjRUw/D.gXknmLXz12rDxLyFUaARQUlf6jDRKWa"

# ---------- Products ----------
# (name, tea_type, price, description). Same 8 teas, order and prices as the frontend cards.
PRODUCTS = [
    ("Sencha Green Tea", "Green", 12.00, "Classic Japanese steamed green tea with a fresh, grassy flavor and clean finish."),
    ("Earl Grey", "Black", 14.00, "Black tea scented with bergamot oil and blue cornflower petals. Citrusy and fragrant."),
    ("Tie Guan Yin", "Oolong", 16.00, "Rolled Anxi oolong with a floral aroma and smooth, buttery body."),
    ("Chamomile Blend", "Herbal", 11.00, "Whole chamomile flowers with a hint of lemongrass. Calming and caffeine-free."),
    ("Ceremonial Matcha", "Matcha", 28.00, "Stone-ground shade-grown tencha from Uji. Rich, smooth and vivid green."),
    ("Silver Needle", "White", 22.00, "Downy white tea buds from Fuding with a delicate, honeyed sweetness."),
    ("Classic Pu-erh", "Pu-erh", 18.00, "Aged ripe pu-erh from Yunnan. Earthy, bold and smooth."),
    ("Jasmine Green Tea", "Green", 13.00, "Green tea layered with fresh jasmine blossoms for a fragrant, smooth cup."),
]
# product_id -> image file in frontend/img/ (not stored in the database)
PRODUCT_IMAGES = {
    1: "sencha.jpg",
    2: "earl-grey.jpg",
    3: "tie-guan-yin.jpg",
    4: "chamomile.jpg",
    5: "matcha.jpg",
    6: "silver-needle.jpg",
    7: "pu-erh.jpg",
    8: "jasmine.jpg",
}
LOW_STOCK = {5, 7}  # product_ids with stock under 10

# ---------- Users ----------
FIRST = ["Emily", "James", "Priya", "Daniel", "Sophia", "Michael", "Olivia", "Ethan", "Ava", "Noah",
         "Mia", "Lucas", "Isabella", "Mason", "Harper", "Logan", "Amelia", "Jacob", "Evelyn", "Aiden",
         "Abigail", "Carlos", "Sofia", "Wei", "Hannah", "Omar", "Grace", "Diego", "Chloe", "Ryan",
         "Layla", "Nathan", "Zoe", "Arjun", "Lily", "Marcus", "Nora", "Kai", "Elena", "Samuel"]
LAST = ["Tan", "Lee", "Sharma", "Kim", "Chen", "Johnson", "Martinez", "Nguyen", "Patel", "Brown",
        "Garcia", "Wilson", "Lopez", "Davis", "Rodriguez", "Anderson", "Thomas", "Hernandez", "Moore", "Jackson",
        "White", "Rivera", "Clark", "Wang", "Lewis", "Hassan", "Walker", "Torres", "Hall", "Young",
        "Allen", "King", "Wright", "Reddy", "Scott", "Green", "Baker", "Adams", "Flores", "Hill"]
STREETS = ["Main St", "Elm St", "Oak Lawn Ave", "Greenville Ave", "Preston Rd", "Mockingbird Ln",
           "Campbell Rd", "Coit Rd", "Belt Line Rd", "Legacy Dr", "Spring Valley Rd", "Hillcrest Rd"]
CITIES = [("Dallas", "75204"), ("Dallas", "75206"), ("Richardson", "75080"), ("Plano", "75024"),
          ("Garland", "75040"), ("Irving", "75038"), ("Addison", "75001"), ("Frisco", "75034")]
CARDS = ["Visa", "Mastercard", "Amex", "Discover"]

REVIEW_TEXT = {
    5: [("Absolutely love it", "My new daily cup. Fresh and full of flavor."),
        ("Perfect every time", "Brews beautifully and smells amazing."),
        ("Best I've had", "Better than anything from the grocery store."),
        ("Will reorder", "Arrived fast and tastes fantastic.")],
    4: [("Really good", "Great flavor, just a touch pricey."),
        ("Lovely tea", "Smooth and fragrant. Would buy again."),
        ("Solid choice", "Good everyday tea with nice aroma.")],
    3: [("Pretty okay", "Decent, but not quite what I expected."),
        ("Average", "Fine for the price, nothing special.")],
    2: [("Not for me", "Flavor was weaker than I hoped.")],
}

STATUS_WEIGHTS = [("Delivered", 60), ("Shipped", 14), ("Processing", 10), ("Pending", 8), ("Cancelled", 8)]


def write(name, header, rows):
    with open(OUT / f"{name}.csv", "w", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(header)
        w.writerows(rows)
    print(f"{name}.csv: {len(rows)} rows")


def main():
    OUT.mkdir(exist_ok=True)

    # Products
    products = []
    for pid, (name, ttype, price, desc) in enumerate(PRODUCTS, start=1):
        stock = random.randint(2, 9) if pid in LOW_STOCK else random.randint(15, 80)
        products.append([pid, name, ttype, f"{price:.2f}", stock, desc])
    prices = {p[0]: float(p[3]) for p in products}

    # Users: 1 owner, 3 staff, 36 customers
    users = []
    for uid in range(1, 41):
        first, last = FIRST[uid - 1], LAST[uid - 1]
        utype = "Owner" if uid == 1 else "Staff" if uid <= 4 else "Customer"
        email = f"{first.lower()}.{last.lower()}@example.com"
        city, zipc = random.choice(CITIES)
        address = f"{random.randint(100, 9999)} {random.choice(STREETS)}, {city}, TX {zipc}"
        phone = f"({random.choice(['214', '469', '972'])}) {random.randint(200, 999)}-{random.randint(1000, 9999)}"
        payment = f"{random.choice(CARDS)} ending {random.randint(1000, 9999)}" if utype == "Customer" else r"\N"  # \N loads as NULL
        users.append([uid, utype, f"{first} {last}", email, PASSWORD_HASH, address, phone, payment])
    customers = [u[0] for u in users if u[1] == "Customer"]

    # Orders + OrderItem
    statuses = [s for s, w in STATUS_WEIGHTS for _ in range(w)]
    orders, items = [], []
    bought = {}  # (user_id, product_id) -> earliest order date
    for oid in range(1001, 1061):
        uid = random.choice(customers)
        age = random.randint(0, DAYS - 1)
        odate = TODAY - timedelta(days=age)
        # recent orders are still in progress; old ones are mostly delivered
        status = random.choice(statuses)
        if age > 14 and status in ("Pending", "Processing"):
            status = "Delivered"
        if age < 3 and status == "Delivered":
            status = "Processing"
        orders.append([oid, uid, odate.isoformat(), status])

        for pid in random.sample(range(1, len(products) + 1), random.randint(1, 3)):
            price = prices[pid]
            if age > 60 and random.random() < 0.25:
                price = round(price * 0.9, 2)  # older price, before an increase
            items.append([oid, pid, random.randint(1, 3), f"{price:.2f}"])
            if status != "Cancelled":
                key = (uid, pid)
                bought[key] = min(bought.get(key, odate), odate)

    # Reviews: only for products the customer actually bought
    reviews = []
    pairs = sorted(bought)
    random.shuffle(pairs)
    for uid, pid in pairs[:40]:
        odate = bought[(uid, pid)]
        rating = random.choices([5, 4, 3, 2], weights=[50, 32, 13, 5])[0]
        title, text = random.choice(REVIEW_TEXT[rating])
        rdate = min(TODAY, odate + timedelta(days=random.randint(3, 20)))
        reviews.append([uid, pid, rating, title, text, rdate.isoformat()])
    reviews.sort()

    # DailyMetrics: weekly pattern (weekends higher) plus a gentle upward trend
    metrics = []
    for i in range(DAYS):
        d = TODAY - timedelta(days=DAYS - 1 - i)
        base = 120 + i * 2
        weekend = 70 if d.weekday() >= 5 else 0
        metrics.append([d.isoformat(), base + weekend + random.randint(-25, 40)])

    write("Users", ["user_id", "user_type", "user_name", "email", "password", "address", "phone_no", "payment_info"], users)
    write("Products", ["product_id", "p_name", "tea_type", "price", "stock_qty", "description"], products)
    write("Orders", ["order_id", "user_id", "order_date", "order_status"], orders)
    write("OrderItem", ["order_id", "product_id", "qty", "price_at_purchase"], items)
    write("Reviews", ["user_id", "product_id", "rating_value", "review_title", "review_str", "review_date"], reviews)
    write("DailyMetrics", ["date", "visits"], metrics)


if __name__ == "__main__":
    main()
