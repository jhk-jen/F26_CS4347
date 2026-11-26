'use strict';

// Flavor text for the shop card and product page (product_id → short descriptor).
const FLAVOR = {
  1: 'Fresh & Grassy',
  2: 'Citrusy & Fragrant',
  3: 'Floral & Smooth',
  4: 'Calming & Soothing',
  5: 'Rich & Smooth',
  6: 'Delicate & Sweet',
  7: 'Earthy & Bold',
  8: 'Fragrant & Smooth'
};

// Image slug for each product (maps product_id → filename without extension).
// Images live at /img/<slug>.jpg inside the frontend static directory.
const IMG_SLUG = {
  1: 'sencha',
  2: 'earl-grey',
  3: 'tie-guan-yin',
  4: 'chamomile',
  5: 'matcha',
  6: 'silver-needle',
  7: 'pu-erh',
  8: 'jasmine'
};

// Sencha has extra gallery images; every other product reuses its main image.
const PRODUCT_IMGS = {
  1: { main: 'sencha-large', thumbs: ['sencha', 'sencha-leaves', 'sencha-cup'] }
};

// Attach img and flavor fields to an array (or single object) of product rows.
function withImg(rows) {
  if (!rows) return rows;
  if (Array.isArray(rows)) {
    return rows.map(r => ({
      ...r,
      img:    IMG_SLUG[r.product_id] || 'placeholder',
      flavor: FLAVOR[r.product_id]   || null
    }));
  }
  return {
    ...rows,
    img:    IMG_SLUG[rows.product_id] || 'placeholder',
    flavor: FLAVOR[rows.product_id]   || null
  };
}

// Get gallery images for a product detail page.
function getGallery(product_id, slug) {
  if (PRODUCT_IMGS[product_id]) return PRODUCT_IMGS[product_id];
  return { main: slug, thumbs: [slug] };
}

// Star-rating HTML (e.g. 4.5 -> four full stars, one half-filled star, one empty).
// Each star is the same glyph; .half overlays a half-width filled copy on an empty one.
function stars(avg) {
  const r = Math.round((parseFloat(avg) || 0) * 2) / 2;
  let html = `<span class="star-row" role="img" aria-label="${r} out of 5 stars">`;
  for (let i = 1; i <= 5; i++) {
    const cls = r >= i ? 'st-full' : (r >= i - 0.5 ? 'st-half' : 'st-empty');
    html += `<span class="st ${cls}" aria-hidden="true">★</span>`;
  }
  return html + '</span>';
}

// Format a decimal as a price string.
function price(n) {
  return '$' + parseFloat(n).toFixed(2);
}

// Format a 'YYYY-MM-DD' string as 'Mon DD, YYYY'.
function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Recompute cart total and return a fresh cart object.
function recalcCart(cart) {
  const items = cart.items || [];
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  return { items, total };
}

// Form and query values are normally strings, but "?q=a&q=b" or "email[]=x"
// arrive as arrays or objects. Anything that isn't a string becomes ''.
function text(v) {
  return typeof v === 'string' ? v : '';
}

module.exports = { IMG_SLUG, FLAVOR, withImg, getGallery, stars, price, fmtDate, recalcCart, text };
