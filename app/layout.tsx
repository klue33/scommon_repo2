import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "South Common Centre — Wayfinder",
  description: "Find stores, restrooms, and routes inside South Common Centre.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>{children}</body>
    </html>
  );
}
