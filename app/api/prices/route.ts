import { NextResponse } from "next/server";

type Source = {
  id: "talasea" | "daric" | "milli";
  name: string;
  url: string;
  price: number | null;
  status: "live" | "unavailable";
  updatedAt: string | null;
};

const now = () => new Date().toISOString();

async function requestJson(url: string) {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "GoldPool/1.0" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Upstream returned ${response.status}`);
  return response.json() as Promise<unknown>;
}

async function daric(): Promise<Source> {
  const source: Source = { id: "daric", name: "داریک", url: "https://daric.gold/", price: null, status: "unavailable", updatedAt: null };
  try {
    const data = await requestJson("https://apisc.daric.gold/loan/api/v1/User/Collateral/GetGoldlPrice") as { Data?: { BestBuyPrice?: string; BestSellPrice?: string }; IsSuccess?: boolean };
    const buy = Number(data.Data?.BestBuyPrice);
    const sell = Number(data.Data?.BestSellPrice);
    const price = (buy + sell) / 2;
    if (!data.IsSuccess || !Number.isFinite(price) || price <= 0) throw new Error("Invalid Daric price");
    return { ...source, price: Math.round(price), status: "live", updatedAt: now() };
  } catch {
    return source;
  }
}

async function milli(): Promise<Source> {
  const source: Source = { id: "milli", name: "میلی", url: "https://milli.gold/", price: null, status: "unavailable", updatedAt: null };
  try {
    const data = await requestJson("https://milli.gold/api/v1/public/milli-price/external") as { data?: { price18?: number; date?: string } };
    const rialPerMilligram = Number(data.data?.price18);
    if (!Number.isFinite(rialPerMilligram) || rialPerMilligram <= 0) throw new Error("Invalid Milli price");
    // Milli's external feed is IRR per milligram. Normalize to toman per gram.
    return { ...source, price: Math.round(rialPerMilligram * 100), status: "live", updatedAt: data.data?.date ?? now() };
  } catch {
    return source;
  }
}

async function talasea(): Promise<Source> {
  // Talasea currently protects its public page behind an anti-bot challenge.
  // Keep it visible in the pool and never substitute an inferred price.
  return { id: "talasea", name: "طلاسی", url: "https://talasea.ir/", price: null, status: "unavailable", updatedAt: null };
}

export async function GET() {
  const sources = await Promise.all([talasea(), daric(), milli()]);
  const livePrices = sources.flatMap((source) => source.price === null ? [] : [source.price]);
  const pooledPrice = livePrices.length ? Math.round(livePrices.reduce((sum, price) => sum + price, 0) / livePrices.length) : null;

  return NextResponse.json(
    { pooledPrice, sources, updatedAt: now(), refreshAfterSeconds: 20 },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
