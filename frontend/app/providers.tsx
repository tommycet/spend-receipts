'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { useState, type ReactNode } from 'react'
import { wagmiConfig } from '@/lib/wagmi'

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // Re-poll receipts often enough that the Live Activity feed feels
        // live. wagmi's default staleTime is too generous.
        staleTime: 2_000,
        refetchInterval: 4_000,
        refetchOnWindowFocus: true,
        retry: 1,
      },
    },
  }))

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  )
}
