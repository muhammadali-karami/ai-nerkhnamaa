type Source = { id: string; name: string; url: string; domain: string; logoUrl?: string; note: string; price: number | null; status: "live" | "unavailable"; updatedAt: string | null };
const now = () => new Date().toISOString();

function requestSignal(signal: AbortSignal, timeoutMs: number) {
  return AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
}
async function requestJson(url: string, signal: AbortSignal, timeoutMs = 8_000) {
  const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "Talnama/1.1" }, signal: requestSignal(signal, timeoutMs) });
  if (!response.ok) throw new Error(`Upstream returned ${response.status}`);
  return response.json() as Promise<unknown>;
}
async function requestText(url: string, signal: AbortSignal, timeoutMs = 8_000) {
  const response = await fetch(url, { headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0 (compatible; Nerkhnama/1.0)" }, signal: requestSignal(signal, timeoutMs) });
  if (!response.ok) throw new Error(`Upstream returned ${response.status}`);
  return response.text();
}
async function requestMelliJson(url: string, signal: AbortSignal) {
  const headers = { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; Nerkhnama/1.0)" };
  const initial = await fetch(url, { headers, redirect: "manual", signal: requestSignal(signal, 15_000) });
  const cookie = initial.headers.get("set-cookie")?.split(/,(?=\s*[^;,\s]+=)/).map((item) => item.split(";")[0]).join("; ");
  const response = initial.status >= 300 && initial.status < 400 && cookie
    ? await fetch(url, { headers: { ...headers, Cookie: cookie }, signal: requestSignal(signal, 15_000) })
    : initial;
  if (!response.ok) throw new Error(`Upstream returned ${response.status}`);
  return response.json() as Promise<unknown>;
}
function unavailable(source: Omit<Source, "price" | "status" | "updatedAt">): Source { return { ...source, price: null, status: "unavailable", updatedAt: null }; }

async function melligold(signal: AbortSignal): Promise<Source> {
  const base = { id: "melligold", name: "ملی‌گلد", url: "https://melligold.com/", domain: "melligold.com", note: "قیمت لحظه‌ای طلای ۱۸ عیار · تومان/گرم" };
  try {
    const data = await requestMelliJson("https://melligold.com/api/v1/exchange/buy-sell-price/?symbol=XAU18&format=json", signal) as { data?: { price_sell?: number; timestamp?: number } };
    const price = Number(data.data?.price_sell);
    if (!Number.isFinite(price) || price <= 0) throw new Error();
    const updatedAt = data.data?.timestamp ? new Date(data.data.timestamp * 1_000).toISOString() : now();
    return { ...base, price: Math.round(price), status: "live", updatedAt };
  } catch { return unavailable(base); }
}
async function milli(signal: AbortSignal): Promise<Source> {
  const base = { id: "milli", name: "میلی", url: "https://milli.gold/", domain: "milli.gold", note: "طلای ۱۸ عیار · تومان/گرم" };
  try { const data = await requestJson("https://milli.gold/api/v1/public/milli-price/external", signal) as { data?: { price18?: number; date?: string } }; const raw = Number(data.data?.price18); if (!Number.isFinite(raw) || raw <= 0) throw new Error(); return { ...base, price: Math.round(raw * 100), status: "live", updatedAt: data.data?.date ?? now() }; } catch { return unavailable(base); }
}
async function talasea(signal: AbortSignal): Promise<Source> {
  const base = { id: "talasea", name: "طلاسی", url: "https://talasea.ir/", domain: "talasea.ir", note: "قیمت لحظه‌ای طلای ۱۸ عیار · تومان/گرم" };
  try {
    const data = await requestJson("https://api.talasea.ir/api/market/getGoldPrice", signal) as { price?: string | number };
    // Talasea returns the gold price per milligram; its page renders this value per gram.
    const price = Number(data.price) * 1_000;
    if (!Number.isFinite(price) || price <= 0) throw new Error();
    return { ...base, price: Math.round(price), status: "live", updatedAt: now() };
  } catch { return unavailable(base); }
}
function parseRial(text: string) { return Number(text.replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))).replace(/[^0-9]/g, "")); }
function parseDecimal(text: string) { return Number(text.replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))).replace(/,/g, "").trim()); }
function normalizeDollarToman(value: number) {
  const price = Math.round(value);
  // Dollar quotes below 100,000 are occasionally returned in the source's
  // rial-style scale; normalize them to the six-digit toman display scale.
  return price >= 10_000 && price < 100_000 ? price * 10 : price;
}
const usdExchanges = [
  { id: "usd-mex-exchange", name: "صرافی بانک ملی", path: "currency-exchange/30001/mex-exchange", logoUrl: "https://platform.tgju.org/files/images/mex-exchange-1649663486.png" },
  { id: "usd-altinexchange-exchange", name: "صرافی آلتین", path: "currency-exchange/95182/altinexchange-exchange", logoUrl: "https://platform.tgju.org/files/images/altinexchange-1649662078.png" },
  { id: "usd-ardakaniexchange-exchange", name: "صرافی اردکانی", path: "currency-exchange/97914/ardakaniexchange-exchange", logoUrl: "https://platform.tgju.org/files/images/ardakaniexchangecom-1749289666.png" },
  { id: "usd-ex-sa-exchange", name: "صرافی بانک سرمایه", path: "currency-exchange/95180/ex-sa-exchange", logoUrl: "https://platform.tgju.org/files/images/ex-sa-1649664997.png" },
  { id: "usd-sarafiroyal-exchange", name: "صرافی رویال", path: "currency-exchange/28402/sarafiroyal-exchange", logoUrl: "https://platform.tgju.org/files/images/sarafiroyal-1649673056.png" },
] as const;
function tgjuCurrentRate(html: string) {
  return html.match(/data-col="info\.last_trade\.PDrCotVal"[^>]*>\s*([^<\s]+)/)?.[1] ?? "";
}
async function tgju(signal: AbortSignal): Promise<Source> {
  const base = { id: "tgju", name: "شبکه طلا و ارز", url: "https://www.tgju.org/profile/geram18", domain: "tgju.org", note: "نرخ فعلی طلای ۱۸ عیار · تومان/گرم" };
  try {
    // TGJU's server can take longer than the other sources; its displayed current rate is in rials.
    const html = await requestText(base.url, signal, 35_000);
    const price = parseRial(tgjuCurrentRate(html)) / 10;
    if (!Number.isFinite(price) || price <= 0) throw new Error();
    return { ...base, price: Math.round(price), status: "live", updatedAt: now() };
  } catch { return unavailable(base); }
}
async function goldOunce(signal: AbortSignal): Promise<number | null> {
  try {
    const html = await requestText("https://www.tgju.org/profile/ons", signal, 35_000);
    const value = tgjuCurrentRate(html);
    const price = parseDecimal(value);
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}
async function tgjuTether(signal: AbortSignal): Promise<Source> {
  const base = { id: "tgju-tether", name: "شبکه طلا و ارز", url: "https://www.tgju.org/profile/price_dollar_rl", domain: "tgju.org", note: "تتر · معادل دلار · تومان" };
  try {
    const html = await requestText(base.url, signal, 35_000);
    const price = parseRial(tgjuCurrentRate(html)) / 10;
    if (!Number.isFinite(price) || price <= 0) throw new Error();
    return { ...base, price: Math.round(price), status: "live", updatedAt: now() };
  } catch { return unavailable(base); }
}
async function loadUsdExchanges(signal: AbortSignal): Promise<Source[]> {
  const pageUrl = "https://www.tgju.org/currency-exchange";
  try {
    const html = await requestText(pageUrl, signal, 35_000);
    const rows = html.match(/<tr\b[\s\S]*?<\/tr>/g) ?? [];
    return usdExchanges.map((exchange) => {
      const row = rows.find((item) => item.includes(`href="${exchange.path}"`));
      if (!row) throw new Error(`Exchange row was not found: ${exchange.name}`);
      const quoted = row.match(/td-item-usd[^>]*data-item-value="([^"]+)"/);
      if (!quoted) throw new Error(`Dollar price was not found: ${exchange.name}`);
      const price = normalizeDollarToman(Number(quoted[1].replace(/,/g, "")) / 10);
      const { path, ...details } = exchange;
      const base = { ...details, url: `https://www.tgju.org/${path}`, domain: "tgju.org", note: "فروش نقدی دلار آمریکا · تومان" };
      return Number.isFinite(price) && price > 0 ? { ...base, price: Math.round(price), status: "live" as const, updatedAt: now() } : unavailable(base);
    });
  } catch {
    return usdExchanges.map(({ path, ...exchange }) => unavailable({ ...exchange, url: `https://www.tgju.org/${path}`, domain: "tgju.org", note: "فروش نقدی دلار آمریکا · تومان" }));
  }
}
async function iranjib(signal: AbortSignal): Promise<Source> {
  const base = { id: "iranjib", name: "ایران‌جیب", url: "https://www.iranjib.ir/showgroup/23/gold/", domain: "iranjib.ir", note: "طلای ۱۸ عیار · تومان/گرم" };
  try { const html = await requestText(base.url, signal); const match = html.match(/هر گرم طلای [^<]*<\/a><\/td>\s*<td[^>]*>\s*<span class="lastprice">([^<]+)/); const price = parseRial(match?.[1] ?? "") / 10; if (!Number.isFinite(price) || price <= 0) throw new Error(); return { ...base, price: Math.round(price), status: "live", updatedAt: now() }; } catch { return unavailable(base); }
}
async function bitpin(signal: AbortSignal): Promise<Source> {
  const base = { id: "bitpin", name: "بیت‌پین", url: "https://bitpin.ir/", domain: "bitpin.ir", note: "تتر · معادل دلار · تومان" };
  try { const data = await requestJson("https://api.bitpin.ir/v1/mkt/markets/", signal) as { results?: Array<{ code?: string; price?: string; order_book_info?: { price?: string; time?: string } }> }; const quote = data.results?.find((item) => item.code === "USDT_IRT"); const price = Number(quote?.order_book_info?.price ?? quote?.price); if (!Number.isFinite(price) || price <= 0) throw new Error(); return { ...base, price: Math.round(price), status: "live", updatedAt: quote?.order_book_info?.time ?? now() }; } catch { return unavailable(base); }
}
async function tabdeal(signal: AbortSignal): Promise<Source> {
  const base = { id: "tabdeal", name: "تبدیل", url: "https://tabdeal.org/live/currency", domain: "tabdeal.org", note: "تتر · معادل دلار · تومان" };
  try { const data = await requestJson("https://api-web.tabdeal.org/plots/fiat-currency/converter/", signal) as Array<{ symbol?: string; price_in_irt?: string; last_updated_at?: string }>; const quote = data.find((item) => item.symbol === "USD"); const price = Number(quote?.price_in_irt); if (!Number.isFinite(price) || price <= 0) throw new Error(); return { ...base, price: Math.round(price), status: "live", updatedAt: quote?.last_updated_at ?? now() }; } catch { return unavailable(base); }
}
async function nobitex(signal: AbortSignal): Promise<Source> {
  const base = { id: "nobitex", name: "نوبیتکس", url: "https://nobitex.ir/", domain: "nobitex.ir", note: "تتر · معادل دلار · تومان" };
  try { const data = await requestJson("https://apiv2.nobitex.ir/market/stats", signal) as { stats?: Record<string, { latest?: string }> }; const price = Number(data.stats?.["usdt-rls"]?.latest) / 10; if (!Number.isFinite(price) || price <= 0) throw new Error(); return { ...base, price: Math.round(price), status: "live", updatedAt: now() }; } catch { return unavailable(base); }
}
async function bit24(signal: AbortSignal): Promise<Source> {
  const base = { id: "bit24", name: "بیت۲۴", url: "https://bit24.cash/", domain: "bit24.cash", note: "تتر · معادل دلار · تومان" };
  try {
    const html = await requestText(base.url, signal, 20_000);
    const usdtCard = html.match(/href="https:\/\/bit24\.cash\/coins\/usdt\/"[\s\S]{0,1200}?([0-9۰-۹,]+)\s*IRT/);
    const price = parseRial(usdtCard?.[1] ?? "");
    if (!Number.isFinite(price) || price <= 0) throw new Error();
    return { ...base, price: Math.round(price), status: "live", updatedAt: now() };
  } catch { return unavailable(base); }
}
export async function GET(request: Request) {
  const encoder = new TextEncoder();
  const work = new AbortController();
  const requestedMarket = new URL(request.url).searchParams.get("market");
  const sources = requestedMarket === "gold"
    ? [talasea, melligold, milli, tgju, iranjib].map((load) => ({ market: "gold" as const, load: async () => [await load(work.signal)] }))
    : requestedMarket === "usdt"
      ? [bitpin, tabdeal, nobitex, bit24, tgjuTether].map((load) => ({ market: "usdt" as const, load: async () => [await load(work.signal)] }))
      : [{ market: "usd" as const, load: () => loadUsdExchanges(work.signal) }];
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const stop = () => {
        if (closed) return;
        closed = true;
        work.abort();
      };
      const send = (event: string, payload: unknown) => {
        if (closed) return false;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
          return true;
        } catch {
          // The client can cancel while an upstream quote is still resolving.
          stop();
          return false;
        }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        try { controller.close(); } catch { /* The consumer already closed the stream. */ }
      };
      request.signal.addEventListener("abort", stop, { once: true });
      send("ready", { updatedAt: now(), refreshAfterSeconds: 20 });
      const pending = sources.map(({ market: marketName, load }) => load()
        .then((items) => items.forEach((source) => send("source", { market: marketName, source, updatedAt: now() })))
        .catch(() => undefined));
      if (requestedMarket === "gold") {
        pending.push(goldOunce(work.signal).then((price) => send("gold-ounce", { goldOunce: price, updatedAt: now() })).catch(() => undefined));
      }
      void Promise.allSettled(pending).then(() => {
        if (send("complete", { updatedAt: now(), refreshAfterSeconds: 20 })) close();
      });
    },
    cancel() {
      work.abort();
    },
  });
  return new Response(stream, { headers: { "Cache-Control": "no-store, max-age=0", "Content-Type": "text/event-stream; charset=utf-8", Connection: "keep-alive" } });
}
