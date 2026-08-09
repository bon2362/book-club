import { render, screen } from '@testing-library/react'
import AppProviders from './AppProviders'
import { usePathname } from 'next/navigation'

const sessionProvider = jest.fn(({ children }: { children: React.ReactNode }) => <div data-testid="session-provider">{children}</div>)
const postHogProvider = jest.fn(({ children }: { children: React.ReactNode; identifySession?: boolean }) => <div data-testid="posthog-provider">{children}</div>)

jest.mock('next/navigation', () => ({ usePathname: jest.fn() }))
jest.mock('next-auth/react', () => ({ SessionProvider: (props: { children: React.ReactNode }) => sessionProvider(props) }))
jest.mock('@/components/PostHogProvider', () => (props: { children: React.ReactNode; identifySession?: boolean }) => postHogProvider(props))

const mockUsePathname = usePathname as jest.Mock

describe('AppProviders', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('does not mount the client SessionProvider on calendar pages', () => {
    mockUsePathname.mockReturnValue('/calendar/dolg-pervye-5000-let-istorii')

    render(<AppProviders><span>calendar</span></AppProviders>)

    expect(screen.queryByTestId('session-provider')).not.toBeInTheDocument()
    expect(postHogProvider).toHaveBeenCalledWith(expect.objectContaining({ identifySession: false }))
  })

  it('keeps the client SessionProvider on regular pages', () => {
    mockUsePathname.mockReturnValue('/matching')

    render(<AppProviders><span>matching</span></AppProviders>)

    expect(screen.getByTestId('session-provider')).toBeInTheDocument()
    expect(postHogProvider).toHaveBeenCalledWith(expect.objectContaining({ identifySession: true }))
  })
})
