import type { Metadata } from "next";
import localFont from "next/font/local";

import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const geistSans = localFont({
  variable: "--font-geist-sans",
  src: "../node_modules/next/dist/next-devtools/server/font/geist-latin.woff2",
});

const geistMono = localFont({
  variable: "--font-geist-mono",
  src: "../node_modules/next/dist/next-devtools/server/font/geist-mono-latin.woff2",
});

export const metadata: Metadata = {
  title: "Prompt Chain Tool",
  description: "Admin dashboard for managing humor flavors and flavor steps.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-white font-sans text-black transition-colors duration-200 dark:bg-gray-900 dark:text-white">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
