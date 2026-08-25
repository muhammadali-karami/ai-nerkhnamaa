type Source = { id: string; name: string; url: string; domain: string; note: string; price: number | null; status: "live" | "unavailable"; updatedAt: string | null };
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
function unavailable(source: Omit<Source, "price" | "status" | "updatedAt">): Source { return { ...source, price: null, status: "unavailable", updatedAt: null }; }

async function daric(): Promise<Source> {
  const base = { id: "daric", name: "داریک", url: "https://market.daric.gold/trade/GOLD18/TMN", domain: "market.daric.gold", note: "خرید GOLD18/TMN · تومان/گرم" };
  try { const data = await requestJson("https://apie.daric.gold/public/general/topprice/GOLD18TMN") as { bestBuy?: { price?: number } }; const price = Number(data.bestBuy?.price); if (!Number.isFinite(price) || price <= 0) throw new Error(); return { ...base, price: Math.round(price), status: "live", updatedAt: now() }; } catch { return unavailable(base); }
}
async function milli(): Promise<Source> {
  const base = { id: "milli", name: "میلی", url: "https://milli.gold/", domain: "milli.gold", note: "طلای ۱۸ عیار · تومان/گرم" };
  try { const data = await requestJson("https://milli.gold/api/v1/public/milli-price/external") as { data?: { price18?: number; date?: string } }; const raw = Number(data.data?.price18); if (!Number.isFinite(raw) || raw <= 0) throw new Error(); return { ...base, price: Math.round(raw * 100), status: "live", updatedAt: data.data?.date ?? now() }; } catch { return unavailable(base); }
}
async function talasea(): Promise<Source> { return unavailable({ id: "talasea", name: "طلاسی", url: "https://talasea.ir/", domain: "talasea.ir", note: "مسیر دادهٔ عمومی پاسخ معتبر نمی‌دهد" }); }
function parseRial(text: string) { return Number(text.replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))).replace(/[^0-9]/g, "")); }
function tgjuCurrentRate(html: string) {
  const labelledRate = html.match(/نرخ فعلی[\s\S]{0,400}?data-col="info\.last_trade\.PDrCotVal"[^>]*>\s*([^<\s]+)/);
  const tableRate = html.match(/نرخ فعلی<\/td>\s*<td[^>]*>\s*([^<\s]+)/);
  const dataRate = html.match(/data-col="info\.last_trade\.PDrCotVal"[^>]*>\s*([^<\s]+)/);
  return labelledRate?.[1] ?? tableRate?.[1] ?? dataRate?.[1] ?? "";
}
async function tgju(): Promise<Source> {
  const base = { id: "tgju", name: "شبکه طلا و ارز", url: "https://www.tgju.org/profile/geram18", domain: "tgju.org", note: "طلای ۱۸ عیار · تومان/گرم" };
  try {
    // TGJU's server can take longer than the other sources; its displayed current rate is in rials.
    const html = await requestText(base.url, 35_000);
    const price = parseRial(tgjuCurrentRate(html)) / 10;
    if (!Number.isFinite(price) || price <= 0) throw new Error();
    return { ...base, price: Math.round(price), status: "live", updatedAt: now() };
  } catch { return unavailable(base); }
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
  const base = { id: "tabdeal", name: "تبدیل", url: "https://tabdeal.org/live/currency", domain: "tabdeal.org", note: "دلار آمریکا · تومان" };
  try { const data = await requestJson("https://api-web.tabdeal.org/plots/fiat-currency/converter/") as Array<{ symbol?: string; price_in_irt?: string; last_updated_at?: string }>; const quote = data.find((item) => item.symbol === "USD"); const price = Number(quote?.price_in_irt); if (!Number.isFinite(price) || price <= 0) throw new Error(); return { ...base, price: Math.round(price), status: "live", updatedAt: quote?.last_updated_at ?? now() }; } catch { return unavailable(base); }
}
async function nobitex(): Promise<Source> {
  const base = { id: "nobitex", name: "نوبیتکس", url: "https://nobitex.ir/", domain: "nobitex.ir", note: "تتر · معادل دلار · تومان" };
  try { const data = await requestJson("https://apiv2.nobitex.ir/market/stats") as { stats?: Record<string, { latest?: string }> }; const price = Number(data.stats?.["usdt-rls"]?.latest) / 10; if (!Number.isFinite(price) || price <= 0) throw new Error(); return { ...base, price: Math.round(price), status: "live", updatedAt: now() }; } catch { return unavailable(base); }
}
async function wallex(): Promise<Source> {
  const base = { id: "wallex", name: "والکس", url: "https://wallex.ir/", domain: "wallex.ir", note: "تتر · معادل دلار · تومان" };
  try {
    const data = await requestJson("https://api.wallex.ir/v1/markets", 20_000) as { result?: { symbols?: Record<string, { stats?: { lastPrice?: string } }> } };
    const price = Number(data.result?.symbols?.USDTTMN?.stats?.lastPrice);
    if (!Number.isFinite(price) || price <= 0) throw new Error();
    return { ...base, price: Math.round(price), status: "live", updatedAt: now() };
  } catch { return unavailable(base); }
}
async function raastin(): Promise<Source> {
  const base = { id: "raastin", name: "راستین", url: "https://raastin.com/", domain: "raastin.com", note: "تتر · معادل دلار · تومان" };
  try { const data = await requestJson("https://api.raastin.com/api/v1/market/symbols/USDTIRT") as { price?: string }; const price = Number(data.price); if (!Number.isFinite(price) || price <= 0) throw new Error(); return { ...base, price: Math.round(price), status: "live", updatedAt: now() }; } catch { return unavailable(base); }
}
export async function GET() {
  const encoder = new TextEncoder();
  const sources = [
    ...[talasea, daric, milli, tgju, iranjib].map((load) => ({ market: "gold" as const, load })),
    ...[bitpin, tabdeal, nobitex, wallex, raastin].map((load) => ({ market: "dollar" as const, load })),
  ];
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, payload: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
      send("ready", { updatedAt: now(), refreshAfterSeconds: 20 });
      const pending = sources.map(({ market: marketName, load }) => load()
        .then((source) => send("source", { market: marketName, source, updatedAt: now() }))
        .catch(() => undefined));
      void Promise.allSettled(pending).then(() => {
        send("complete", { updatedAt: now(), refreshAfterSeconds: 20 });
        controller.close();
      });
    },
  });
  return new Response(stream, { headers: { "Cache-Control": "no-store, max-age=0", "Content-Type": "text/event-stream; charset=utf-8", Connection: "keep-alive" } });
}
