import { headers } from "next/headers";
import "./globals.css";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const image = `${protocol}://${host}/og.png`;
  const title = "طلا‌نما | قیمت تجمیعی طلا";
  const description = "پایش قیمت تجمیعی طلای ۱۸ عیار از منابع منتخب.";

  return (
    <html lang="fa" dir="rtl">
      <head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="icon" href="/favicon.svg" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={image} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={image} />
      </head>
      <body>{children}</body>
    </html>
  );
}
