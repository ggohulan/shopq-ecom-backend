# Handover: ad-tracking foundation (Meta Pixel/CAPI, UTM capture)

*Written 28 Sep 2026, after directly checking the live site. Not built - this is a spec for a
developer to implement before real ad spend starts. Touches both the storefront (frontend repo)
and this admin backend.*

---

## 0. Start here — something is already broken, find out why first

Checked shopq.lk directly just now (homepage and a real product page, `/en/product/138`):

- No Meta Pixel (`fbq`), no Google Analytics/GTM (`gtag`/`dataLayer`), no TikTok pixel - none of
  these exist on the page at all, no matching script tags, no network requests to any of those
  services.
- **No call to this backend's own `GET /api/funnel-event` endpoint either**, even though that
  wiring already exists in this backend's code and is referenced by a frontend file called
  `trackEcommerceEvent.js` (per a comment in `src/app/api/funnel-event/route.js`).

This is confusing because the database has real funnel events as recent as yesterday - so tracking
clearly *has* worked at some point. **First task: find out why `trackEcommerceEvent.js` isn't
firing on a real product page view right now**, before building anything else on top of it. No
cookie-consent banner is gating it (checked - there isn't one). Possible causes to check: a recent
deploy regression, a condition in that file that isn't being met, or it silently failing.

---

## 1. Fix/build the client-side tracking (frontend repo)

Once the "why isn't it firing" question is answered:

- **Meta Pixel (browser-side)** - the base pixel script + `fbq('track', ...)` calls for
  `ViewContent`, `AddToCart`, `InitiateCheckout`, `Purchase`, matching the event types this
  backend already expects (`src/app/api/funnel-event/route.js`'s `EVENT_TYPES`).
- **Capture `fbclid` from the landing URL**, and read the `_fbc`/`_fbp` cookies Meta's own pixel
  script sets once it loads. These three values are what let Meta match a conversion back to a
  specific ad click - without them, match quality is weak even with the pixel installed correctly.
- **If Google Ads/Search or Shopping campaigns are planned**: add Google Ads conversion tracking
  (or GA4 + Google Ads linked) the same way. Nothing for this exists today.
- **UTM capture on landing** (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`,
  `utm_term`) - read from the URL on first page load, store somewhere that survives the whole
  session (e.g. a cookie or `sessionStorage`), since a visitor might click an ad today and buy
  three days later. This is what makes "which campaign drove this sale" answerable at all.

---

## 2. Backend changes needed to support this (this repo)

Two things, both in `src/app/api/funnel-event/route.js` and `product_funnel_events`:

### a) Accept and forward Meta match-quality fields

`sendMetaConversion()` currently only sends `client_ip_address` and `client_user_agent` in
`user_data` - add `fbc` and `fbp` (passed up from the frontend in the event payload) to that
object. This alone is the single highest-leverage fix here: it directly improves Meta's Event
Match Quality score without needing any new tracking system.

### b) Store UTM/campaign data per event

Add columns to `product_funnel_events` (or a small companion table keyed by `session_id`, if a
visitor's UTM data should only be recorded once per session rather than repeated on every row -
worth deciding based on how the frontend ends up persisting it):

```sql
ALTER TABLE product_funnel_events
  ADD COLUMN utm_source   VARCHAR(120) NULL,
  ADD COLUMN utm_medium   VARCHAR(120) NULL,
  ADD COLUMN utm_campaign VARCHAR(191) NULL,
  ADD COLUMN fbclid       VARCHAR(191) NULL;
```

Then in `route.js`'s `POST` handler, accept these from `body` the same way `source`/`consumer_id`
already are, and include them in the `INSERT`. Once stored, the funnel/revenue reports discussed
separately (see the "analytics section" discussion) can actually break down by channel/campaign,
not just by product.

---

## 3. Verify it's real once built

- **Meta Events Manager -> Test Events** tool - confirms the pixel and CAPI events are both
  arriving and getting deduplicated correctly (matching `event_id`, already handled server-side).
- **Meta Pixel Helper** (Chrome extension) - confirms the pixel fires client-side on a real
  product page, not just in code review.
- Check `product_funnel_events` directly for a real page view after testing, and confirm
  `utm_source`/`fbclid` are populated when visiting via a link with those params appended.
- Confirm `META_PIXEL_ID` and `META_CAPI_ACCESS_TOKEN` are actually set in production's
  `.env.local` - not verified from this session (only local dev's blank values were checked).

---

## 4. What NOT to do yet

Don't build a custom ad-spend-vs-revenue dashboard in this backend before the above is confirmed
working - Meta Ads Manager and Google Ads already compute ROAS natively once their own tracking is
solid. A blended internal view is a reasonable later addition, not a prerequisite for launching
campaigns.
