const REFRESH_MS = 20_000;
const state = { active: "gold", markets: { gold: [], usd: [], usdt: [] }, updatedAt: null, theme: "light" };
const $ = (id) => document.getElementById(id);
const extensionStorage = globalThis.browser?.storage?.local ?? globalThis.chrome?.storage?.local;
const number = (value) => new Intl.NumberFormat("fa-IR").format(Math.round(value));
const parseDigits = (value) => Number(String(value).replace(/[۰-۹]/g, (digit) => "۰۱۲۳۴۵۶۷۸۹".indexOf(digit)).replace(/[^0-9.]/g, ""));
const parseRials = (value) => Number(String(value).replace(/[۰-۹]/g, (digit) => "۰۱۲۳۴۵۶۷۸۹".indexOf(digit)).replace(/[^0-9]/g, ""));
const average = (sources) => { const prices = sources.flatMap((source) => Number.isFinite(source.price) ? [source.price] : []); return prices.length ? prices.reduce((sum, price) => sum + price, 0) / prices.length : null; };
async function text(url) { const response = await fetch(url); if (!response.ok) throw new Error(); return response.text(); }
async function json(url) { const response = await fetch(url); if (!response.ok) throw new Error(); return response.json(); }
async function safe(name, load) { try { return { name, price: await load() }; } catch { return { name, price: null }; } }
async function tgjuProfile(url) { const html = await text(url); const match = html.match(/data-col="info\.last_trade\.PDrCotVal"[^>]*>\s*([^<\s]+)/); const price = parseRials(match?.[1] ?? ""); if (!price) throw new Error(); return price / 10; }
async function usdSources() {
  const html = await text("https://www.tgju.org/currency-exchange");
  const rows = [...html.matchAll(/<tr\b[\s\S]*?<\/tr>/g)].map((item) => item[0]).filter((row) => row.includes("exchange-title")).slice(0, 5);
  return rows.map((row) => { const name = row.match(/class="exchange-title" href="[^"]+"[^>]*>\s*([^<]+?)\s*<\/a>/)?.[1].replace(/\s+/g, " ").trim() ?? "صرافی"; const value = row.match(/td-item-usd[^>]*data-item-value="([^"]+)"/)?.[1]; return { name, price: value ? parseRials(value) / 10 : null }; });
}
async function goldSources() { return Promise.all([
  safe("طلاسی", async () => parseDigits((await json("https://api.talasea.ir/api/market/getGoldPrice")).price) * 1000),
  safe("ملی‌گلد", async () => parseDigits((await json("https://melligold.com/api/v1/exchange/buy-sell-price/?symbol=XAU18&format=json")).data.price_sell)),
  safe("میلی", async () => parseDigits((await json("https://milli.gold/api/v1/public/milli-price/external")).data.price18) * 100),
  safe("شبکه طلا و ارز", async () => tgjuProfile("https://www.tgju.org/profile/geram18")),
  safe("ایران‌جیب", async () => { const html = await text("https://www.iranjib.ir/showgroup/23/gold/"); const value = html.match(/هر گرم طلای [^<]*<\/a><\/td>\s*<td[^>]*>\s*<span class="lastprice">([^<]+)/)?.[1]; return parseRials(value) / 10; })
]); }
async function tetherSources() { return Promise.all([
  safe("بیت‌پین", async () => { const data = await json("https://api.bitpin.ir/v1/mkt/markets/"); const item = data.results.find((entry) => entry.code === "USDT_IRT"); return parseDigits(item.order_book_info?.price ?? item.price); }),
  safe("تبدیل", async () => { const data = await json("https://api-web.tabdeal.org/plots/fiat-currency/converter/"); return parseDigits(data.find((item) => item.symbol === "USD").price_in_irt); }),
  safe("نوبیتکس", async () => parseDigits((await json("https://apiv2.nobitex.ir/market/stats")).stats["usdt-rls"].latest) / 10),
  safe("بیت۲۴", async () => { const html = await text("https://bit24.cash/"); return parseRials(html.match(/href="https:\/\/bit24\.cash\/coins\/usdt\/"[\s\S]{0,1200}?([0-9۰-۹,]+)\s*IRT/)?.[1]); }),
  safe("شبکه طلا و ارز", async () => tgjuProfile("https://www.tgju.org/profile/price_dollar_rl"))
]); }
function render() { const sources = state.markets[state.active]; const marketNames = { gold: "طلای ۱۸ عیار", usd: "دلار آمریکا", usdt: "تتر" }; const unit = state.active === "gold" ? "تومان / گرم" : "تومان"; const value = average(sources); $("label").textContent = marketNames[state.active]; $("average").textContent = value === null ? "—" : `${number(value)} ${unit}`; $("updated").textContent = state.updatedAt ? `بروزرسانی: ${new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit" }).format(state.updatedAt)}` : "در حال دریافت اطلاعات…"; $("sources").innerHTML = [...sources].sort((a, b) => (b.price ?? -1) - (a.price ?? -1)).map((source, index) => `<article class="source ${source.price ? "" : "offline"}"><span class="rank">${index + 1}</span><div><strong>${source.name}</strong><p>${source.price ? "فعال" : "ناموجود"}</p></div><p class="price">${source.price ? `${number(source.price)} ${unit}` : "قیمت در دسترس نیست"}</p></article>`).join(""); }
async function refresh() { $("refresh").disabled = true; $("notice").hidden = true; try { const [gold, usd, usdt] = await Promise.all([goldSources(), usdSources(), tetherSources()]); state.markets = { gold, usd, usdt }; state.updatedAt = new Date(); render(); } catch { $("notice").textContent = "دریافت اطلاعات فعلاً ممکن نیست؛ دوباره تلاش کنید."; $("notice").hidden = false; } finally { $("refresh").disabled = false; } }
function setTheme(theme, persist = true) { state.theme = theme === "dark" ? "dark" : "light"; $("theme-toggle").textContent = state.theme === "dark" ? "☀" : "☾"; $("theme-toggle").setAttribute("aria-label", state.theme === "dark" ? "فعال‌سازی حالت روشن" : "فعال‌سازی حالت تیره"); document.querySelector(".popup").classList.toggle("theme-dark", state.theme === "dark"); if (persist && extensionStorage) void extensionStorage.set({ theme: state.theme }).catch(() => undefined); }
document.querySelectorAll("[role=tab]").forEach((tab) => tab.addEventListener("click", () => { state.active = tab.dataset.market; document.querySelectorAll("[role=tab]").forEach((item) => item.setAttribute("aria-selected", String(item === tab))); render(); }));
$("refresh").addEventListener("click", refresh); $("theme-toggle").addEventListener("click", () => setTheme(state.theme === "dark" ? "light" : "dark"));
async function initialize() { try { const stored = extensionStorage ? await extensionStorage.get("theme") : {}; setTheme(stored.theme ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"), false); } catch { setTheme("light", false); } refresh(); }
initialize(); setInterval(refresh, REFRESH_MS);
