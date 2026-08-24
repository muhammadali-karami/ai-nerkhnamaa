import { NextResponse } from "next/server";

type Source = { id: string; name: string; url: string; domain: string; note: string; price: number | null; status: "live" | "unavailable"; updatedAt: string | null };
const now = () => new Date().toISOString();

async function requestJson(url: string) {
  const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "Talnama/1.1" }, signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`Upstream returned ${response.status}`);
  return response.json() as Promise<unknown>;
}
function unavailable(source: Omit<Source, "price" | "status" | "updatedAt">): Source { return { ...source, price: null, status: "unavailable", updatedAt: null }; }

async function daric(): Promise<Source> {
  const base = { id: "daric", name: "داریک", url: "https://daric.gold/", domain: "daric.gold", note: "طلای ۱۸ عیار · تومان/گرم" };
  try { const data = await requestJson("https://apisc.daric.gold/loan/api/v1/User/Collateral/GetGoldlPrice") as { Data?: { BestBuyPrice?: string; BestSellPrice?: string }; IsSuccess?: boolean }; const price = (Number(data.Data?.BestBuyPrice) + Number(data.Data?.BestSellPrice)) / 2; if (!data.IsSuccess || !Number.isFinite(price) || price <= 0) throw new Error(); return { ...base, price: Math.round(price), status: "live", updatedAt: now() }; } catch { return unavailable(base); }
}
async function milli(): Promise<Source> {
  const base = { id: "milli", name: "میلی", url: "https://milli.gold/", domain: "milli.gold", note: "طلای ۱۸ عیار · تومان/گرم" };
  try { const data = await requestJson("https://milli.gold/api/v1/public/milli-price/external") as { data?: { price18?: number; date?: string } }; const raw = Number(data.data?.price18); if (!Number.isFinite(raw) || raw <= 0) throw new Error(); return { ...base, price: Math.round(raw * 100), status: "live", updatedAt: data.data?.date ?? now() }; } catch { return unavailable(base); }
}
async function talasea(): Promise<Source> { return unavailable({ id: "talasea", name: "طلاسی", url: "https://talasea.ir/", domain: "talasea.ir", note: "مسیر دادهٔ عمومی پاسخ معتبر نمی‌دهد" }); }
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
function market(sources: Source[]) { const prices = sources.flatMap((source) => source.price === null ? [] : [source.price]); return { averagePrice: prices.length ? Math.round(prices.reduce((sum, price) => sum + price, 0) / prices.length) : null, sources }; }
export async function GET() {
  const [goldSources, dollarSources] = await Promise.all([Promise.all([talasea(), daric(), milli()]), Promise.all([bitpin(), tabdeal(), nobitex()])]);
  return NextResponse.json({ gold: market(goldSources), dollar: market(dollarSources), updatedAt: now(), refreshAfterSeconds: 20 }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
