import assert from "node:assert/strict";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}

test("server-renders the Nerkhnama dashboard and sharing metadata", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<html lang="fa" dir="rtl">/);
  assert.match(html, /<title>نرخ‌نما \| قیمت طلا و بالاترین نرخ دلار<\/title>/);
  assert.match(html, /طلا و دلار، در یک نگاه/);
  assert.match(html, /قیمت میانگین/);
  assert.match(html, /property="og:image" content="https:\/\/localhost:3000\/og.png"/);
  assert.doesNotMatch(html, /قیمت تجمیعی|codex-preview|SkeletonPreview/);
});

test("price API is present in the production worker", async () => {
  const response = await render("/api/prices");
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.refreshAfterSeconds, 20);
  assert.equal(payload.gold.sources.length, 5);
  assert.equal(payload.dollar.sources.length, 5);
});
