import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'PortPulse BD · Live route graph',
  description: 'Real public data sources feeding the Dhaka to Chattogram export route, analysed continuously.',
};

const themeInit = `(function(){try{var t=localStorage.getItem('pp-theme');if(!t){t=matchMedia('(prefers-color-scheme: light)').matches?'day':'night'}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='night'}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Newsreader:wght@500;600&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
