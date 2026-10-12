import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'AutoCheck · A little less marking',
  description:
    'Upload a solved test paper and get clear, question-by-question AI feedback.',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
