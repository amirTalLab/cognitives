import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { TeacherQr } from '@/components/TeacherQr';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Stroop Lab',
  description: 'A high-fidelity Stroop Effect experiment with millisecond-precision timing',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-background text-foreground`}
      >
        {children}
        {/* Renders only on /…/teacher routes, so every dashboard gets it — including ones
            that do not exist yet — without seventeen near-identical edits. */}
        <TeacherQr />
      </body>
    </html>
  );
}
