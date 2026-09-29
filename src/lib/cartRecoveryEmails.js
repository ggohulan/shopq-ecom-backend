// src/lib/cartRecoveryEmails.js
//
// Builds the subject/HTML for each of the 3 recovery emails - see the "Cart
// Recovery Proposal" artifact for why these three specifically (a plain
// nudge, then an objection-handling touch, then a time-limited discount held
// back until last so it doesn't train repeat shoppers to always wait for one).
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://shopq.lk').replace(/\/$/, '');

function formatCurrency(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `Rs. ${n.toLocaleString()}` : '';
}

function wrap(bodyHtml) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px;">
      <tr><td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
          <tr><td style="background:#dc2626;padding:18px 24px;">
            <span style="color:#fff;font-weight:800;font-size:16px;">ShopQ.lk</span>
          </td></tr>
          <tr><td style="padding:28px 24px;">${bodyHtml}</td></tr>
          <tr><td style="padding:16px 24px;border-top:1px solid #f0f0f2;">
            <p style="margin:0;font-size:11px;color:#a1a1aa;">You're receiving this because you added an item to your cart on shopq.lk and didn't finish checking out.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function itemsListHtml(items) {
  return items
    .map(
      (it) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #f0f0f2;font-size:14px;color:#18181b;">${it.name || `Product #${it.productId}`}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f0f0f2;font-size:14px;color:#52525b;text-align:right;">${formatCurrency(it.price)}</td>
      </tr>`
    )
    .join('');
}

function buttonHtml(label) {
  return `<a href="${SITE_URL}/en/cart" style="display:inline-block;margin-top:20px;background:#dc2626;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 24px;border-radius:8px;">${label}</a>`;
}

function step1({ name, items, cartValue }) {
  const greeting = name ? `Hi ${name},` : 'Hi there,';
  return {
    subject: 'You left something in your cart',
    html: wrap(`
      <p style="margin:0 0 12px;font-size:16px;color:#18181b;font-weight:700;">${greeting}</p>
      <p style="margin:0 0 20px;font-size:14px;color:#52525b;line-height:1.6;">You added ${items.length > 1 ? 'these items' : 'this item'} to your cart on ShopQ.lk but didn't finish checking out. It's still saved and ready whenever you are.</p>
      <table width="100%" cellpadding="0" cellspacing="0">${itemsListHtml(items)}</table>
      <p style="margin:14px 0 0;font-size:14px;color:#18181b;font-weight:700;">Total: ${formatCurrency(cartValue)}</p>
      ${buttonHtml('Complete your order')}
    `),
  };
}

function step2({ name, items, cartValue }) {
  const greeting = name ? `Hi ${name},` : 'Hi there,';
  return {
    subject: 'Still thinking it over?',
    html: wrap(`
      <p style="margin:0 0 12px;font-size:16px;color:#18181b;font-weight:700;">${greeting}</p>
      <p style="margin:0 0 16px;font-size:14px;color:#52525b;line-height:1.6;">Your cart is still here. A few things that might help you decide:</p>
      <ul style="margin:0 0 20px;padding-left:18px;font-size:14px;color:#52525b;line-height:1.8;">
        <li>Cash on Delivery available across Sri Lanka</li>
        <li>Easy returns if something isn't right</li>
        <li>Real customer support if you have questions before ordering</li>
      </ul>
      <table width="100%" cellpadding="0" cellspacing="0">${itemsListHtml(items)}</table>
      <p style="margin:14px 0 0;font-size:14px;color:#18181b;font-weight:700;">Total: ${formatCurrency(cartValue)}</p>
      ${buttonHtml('Go back to your cart')}
    `),
  };
}

async function step3({ name, items, cartValue, offer }) {
  const greeting = name ? `Hi ${name},` : 'Hi there,';
  const discountLine = offer?.code
    ? `<p style="margin:0 0 20px;font-size:14px;color:#16a34a;font-weight:700;">Use code ${offer.code} for ${offer.discountLabel} off — expires soon.</p>`
    : '';
  return {
    subject: offer?.code ? `${offer.discountLabel} off what's still in your cart` : 'Last chance — your cart is about to clear',
    html: wrap(`
      <p style="margin:0 0 12px;font-size:16px;color:#18181b;font-weight:700;">${greeting}</p>
      <p style="margin:0 0 12px;font-size:14px;color:#52525b;line-height:1.6;">This is the last reminder about the items you left in your cart.</p>
      ${discountLine}
      <table width="100%" cellpadding="0" cellspacing="0">${itemsListHtml(items)}</table>
      <p style="margin:14px 0 0;font-size:14px;color:#18181b;font-weight:700;">Total: ${formatCurrency(cartValue)}</p>
      ${buttonHtml('Complete your order')}
    `),
  };
}

// `offer` only matters for step 3 - the site-wide code already shown
// elsewhere on the storefront (Site-wide Offer admin page), not a separate
// recovery-only discount.
export async function buildRecoveryEmail(step, { name, items, cartValue, offer }) {
  if (step === 1) return step1({ name, items, cartValue });
  if (step === 2) return step2({ name, items, cartValue });
  if (step === 3) return step3({ name, items, cartValue, offer });
  throw new Error(`Unknown recovery step: ${step}`);
}
