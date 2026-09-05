"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type PriceSource = { id: string; name: string; price: number | null; url: string; status: "live" | "unavailable"; updatedAt: string | null; domain?: string; logoUrl?: string; note?: string };
type Market = { averagePrice: number | null; sources: PriceSource[] };
type PriceResponse = { gold: Market; usd: Market; usdt: Market; goldOunce: number | null; updatedAt: string; refreshAfterSeconds: number };
type QuoteTab = "usd" | "usdt";
const REFRESH_SECONDS = 20;
const goldFallback: Market = { averagePrice: null, sources: [
  { id: "talasea", name: "طلاسی", price: null, url: "https://talasea.ir/", status: "unavailable", updatedAt: null, domain: "talasea.ir" },
  { id: "melligold", name: "ملی‌گلد", price: null, url: "https://melligold.com/", status: "unavailable", updatedAt: null, domain: "melligold.com" },
  { id: "milli", name: "میلی", price: null, url: "https://milli.gold/", status: "unavailable", updatedAt: null, domain: "milli.gold" },
  { id: "tgju", name: "شبکه طلا و ارز", price: null, url: "https://www.tgju.org/profile/geram18", status: "unavailable", updatedAt: null, domain: "tgju.org" },
  { id: "iranjib", name: "ایران‌جیب", price: null, url: "https://www.iranjib.ir/showgroup/23/gold/", status: "unavailable", updatedAt: null, domain: "iranjib.ir" },
] };
const tetherFallback: Market = { averagePrice: null, sources: [
  { id: "bitpin", name: "بیت‌پین", price: null, url: "https://bitpin.ir/", status: "unavailable", updatedAt: null, domain: "bitpin.ir" },
  { id: "tabdeal", name: "تبدیل", price: null, url: "https://tabdeal.org/live/currency", status: "unavailable", updatedAt: null, domain: "tabdeal.org" },
  { id: "nobitex", name: "نوبیتکس", price: null, url: "https://nobitex.ir/", status: "unavailable", updatedAt: null, domain: "nobitex.ir" },
  { id: "bit24", name: "بیت۲۴", price: null, url: "https://bit24.cash/", status: "unavailable", updatedAt: null, domain: "bit24.cash" },
  { id: "tgju-tether", name: "شبکه طلا و ارز", price: null, url: "https://www.tgju.org/profile/price_dollar_rl", status: "unavailable", updatedAt: null, domain: "tgju.org" },
] };
const usdFallback: Market = { averagePrice: null, sources: [
  { id: "usd-mex-exchange", name: "صرافی بانک ملی", price: null, url: "https://www.tgju.org/currency-exchange/30001/mex-exchange", status: "unavailable", updatedAt: null, domain: "tgju.org", logoUrl: "https://platform.tgju.org/files/images/mex-exchange-1649663486.png" },
  { id: "usd-altinexchange-exchange", name: "صرافی آلتین", price: null, url: "https://www.tgju.org/currency-exchange/95182/altinexchange-exchange", status: "unavailable", updatedAt: null, domain: "tgju.org", logoUrl: "https://platform.tgju.org/files/images/altinexchange-1649662078.png" },
  { id: "usd-ardakaniexchange-exchange", name: "صرافی اردکانی", price: null, url: "https://www.tgju.org/currency-exchange/97914/ardakaniexchange-exchange", status: "unavailable", updatedAt: null, domain: "tgju.org", logoUrl: "https://platform.tgju.org/files/images/ardakaniexchangecom-1749289666.png" },
  { id: "usd-exchange-exchange", name: "صرافی امین ضراب", price: null, url: "https://www.tgju.org/currency-exchange/95194/exchange-exchange", status: "unavailable", updatedAt: null, domain: "tgju.org" },
  { id: "usd-sarafiroyal-exchange", name: "صرافی رویال", price: null, url: "https://www.tgju.org/currency-exchange/28402/sarafiroyal-exchange", status: "unavailable", updatedAt: null, domain: "tgju.org", logoUrl: "https://platform.tgju.org/files/images/sarafiroyal-1649673056.png" },
] };
const fallback: PriceResponse = { gold: goldFallback, usd: usdFallback, usdt: tetherFallback, goldOunce: null, updatedAt: "", refreshAfterSeconds: REFRESH_SECONDS };
function amount(value: number | null, unit: string) { return value === null || !Number.isFinite(value) ? "—" : `${new Intl.NumberFormat("fa-IR").format(Math.round(value))} ${unit}`; }
function timestamp(value: string | null) { const date = value ? new Date(value) : null; return !date || Number.isNaN(date.getTime()) ? "نامشخص" : new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date); }
function averagePrice(sources: PriceSource[]) { const prices = sources.flatMap((source) => source.price === null ? [] : [source.price]); return prices.length ? Math.round(prices.reduce((sum, price) => sum + price, 0) / prices.length) : null; }
function highestPrice(sources: PriceSource[]) { const prices = sources.flatMap((source) => source.price === null ? [] : [source.price]); return prices.length ? Math.max(...prices) : null; }
function updateSource(current: PriceResponse | null, marketName: "gold" | QuoteTab, nextSource: PriceSource, updatedAt: string): PriceResponse {
  const base = current ?? fallback;
  const currentMarket = base[marketName];
  const sources = currentMarket.sources.map((source) => source.id === nextSource.id ? nextSource : source);
  return { ...base, [marketName]: { sources, averagePrice: marketName === "usd" ? highestPrice(sources) : averagePrice(sources) }, updatedAt };
}
function SourceLogo({ source }: { source: PriceSource }) { const [failed, setFailed] = useState(false); const domain = source.domain ?? new URL(source.url).hostname; const logoUrl = source.logoUrl ?? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`; return <span className="source-logo" aria-hidden="true">{!failed && <img src={logoUrl} alt="" onError={() => setFailed(true)} />}{failed && <b>{source.name.trim().slice(0, 1)}</b>}</span>; }
function bubblePercent(price: number | null, intrinsicPrice: number | null) { return price === null || intrinsicPrice === null || intrinsicPrice <= 0 ? null : ((price - intrinsicPrice) / intrinsicPrice) * 100; }
function MarketPanel({ market, title, titleEnglish, unit, tone, summaryLabel = "قیمت میانگین", tabs, activeTab, onTabChange, intrinsicGoldPrice }: { market: Market; title: string; titleEnglish: string; unit: string; tone: "gold" | "dollar"; summaryLabel?: string; tabs?: boolean; activeTab?: QuoteTab; onTabChange?: (tab: QuoteTab) => void; intrinsicGoldPrice?: number | null }) {
  const liveCount = market.sources.filter((source) => source.status === "live" && source.price !== null).length;
  const sortedSources = [...market.sources].sort((a, b) => (b.price ?? -1) - (a.price ?? -1));
  const titleControl = tabs ? (
    <div className="quote-tabs" role="tablist" aria-label="انتخاب نرخ ارز">
      <button type="button" role="tab" aria-selected={activeTab === "usd"} className={activeTab === "usd" ? "active" : ""} onClick={() => onTabChange?.("usd")}>دلار آمریکا</button>
      <button type="button" role="tab" aria-selected={activeTab === "usdt"} className={activeTab === "usdt" ? "active" : ""} onClick={() => onTabChange?.("usdt")}>تتر</button>
    </div>
  ) : (
    <div className="quote-tabs quote-tabs-gold" role="tablist" aria-label="نوع طلا">
      <span id={`${tone}-title`} role="tab" aria-selected="true">{title}</span>
    </div>
  );
  return <section className={`market-panel ${tone}`} aria-labelledby={`${tone}-title`}>
    <div className="market-topline"><div><p className="market-kicker">{titleEnglish}</p>{titleControl}</div><span className="market-symbol" aria-hidden="true">{tone === "gold" ? "Au" : "$"}</span></div>
    <div className="market-average"><div><span>{summaryLabel}</span><strong>{amount(market.averagePrice, unit)}</strong></div><span className="source-count">{liveCount} از {market.sources.length} منبع فعال</span></div>
    <div className="source-list" role="list">{sortedSources.map((source, index) => {
      const live = source.status === "live" && source.price !== null;
      const bubble = tone === "gold" ? bubblePercent(source.price, intrinsicGoldPrice ?? null) : null;
      return <article className="source-row" role="listitem" key={source.id}>
        <span className="source-rank" aria-label={`رتبه ${index + 1}`}>{index + 1}</span><SourceLogo source={source} />
        <div className="source-name"><h3>{source.name}</h3><span className={`source-status ${live ? "online" : "offline"}`}>{live ? "فعال" : "ناموجود"}</span></div>
        <div className="source-quote"><p className={live ? "source-price" : "source-price unavailable"}>{live ? amount(source.price, unit) : "قیمت در دسترس نیست"}</p>{bubble !== null && <p className={`gold-bubble ${bubble >= 0 ? "positive" : "negative"}`}>حباب: {new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2, signDisplay: "always" }).format(bubble)}٪</p>}{source.note && !live && <p className="source-note">{source.note}</p>}</div>
        <a href={source.url} target="_blank" rel="noreferrer" aria-label={`مشاهده منبع ${source.name}`}>↗</a>
      </article>;
    })}</div>
  </section>;
}
export default function Home() {
  const [data, setData] = useState<PriceResponse | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(false); const [remaining, setRemaining] = useState(REFRESH_SECONDS); const [theme, setTheme] = useState<"light" | "dark">("light"); const [activeTab, setActiveTab] = useState<QuoteTab>("usd");
  const priceRequests = useRef<Partial<Record<"gold" | QuoteTab, AbortController>>>({});
  const fetchPrices = useCallback(async (market: "gold" | QuoteTab, signal?: AbortSignal) => {
    priceRequests.current[market]?.abort();
    const requestController = new AbortController();
    priceRequests.current[market] = requestController;
    const requestSignal = signal ? AbortSignal.any([signal, requestController.signal]) : requestController.signal;
    try {
      const response = await fetch(`/api/prices?market=${market}`, { cache: "no-store", signal: requestSignal });
      if (!response.ok || !response.body) throw new Error("Price service unavailable");
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const messages = buffer.split("\n\n"); buffer = messages.pop() ?? "";
        for (const message of messages) {
          const event = message.match(/^event: (.+)$/m)?.[1]; const json = message.match(/^data: (.+)$/m)?.[1]; if (!event || !json) continue;
          const payload = JSON.parse(json) as { market?: "gold" | QuoteTab; source?: PriceSource; goldOunce?: number | null; updatedAt: string };
          if (event === "source" && payload.market && payload.source) { setData((current) => updateSource(current, payload.market!, payload.source!, payload.updatedAt)); setError(false); }
          if (event === "gold-ounce") { setData((current) => ({ ...(current ?? fallback), goldOunce: payload.goldOunce ?? null, updatedAt: payload.updatedAt })); }
          if (event === "complete") { setRemaining(REFRESH_SECONDS); }
        }
      }
    } catch (cause) { if ((cause as Error).name !== "AbortError") setError(true); } finally { if (priceRequests.current[market] === requestController) { delete priceRequests.current[market]; setLoading(false); } }
  }, []);
  useEffect(() => { const saved = window.localStorage.getItem("talnama-theme"); if (saved === "dark" || saved === "light") setTheme(saved); else if (window.matchMedia("(prefers-color-scheme: dark)").matches) setTheme("dark"); }, []);
  useEffect(() => { window.localStorage.setItem("talnama-theme", theme); }, [theme]);
  useEffect(() => { const controller = new AbortController(); setLoading(true); setError(false); setData((current) => ({ ...(current ?? fallback), [activeTab]: activeTab === "usd" ? usdFallback : tetherFallback })); void fetchPrices(activeTab, controller.signal); return () => controller.abort(); }, [activeTab, fetchPrices]);
  useEffect(() => { void fetchPrices("gold"); const interval = window.setInterval(() => void fetchPrices("gold"), REFRESH_SECONDS * 1000); return () => window.clearInterval(interval); }, [fetchPrices]);
  useEffect(() => { const interval = window.setInterval(() => void fetchPrices(activeTab), REFRESH_SECONDS * 1000); return () => window.clearInterval(interval); }, [activeTab, fetchPrices]);
  useEffect(() => { const interval = window.setInterval(() => { if (activeTab !== "usd") void fetchPrices("usd"); }, REFRESH_SECONDS * 1000); return () => window.clearInterval(interval); }, [activeTab, fetchPrices]);
  useEffect(() => () => { Object.values(priceRequests.current).forEach((controller) => controller?.abort()); }, []);
  useEffect(() => { const ticker = window.setInterval(() => setRemaining((value) => value <= 1 ? REFRESH_SECONDS : value - 1), 1000); return () => window.clearInterval(ticker); }, []);
  const prices = data ?? fallback;
  const intrinsicGoldPrice = prices.goldOunce !== null && prices.usd.averagePrice !== null ? (prices.goldOunce * prices.usd.averagePrice / 31.1035) * 0.75 : null;
  return <main className={`dashboard-shell theme-${theme}`}><div className="ambient ambient-one" /><div className="ambient ambient-two" /><section className="dashboard" aria-label="نرخ‌نما"><header className="topbar"><div className="brand"><span className="brand-mark" aria-hidden="true">ن</span><span>نرخ‌نما</span></div><div className="topbar-actions"><a className="extension-download chrome" href="/downloads/nerkh-namaa-chrome.zip" download aria-label="دانلود افزونهٔ Chrome" title="دانلود افزونهٔ Chrome">C</a><a className="extension-download firefox" href="/downloads/nerkh-namaa-firefox.zip" download aria-label="دانلود افزونهٔ Firefox" title="دانلود افزونهٔ Firefox">F</a><button type="button" className="theme-toggle" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label={theme === "light" ? "فعال‌سازی حالت تیره" : "فعال‌سازی حالت روشن"}>{theme === "light" ? "☾" : "☀"}</button></div></header><div className="update-bar" aria-live="polite"><span>آخرین بروزرسانی: {timestamp(data?.updatedAt ?? null)}</span><span>{new Intl.NumberFormat("fa-IR").format(remaining)} ثانیه تا بروزرسانی</span></div>{error && <div className="notice" role="alert">دریافت قیمت‌ها فعلاً ممکن نیست؛ با بازگشت اتصال، اطلاعات خودکار بروزرسانی می‌شود.</div>}<div className="markets" aria-busy={loading}><MarketPanel market={prices.gold} title="طلای ۱۸ عیار" titleEnglish="18K GOLD · تومان / گرم" unit="تومان / گرم" tone="gold" intrinsicGoldPrice={intrinsicGoldPrice} /><MarketPanel market={prices[activeTab]} title={activeTab === "usd" ? "دلار آمریکا" : "تتر"} titleEnglish={activeTab === "usd" ? "USD · تومان" : "USDT · تومان"} unit="تومان" tone="dollar" summaryLabel={activeTab === "usd" ? "بالاترین نرخ صرافی" : "قیمت میانگین"} tabs activeTab={activeTab} onTabChange={setActiveTab} /></div><section className="method" aria-labelledby="method-title"><span className="method-icon" aria-hidden="true">◎</span><div><h2 id="method-title">روش محاسبه</h2><p>حباب هر منبع طلا از اختلاف قیمت آن با ارزش ذاتی طلای ۱۸ عیار، بر پایهٔ انس جهانی و بالاترین نرخ دلار آمریکا، محاسبه می‌شود.</p></div></section><footer><span>پایش مستقل بازار طلا و ارز</span><span>بروزرسانی خودکار هر ۲۰ ثانیه</span></footer></section></main>;
}
