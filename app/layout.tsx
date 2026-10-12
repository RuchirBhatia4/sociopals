import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import { dark } from '@clerk/themes'

import { cn } from '@/lib/utils'
import { ThemeProvider } from '@/components/providers/theme-provider'
import { ModalProvider } from '@/components/providers/modal-provider'
import { SocketProvider } from '@/components/providers/socket-provider'
import { QueryProvider } from '@/components/providers/query-provider'
import { PREFS_BOOT_SCRIPT } from '@/lib/preferences-boot'

const font = Inter({ subsets: ['latin'], variable: '--font-sans' })

export const metadata: Metadata = {
  title: 'SocioPals',
  description: 'Calm, fast team chat: channels, DMs, voice and video, without the noise.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider appearance={{ baseTheme: dark, variables: { colorPrimary: 'hsl(163 78% 46%)' } }}>
      <html lang="en" suppressHydrationWarning>
        <head>
          {/* apply density / avatar preferences before first paint */}
          <script dangerouslySetInnerHTML={{ __html: PREFS_BOOT_SCRIPT }} />
        </head>
        <body className={cn(font.variable, 'font-sans bg-background')}>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem={false}
            storageKey="discord-theme"
          >
            <SocketProvider>
              <QueryProvider>
                <ModalProvider />
                {children}
              </QueryProvider>
            </SocketProvider>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  )
}
