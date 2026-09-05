const REFRESH_MS = 20_000;
const state = { active: "gold", markets: { gold: [], coin: [], usd: [], usdt: [] }, updatedAt: null, theme: "light", request: null };
const $ = (id) => document.getElementById(id);
const extensionStorage = globalThis.browser?.storage?.local ?? globalThis.chrome?.storage?.local;
const number = (value) => new Intl.NumberFormat("fa-IR").format(Math.round(value));
const parseDigits = (value) => Number(String(value).replace(/[۰-۹]/g, (digit) => "۰۱۲۳۴۵۶۷۸۹".indexOf(digit)).replace(/[^0-9.]/g, ""));
const parseRials = (value) => Number(String(value).replace(/[۰-۹]/g, (digit) => "۰۱۲۳۴۵۶۷۸۹".indexOf(digit)).replace(/[^0-9]/g, ""));
const average = (sources) => { const prices = sources.flatMap((source) => Number.isFinite(source.price) ? [source.price] : []); return prices.length ? prices.reduce((sum, price) => sum + price, 0) / prices.length : null; };
const highest = (sources) => { const prices = sources.flatMap((source) => Number.isFinite(source.price) ? [source.price] : []); return prices.length ? Math.max(...prices) : null; };
const normalizeDollarToman = (value) => { const price = Math.round(value); return price >= 10_000 && price < 100_000 ? price * 10 : price; };
const usdExchanges = [
  { name: "صرافی بانک ملی", path: "currency-exchange/30001/mex-exchange" },
  { name: "صرافی آلتین", path: "currency-exchange/95182/altinexchange-exchange" },
  { name: "صرافی اردکانی", path: "currency-exchange/97914/ardakaniexchange-exchange" },
  { name: "صرافی بانک شهر", path: "currency-exchange/34509/shahrexchange-exchange" },
  { name: "صرافی رویال", path: "currency-exchange/28402/sarafiroyal-exchange" },
];
const coinTypes = [
  { name: "سکه امامی", slug: "sekee" },
  { name: "سکه بهار آزادی", slug: "sekeb" },
  { name: "نیم سکه", slug: "nim" },
  { name: "ربع سکه", slug: "rob" },
  { name: "سکه گرمی", slug: "gerami" },
];
async function text(url, signal) { const response = await fetch(url, { signal }); if (!response.ok) throw new Error(); return response.text(); }
async function json(url, signal) { const response = await fetch(url, { signal }); if (!response.ok) throw new Error(); return response.json(); }
async function safe(name, load) { try { return { name, price: await load() }; } catch { return { name, price: null }; } }
async function tgjuProfile(url, signal) { const html = await text(url, signal); const match = html.match(/data-col="info\.last_trade\.PDrCotVal"[^>]*>\s*([^<\s]+)/); const price = parseRials(match?.[1] ?? ""); if (!price) throw new Error(); return price / 10; }
async function usdSources(signal) {
  const html = await text("https://www.tgju.org/currency-exchange", signal);
  const rows = [...html.matchAll(/<tr\b[\s\S]*?<\/tr>/g)].map((item) => item[0]);
  return usdExchanges.map((exchange) => {
    const row = rows.find((item) => item.includes(`href="${exchange.path}"`));
    const value = row?.match(/td-item-usd[^>]*data-item-value="([^"]+)"/)?.[1];
    return { name: exchange.name, price: value ? normalizeDollarToman(parseRials(value) / 10) : null };
  });
}
async function coinSources(signal) {
  const html = await text("https://www.tgju.org/coin", signal);
  const rows = [...html.matchAll(/<tr\b[\s\S]*?<\/tr>/g)].map((item) => item[0]);
  return coinTypes.map((coin) => {
    const row = rows.find((item) => item.includes(`data-market-row="${coin.slug}"`));
    const value = row?.match(/data-price="([^"]+)"/)?.[1];
    return { name: coin.name, price: value ? parseRials(value) / 10 : null };
  });
}
async function goldSources(signal) { return Promise.all([
  safe("طلاسی", async () => parseDigits((await json("https://api.talasea.ir/api/market/getGoldPrice", signal)).price) * 1000),
  safe("ملی‌گلد", async () => parseDigits((await json("https://melligold.com/api/v1/exchange/buy-sell-price/?symbol=XAU18&format=json", signal)).data.price_sell)),
  safe("میلی", async () => parseDigits((await json("https://milli.gold/api/v1/public/milli-price/external", signal)).data.price18) * 100),
  safe("شبکه طلا و ارز", async () => tgjuProfile("https://www.tgju.org/profile/geram18", signal)),
  safe("ایران‌جیب", async () => { const html = await text("https://www.iranjib.ir/showgroup/23/gold/", signal); const value = html.match(/هر گرم طلای [^<]*<\/a><\/td>\s*<td[^>]*>\s*<span class="lastprice">([^<]+)/)?.[1]; return parseRials(value) / 10; })
]); }
async function tetherSources(signal) { return Promise.all([
  safe("بیت‌پین", async () => { const data = await json("https://api.bitpin.ir/v1/mkt/markets/", signal); const item = data.results.find((entry) => entry.code === "USDT_IRT"); return parseDigits(item.order_book_info?.price ?? item.price); }),
  safe("تبدیل", async () => { const data = await json("https://api-web.tabdeal.org/plots/fiat-currency/converter/", signal); return parseDigits(data.find((item) => item.symbol === "USD").price_in_irt); }),
  safe("نوبیتکس", async () => parseDigits((await json("https://apiv2.nobitex.ir/market/stats", signal)).stats["usdt-rls"].latest) / 10),
  safe("بیت۲۴", async () => { const html = await text("https://bit24.cash/", signal); return parseRials(html.match(/href="https:\/\/bit24\.cash\/coins\/usdt\/"[\s\S]{0,1200}?([0-9۰-۹,]+)\s*IRT/)?.[1]); }),
  safe("شبکه طلا و ارز", async () => tgjuProfile("https://www.tgju.org/profile/price_dollar_rl", signal))
]); }
function render() { const sources = state.markets[state.active]; const marketNames = { gold: "طلای ۱۸ عیار", coin: "سکه", usd: "دلار آمریکا", usdt: "تتر" }; const unit = state.active === "gold" ? "تومان / گرم" : "تومان"; const value = state.active === "usd" ? highest(sources) : state.active === "coin" ? null : average(sources); $("label").textContent = state.active === "usd" ? "بالاترین نرخ صرافی" : state.active === "coin" ? "نرخ‌های زنده" : marketNames[state.active]; $("average").textContent = state.active === "coin" ? "۵ نوع سکه" : value === null ? "—" : `${number(value)} ${unit}`; $("updated").textContent = state.updatedAt ? `بروزرسانی: ${new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit" }).format(state.updatedAt)}` : "در حال دریافت اطلاعات…"; const displaySources = state.active === "coin" ? sources : [...sources].sort((a, b) => (b.price ?? -1) - (a.price ?? -1)); $("sources").innerHTML = displaySources.map((source, index) => `<article class="source ${source.price ? "" : "offline"}"><span class="rank">${index + 1}</span><div><strong>${source.name}</strong><p>${source.price ? "فعال" : "ناموجود"}</p></div><p class="price">${source.price ? `${number(source.price)} ${unit}` : "قیمت در دسترس نیست"}</p></article>`).join(""); }
async function refresh() { state.request?.abort(); const request = new AbortController(); state.request = request; $("refresh").disabled = true; $("notice").hidden = true; try { const [gold, coin, usd, usdt] = await Promise.all([goldSources(request.signal), coinSources(request.signal), usdSources(request.signal), tetherSources(request.signal)]); if (state.request !== request) return; state.markets = { gold, coin, usd, usdt }; state.updatedAt = new Date(); render(); } catch (error) { if (error.name !== "AbortError") { $("notice").textContent = "دریافت اطلاعات فعلاً ممکن نیست؛ دوباره تلاش کنید."; $("notice").hidden = false; } } finally { if (state.request === request) { state.request = null; $("refresh").disabled = false; } } }
function setTheme(theme, persist = true) { state.theme = theme === "dark" ? "dark" : "light"; $("theme-toggle").textContent = state.theme === "dark" ? "☀" : "☾"; $("theme-toggle").setAttribute("aria-label", state.theme === "dark" ? "فعال‌سازی حالت روشن" : "فعال‌سازی حالت تیره"); document.querySelector(".popup").classList.toggle("theme-dark", state.theme === "dark"); if (persist && extensionStorage) void extensionStorage.set({ theme: state.theme }).catch(() => undefined); }
document.querySelectorAll("[role=tab]").forEach((tab) => tab.addEventListener("click", () => { state.active = tab.dataset.market; document.querySelectorAll("[role=tab]").forEach((item) => item.setAttribute("aria-selected", String(item === tab))); render(); }));
$("refresh").addEventListener("click", refresh); $("theme-toggle").addEventListener("click", () => setTheme(state.theme === "dark" ? "light" : "dark"));
async function initialize() { try { const stored = extensionStorage ? await extensionStorage.get("theme") : {}; setTheme(stored.theme ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"), false); } catch { setTheme("light", false); } refresh(); }
initialize(); setInterval(refresh, REFRESH_MS); window.addEventListener("unload", () => state.request?.abort());
