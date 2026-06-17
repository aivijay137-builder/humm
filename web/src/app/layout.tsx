import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Her Health Hub — PCOS Care Platform',
  description: 'Interactive demo of a PCOS care-plan domain model',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-rose-50 text-slate-800">
        <nav className="bg-purple-700 text-white shadow-md">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
            <Link href="/" className="font-bold text-lg tracking-tight hover:text-purple-200 transition-colors">
              Her Health Hub
            </Link>
            <div className="flex items-center gap-4 text-sm">
              <Link href="/" className="hover:text-purple-200 transition-colors">
                Members
              </Link>
              <Link
                href="/coordinator"
                className="bg-purple-500 hover:bg-purple-400 px-3 py-1.5 rounded-md transition-colors"
              >
                Coordinator
              </Link>
            </div>
          </div>
        </nav>

        <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
          {children}
        </main>

        <footer className="mt-16 border-t border-purple-200 bg-white py-6 text-center text-xs text-slate-400 px-4">
          <p className="max-w-2xl mx-auto">
            Demo prototype only — not medical advice. All member data is fictional.
            Domain logic powered by the Her Health Hub TypeScript model.
          </p>
        </footer>
      </body>
    </html>
  );
}
