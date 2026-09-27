# Bug: `GET /products` (product list) is stuck returning only 23 results

**Affects:** `https://shopqhub.com/api/v1/products`
**Does not affect:** `https://shopqhub.com/api/v1/products/{id}` (per-product lookup) — that one works correctly for every product ID tested.

## Summary

The product *list* endpoint always returns the same 23 products, no matter what pagination or filter parameters are sent. The real catalog has 138 products (confirmed via a CRM product export, IDs 1–139 with one gap at 87). The per-product endpoint correctly returns all 138 when queried by ID directly, so the products themselves are fine — this is isolated to the list endpoint's pagination/filtering logic.

## Evidence

All requests below were made directly against `https://shopqhub.com/api/v1/products` with no other change:

| Request | Expected | Actual |
|---|---|---|
| `?page=1&per_page=100&status=1` | Up to 100 of 138 products | 23 products, `meta.total: 23`, `meta.last_page: 1` |
| `?page=1&per_page=200` | Up to 200 of 138 products | Still 23 |
| `?page=1&per_page=100` (no `status` filter) | Still expected >23 | Still 23, same 23 |
| `?page=1&per_page=100&status=0` | Different/larger set | Still the exact same 23 |
| `?ids=1,2,3,...,139` (all 138 real IDs, explicitly requested) | Those 138 products | Still the same 23 — the `ids` filter appears to be ignored entirely |

The response's own pagination metadata (`meta.current_page: 1`, `meta.last_page: 1`, `meta.total: 23`) is internally consistent — it genuinely believes there are only 23 products — so this isn't a client-side parsing issue, the API itself is reporting a wrong total/result set.

## What does work

`GET /products/{id}` (singular) was checked for all 138 real product IDs from the export and every single one returned correctly (200, with the right name) — including many IDs that never appear in the list endpoint's 23-result output. `GET /products/87` (the one gap in the ID range) correctly returns 404, confirming the endpoint distinguishes real vs. non-existent IDs properly when queried directly.

One related note if you retest this yourselves: rapid per-ID requests hit a rate limit (`429`) after roughly 50 requests in quick succession — worth knowing so testing/scripts pace requests with a delay (we use ~800ms between requests and exponential backoff on `429`).

## Impact on our side

The ShopQ Admin Backend's product picker (and a couple of report pages that resolve product IDs to names) depended on this list endpoint and could only ever see the same 23 products as a result. We've since worked around it by building our own local index that's populated via the per-ID endpoint instead (probing IDs one at a time, since that endpoint is reliable), but this is a workaround, not a fix — the CRM's list endpoint should return the full catalog and correctly honor `per_page`/`ids`/`status` for anything else that depends on it (including, presumably, the CRM's own admin panel or other integrations).

## Suggested next step

Check whatever builds the paginated query for `GET /products` for a hardcoded/cached limit, an unintended `WHERE` scope, or a stale cache key that isn't invalidating as the catalog grows past whatever it was when last correct.
