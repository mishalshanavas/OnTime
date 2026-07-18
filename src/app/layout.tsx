import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ArriveOnTime",
  description: "Hackathon demo for timed metro arrivals and checkout automation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
