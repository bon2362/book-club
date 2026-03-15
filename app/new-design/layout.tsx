import type { Metadata } from 'next'
import { Inter, Playfair_Display } from 'next/font/google'

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--nd-sans',
  display: 'swap',
})

const playfair = Playfair_Display({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '700'],
  variable: '--nd-serif',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Долгое наступление',
  description: 'Читательские круги',
}

export default function NewDesignLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${inter.variable} ${playfair.variable}`}
      style={{
        fontFamily: 'var(--nd-sans), system-ui, sans-serif',
        background: '#fff',
        color: '#111',
        minHeight: '100vh',
      }}
    >
      {children}
    </div>
  )
}
