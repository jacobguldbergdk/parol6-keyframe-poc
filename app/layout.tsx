import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PAROL6 Timeline Editor",
  description: "Timeline-based waypoint editor for PAROL6 robot",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link href="https://fonts.googleapis.com/icon?family=Material+Icons&display=block" rel="stylesheet" />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
