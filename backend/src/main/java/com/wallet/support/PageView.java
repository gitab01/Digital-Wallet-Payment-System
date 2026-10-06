package com.wallet.support;

import java.util.List;

/**
 * The one page shape the API returns: contents, the total behind them, and the
 * coordinates that produced them.
 *
 * It lives here rather than in the web layer because the services that assemble pages
 * are the ones that know their own totals, and a controller that re-wraps a page in
 * order to satisfy a package rule is just copying numbers.
 */
public record PageView<T>(List<T> items, long total, int page, int size) {}
