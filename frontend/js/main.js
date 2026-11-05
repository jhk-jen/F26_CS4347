// Leaf & Brew: front-end behavior for the static pages.
// Filtering, cart and review submit are client-side stand-ins until the
// Express backend serves real query results.

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------- cart badge (localStorage) ----------

const CART_KEY = "leafbrew-cart";

function readCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || {};
  } catch {
    return {};
  }
}

function writeCart(cart) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  } catch {
    // storage blocked: badge just won't persist
  }
}

function updateBadge() {
  const count = Object.values(readCart()).reduce((a, b) => a + b, 0);
  $$(".cart-badge").forEach((b) => (b.textContent = count));
}

function setupAddToCart() {
  $$("form.card-foot, form.buy-row").forEach((form) => {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const id = form.elements.product_id.value;
      const qtyInput = form.elements.qty;
      const qty = qtyInput ? parseInt(qtyInput.value, 10) : 1;
      if (qtyInput && !qtyInput.checkValidity()) {
        qtyInput.reportValidity();
        return;
      }
      const cart = readCart();
      cart[id] = (cart[id] || 0) + qty;
      writeCart(cart);
      updateBadge();

      const btn = $("button", form);
      const label = btn.textContent;
      btn.textContent = "Added ✓";
      btn.disabled = true;
      setTimeout(() => {
        btn.textContent = label;
        btn.disabled = false;
      }, 1200);
    });
  });
}

// ---------- header search ----------
// On the shop page the search filters the grid; elsewhere it submits to the shop.

function setupHeaderSearch() {
  const form = $(".site-header .search");
  if (!form || !$(".product-grid")) return;
  const input = form.elements.q;
  input.value = new URLSearchParams(location.search).get("q") || "";
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    applyFilters();
  });
  input.addEventListener("input", applyFilters);
}

// ---------- shop filters ----------

function applyFilters() {
  const grid = $(".product-grid");
  if (!grid) return;
  const form = $(".filters");
  const q = ($(".site-header .search input")?.value || "").trim().toLowerCase();
  const types = $$('input[name="tea_type"]:checked', form).map((c) => c.value);
  const min = parseFloat(form.elements.min_price.value);
  const max = parseFloat(form.elements.max_price.value);
  const sort = form.elements.sort.value;

  const cards = $$(".card", grid);
  let shown = 0;
  cards.forEach((card) => {
    const d = card.dataset;
    const price = parseFloat(d.price);
    const text = (d.name + " " + d.type + " " + card.textContent).toLowerCase();
    const ok =
      (!q || text.includes(q)) &&
      (!types.length || types.includes(d.type)) &&
      (isNaN(min) || price >= min) &&
      (isNaN(max) || price <= max);
    card.hidden = !ok;
    if (ok) shown++;
  });

  const by = {
    featured: (a, b) => a.dataset.order - b.dataset.order,
    price_asc: (a, b) => a.dataset.price - b.dataset.price,
    price_desc: (a, b) => b.dataset.price - a.dataset.price,
    rating: (a, b) => b.dataset.rating - a.dataset.rating,
    name: (a, b) => a.dataset.name.localeCompare(b.dataset.name),
  };
  cards.sort(by[sort] || by.featured).forEach((c) => grid.appendChild(c));

  $("#product-count").textContent = `${shown} product${shown === 1 ? "" : "s"}`;
  $("#no-results").hidden = shown > 0;
}

function setupFilters() {
  const form = $(".filters");
  if (!form) return;
  const priceInputs = [form.elements.min_price, form.elements.max_price];

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const [min, max] = priceInputs.map((i) => parseFloat(i.value));
    if (!isNaN(min) && !isNaN(max) && min > max) {
      priceInputs[1].setCustomValidity("Max price must be at least the min price.");
      priceInputs[1].reportValidity();
      return;
    }
    applyFilters();
  });
  priceInputs.forEach((i) => i.addEventListener("input", () => priceInputs[1].setCustomValidity("")));
  // checkboxes and sort apply immediately
  $$('input[type="checkbox"], select', form).forEach((el) => el.addEventListener("change", applyFilters));
  applyFilters();
}

// ---------- product page ----------

function setupGallery() {
  const main = $(".gallery-main");
  if (!main) return;
  $$(".thumbs img").forEach((thumb) => {
    thumb.addEventListener("click", () => {
      main.src = thumb.src;
      main.alt = thumb.alt;
      $$(".thumbs img").forEach((t) => t.classList.toggle("active", t === thumb));
    });
  });
}

function setupReviewForm() {
  const form = $(".review-form");
  if (!form) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    let note = $(".form-note", form);
    if (!note) {
      note = document.createElement("p");
      note.className = "form-note";
      form.appendChild(note);
    }
    note.textContent = "Thanks! Your review will be saved once the backend is connected.";
    form.reset();
  });
}

// ---------- admin ----------

function setupAdminNav() {
  const links = $$(".side-nav a");
  if (!links.length) return;
  links.forEach((link) => {
    link.addEventListener("click", (e) => {
      const target = link.getAttribute("href");
      if (!target.startsWith("#")) return;
      e.preventDefault();
      const el = target === "#top" ? document.body : $(target);
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      links.forEach((l) => l.classList.toggle("active", l === link));
    });
  });
}

function setupAdminSearch() {
  const form = $(".admin-top .search");
  if (!form) return;
  const input = form.elements.q;
  const filter = () => {
    const q = input.value.trim().toLowerCase();
    $$(".panel tbody tr").forEach((row) => {
      row.hidden = q && !row.textContent.toLowerCase().includes(q);
    });
  };
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    filter();
  });
  input.addEventListener("input", filter);
}

document.addEventListener("DOMContentLoaded", () => {
  updateBadge();
  setupAddToCart();
  setupHeaderSearch();
  setupFilters();
  setupGallery();
  setupReviewForm();
  setupAdminNav();
  setupAdminSearch();
});
