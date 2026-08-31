type Source = { id: string; name: string; url: string; domain: string; logoUrl?: string; note: string; price: number | null; status: "live" | "unavailable"; updatedAt: string | null };
const now = () => new Date().toISOString();

async function requestJson(url: string, timeoutMs = 8_000) {
  const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "Talnama/1.1" }, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`Upstream returned ${response.status}`);
  return response.json() as Promise<unknown>;
}
async function requestText(url: string, timeoutMs = 8_000) {
  const response = await fetch(url, { headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0 (compatible; Nerkhnama/1.0)" }, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`Upstream returned ${response.status}`);
  return response.text();
}
async function requestMelliJson(url: string) {
  const headers = { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; Nerkhnama/1.0)" };
  const initial = await fetch(url, { headers, redirect: "manual", signal: AbortSignal.timeout(15_000) });
  const cookie = initial.headers.get("set-cookie")?.split(/,(?=\s*[^;,\s]+=)/).map((item) => item.split(";")[0]).join("; ");
  const response = initial.status >= 300 && initial.status < 400 && cookie
    ? await fetch(url, { headers: { ...headers, Cookie: cookie }, signal: AbortSignal.timeout(15_000) })
    : initial;
  if (!response.ok) throw new Error(`Upstream returned ${response.status}`);
  return response.json() as Promise<unknown>;
}
function unavailable(source: Omit<Source, "price" | "status" | "updatedAt">): Source { return { ...source, price: null, status: "unavailable", updatedAt: null }; }

async function melligold(): Promise<Source> {
  const base = { id: "melligold", name: "ملی‌گلد", url: "https://melligold.com/", domain: "melligold.com", note: "قیمت لحظه‌ای طلای ۱۸ عیار · تومان/گرم" };
  try {
    const data = await requestMelliJson("https://melligold.com/api/v1/exchange/buy-sell-price/?symbol=XAU18&format=json") as { data?: { price_sell?: number; timestamp?: number } };
    const price = Number(data.data?.price_sell);
    if (!Number.isFinite(price) || price <= 0) throw new Error();
    const updatedAt = data.data?.timestamp ? new Date(data.data.timestamp * 1_000).toISOString() : now();
    return { ...base, price: Math.round(price), status: "live", updatedAt };
  } catch { return unavailable(base); }
}
async function milli(): Promise<Source> {
  const base = { id: "milli", name: "میلی", url: "https://milli.gold/", domain: "milli.gold", note: "طلای ۱۸ عیار · تومان/گرم" };
  try { const data = await requestJson("https://milli.gold/api/v1/public/milli-price/external") as { data?: { price18?: number; date?: string } }; const raw = Number(data.data?.price18); if (!Number.isFinite(raw) || raw <= 0) throw new Error(); return { ...base, price: Math.round(raw * 100), status: "live", updatedAt: data.data?.date ?? now() }; } catch { return unavailable(base); }
}
async function talasea(): Promise<Source> {
  const base = { id: "talasea", name: "طلاسی", url: "https://talasea.ir/", domain: "talasea.ir", note: "قیمت لحظه‌ای طلای ۱۸ عیار · تومان/گرم" };
  try {
    const data = await requestJson("https://api.talasea.ir/api/market/getGoldPrice") as { price?: string | number };
    // Talasea returns the gold price per milligram; its page renders this value per gram.
    const price = Number(data.price) * 1_000;
    if (!Number.isFinite(price) || price <= 0) throw new Error();
    return { ...base, price: Math.round(price), status: "live", updatedAt: now() };
  } catch { return unavailable(base); }
}
function parseRial(text: string) { return Number(text.replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))).replace(/[^0-9]/g, "")); }
function tgjuCurrentRate(html: string) {
  return html.match(/data-col="info\.last_trade\.PDrCotVal"[^>]*>\s*([^<\s]+)/)?.[1] ?? "";
}
async function tgju(): Promise<Source> {
  const base = { id: "tgju", name: "شبکه طلا و ارز", url: "https://www.tgju.org/profile/geram18", domain: "tgju.org", note: "نرخ فعلی طلای ۱۸ عیار · تومان/گرم" };
  try {
    // TGJU's server can take longer than the other sources; its displayed current rate is in rials.
    const html = await requestText(base.url, 35_000);
    const price = parseRial(tgjuCurrentRate(html)) / 10;
    if (!Number.isFinite(price) || price <= 0) throw new Error();
    return { ...base, price: Math.round(price), status: "live", updatedAt: now() };
  } catch { return unavailable(base); }
}
async function tgjuTether(): Promise<Source> {
  const base = { id: "tgju-tether", name: "شبکه طلا و ارز", url: "https://www.tgju.org/profile/price_dollar_rl", domain: "tgju.org", note: "تتر · معادل دلار · تومان" };
  try {
    const html = await requestText(base.url, 35_000);
    const price = parseRial(tgjuCurrentRate(html)) / 10;
    if (!Number.isFinite(price) || price <= 0) throw new Error();
    return { ...base, price: Math.round(price), status: "live", updatedAt: now() };
  } catch { return unavailable(base); }
}
async function usdExchanges(): Promise<Source[]> {
  const pageUrl = "https://www.tgju.org/currency-exchange";
  try {
    const html = await requestText(pageUrl, 35_000);
    const rows = (html.match(/<tr\b[\s\S]*?<\/tr>/g) ?? []).filter((row) => row.includes("exchange-title")).slice(0, 5);
    if (rows.length !== 5) throw new Error("Exchange rows were not found");
    return rows.map((row) => {
      const exchange = row.match(/class="exchange-title" href="([^"]+)"[^>]*>\s*([^<]+?)\s*<\/a>/);
      const logoUrl = row.match(/<img src="([^"]+)"[^>]*alt="[^"]*"/);
      const quoted = row.match(/td-item-usd[^>]*data-item-value="([^"]+)"/);
      if (!exchange || !quoted) throw new Error("Exchange data was incomplete");
      const price = Number(quoted[1].replace(/,/g, "")) / 10;
      const href = exchange[1].replace(/^\/+/, "");
      const name = exchange[2].replace(/\s+/g, " ").trim();
      const base = { id: `usd-${href.split("/").slice(-1)[0]}`, name, url: `https://www.tgju.org/${href}`, domain: "tgju.org", ...(logoUrl?.[1] ? { logoUrl: logoUrl[1] } : {}), note: "فروش نقدی دلار آمریکا · تومان" };
      return Number.isFinite(price) && price > 0 ? { ...base, price: Math.round(price), status: "live" as const, updatedAt: now() } : unavailable(base);
    });
  } catch {
    return [];
  }
}
async function iranjib(): Promise<Source> {
  const base = { id: "iranjib", name: "ایران‌جیب", url: "https://www.iranjib.ir/showgroup/23/gold/", domain: "iranjib.ir", note: "طلای ۱۸ عیار · تومان/گرم" };
  try { const html = await requestText(base.url); const match = html.match(/هر گرم طلای [^<]*<\/a><\/td>\s*<td[^>]*>\s*<span class="lastprice">([^<]+)/); const price = parseRial(match?.[1] ?? "") / 10; if (!Number.isFinite(price) || price <= 0) throw new Error(); return { ...base, price: Math.round(price), status: "live", updatedAt: now() }; } catch { return unavailable(base); }
}
async function bitpin(): Promise<Source> {
  const base = { id: "bitpin", name: "بیت‌پین", url: "https://bitpin.ir/", domain: "bitpin.ir", note: "تتر · معادل دلار · تومان" };
  try { const data = await requestJson("https://api.bitpin.ir/v1/mkt/markets/") as { results?: Array<{ code?: string; price?: string; order_book_info?: { price?: string; time?: string } }> }; const quote = data.results?.find((item) => item.code === "USDT_IRT"); const price = Number(quote?.order_book_info?.price ?? quote?.price); if (!Number.isFinite(price) || price <= 0) throw new Error(); return { ...base, price: Math.round(price), status: "live", updatedAt: quote?.order_book_info?.time ?? now() }; } catch { return unavailable(base); }
}
async function tabdeal(): Promise<Source> {
  const base = { id: "tabdeal", name: "تبدیل", url: "https://tabdeal.org/live/currency", domain: "tabdeal.org", note: "تتر · معادل دلار · تومان" };
  try { const data = await requestJson("https://api-web.tabdeal.org/plots/fiat-currency/converter/") as Array<{ symbol?: string; price_in_irt?: string; last_updated_at?: string }>; const quote = data.find((item) => item.symbol === "USD"); const price = Number(quote?.price_in_irt); if (!Number.isFinite(price) || price <= 0) throw new Error(); return { ...base, price: Math.round(price), status: "live", updatedAt: quote?.last_updated_at ?? now() }; } catch { return unavailable(base); }
}
async function nobitex(): Promise<Source> {
  const base = { id: "nobitex", name: "نوبیتکس", url: "https://nobitex.ir/", domain: "nobitex.ir", note: "تتر · معادل دلار · تومان" };
  try { const data = await requestJson("https://apiv2.nobitex.ir/market/stats") as { stats?: Record<string, { latest?: string }> }; const price = Number(data.stats?.["usdt-rls"]?.latest) / 10; if (!Number.isFinite(price) || price <= 0) throw new Error(); return { ...base, price: Math.round(price), status: "live", updatedAt: now() }; } catch { return unavailable(base); }
}
async function bit24(): Promise<Source> {
  const base = { id: "bit24", name: "بیت۲۴", url: "https://bit24.cash/", domain: "bit24.cash", note: "تتر · معادل دلار · تومان" };
  try {
    const html = await requestText(base.url, 20_000);
    const usdtCard = html.match(/href="https:\/\/bit24\.cash\/coins\/usdt\/"[\s\S]{0,1200}?([0-9۰-۹,]+)\s*IRT/);
    const price = parseRial(usdtCard?.[1] ?? "");
    if (!Number.isFinite(price) || price <= 0) throw new Error();
    return { ...base, price: Math.round(price), status: "live", updatedAt: now() };
  } catch { return unavailable(base); }
}
export async function GET(request: Request) {
  const encoder = new TextEncoder();
  const requestedMarket = new URL(request.url).searchParams.get("market");
  const sources = requestedMarket === "gold"
    ? [talasea, melligold, milli, tgju, iranjib].map((load) => ({ market: "gold" as const, load: async () => [await load()] }))
    : requestedMarket === "usdt"
      ? [bitpin, tabdeal, nobitex, bit24, tgjuTether].map((load) => ({ market: "dollar" as const, load: async () => [await load()] }))
      : [{ market: "dollar" as const, load: usdExchanges }];
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, payload: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
      send("ready", { updatedAt: now(), refreshAfterSeconds: 20 });
      const pending = sources.map(({ market: marketName, load }) => load()
        .then((items) => items.forEach((source) => send("source", { market: marketName, source, updatedAt: now() })))
        .catch(() => undefined));
      void Promise.allSettled(pending).then(() => {
        send("complete", { updatedAt: now(), refreshAfterSeconds: 20 });
        controller.close();
      });
    },
  });
  return new Response(stream, { headers: { "Cache-Control": "no-store, max-age=0", "Content-Type": "text/event-stream; charset=utf-8", Connection: "keep-alive" } });
}
