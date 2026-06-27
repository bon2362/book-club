import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import WikipediaEmbed from './WikipediaEmbed'
import type { WikipediaArticleDocument } from '@/lib/wikipedia/types'

const sourceUrl = 'https://en.wikipedia.org/wiki/Socialism'

const article: WikipediaArticleDocument = {
  language: 'en',
  title: 'Socialism',
  articleUrl: sourceUrl,
  historyUrl: `${sourceUrl}?action=history`,
  revisionId: 1,
  revisionTimestamp: '2026-01-01T00:00:00Z',
  nodes: [
    {
      type: 'paragraph',
      children: [
        { type: 'text', value: 'Социализм и ' },
        {
          type: 'link',
          href: 'https://en.wikipedia.org/wiki/Democracy',
          children: [{ type: 'text', value: 'демократия' }],
        },
        { type: 'text', value: '.' },
      ],
    },
  ],
}

function okResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(res => {
    resolve = res
  })
  return { promise, resolve }
}

beforeEach(() => {
  ;(global.fetch as unknown) = jest.fn().mockResolvedValue(okResponse(article))
  jest.spyOn(window, 'getSelection').mockReturnValue({ toString: () => '' } as Selection)
})

describe('WikipediaEmbed', () => {
  it('preloads on mount before disclosure is opened', async () => {
    render(
      <WikipediaEmbed sourceUrl={sourceUrl}>
        <p>Авторский текст</p>
      </WikipediaEmbed>,
    )

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/wikipedia/article?url=${encodeURIComponent(sourceUrl)}`,
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    )
    expect(screen.queryByRole('region', { name: /статья wikipedia/i })).not.toBeInTheDocument()
  })

  it('shows the article title in the collapsed card once preloaded', async () => {
    render(
      <WikipediaEmbed sourceUrl={sourceUrl}>
        <p>Авторский текст</p>
      </WikipediaEmbed>,
    )

    const title = await screen.findByText('Socialism')
    expect(title).toBeVisible()
    expect(title).toHaveClass('nd-wikipedia-embed__title')
    // The title appears in the card header without opening the reader.
    expect(screen.queryByRole('region', { name: /статья wikipedia/i })).not.toBeInTheDocument()
  })

  it('opens ready content without a second request', async () => {
    render(
      <WikipediaEmbed sourceUrl={sourceUrl}>
        <p>Авторский текст</p>
      </WikipediaEmbed>,
    )

    await waitFor(() => expect(screen.getByText('Авторский текст')).toBeVisible())
    fireEvent.click(screen.getByRole('button', { name: /wikipedia/i }))

    expect(await screen.findByRole('heading', { name: 'Socialism' })).toBeVisible()
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('exposes a native, keyboard-operable toggle button', async () => {
    render(
      <WikipediaEmbed sourceUrl={sourceUrl}>
        <p>Авторский текст</p>
      </WikipediaEmbed>,
    )
    const toggle = screen.getByRole('button', { name: /wikipedia/i })
    expect(toggle.tagName).toBe('BUTTON')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
  })

  it('shows a loading status when opened before data is ready', async () => {
    const pending = deferred<Response>()
    ;(global.fetch as jest.Mock).mockReturnValue(pending.promise)

    render(
      <WikipediaEmbed sourceUrl={sourceUrl}>
        <p>Авторский текст</p>
      </WikipediaEmbed>,
    )

    fireEvent.click(screen.getByRole('button', { name: /wikipedia/i }))
    expect(screen.getByRole('status')).toBeInTheDocument()

    pending.resolve(okResponse(article))
    expect(await screen.findByRole('heading', { name: 'Socialism' })).toBeVisible()
  })

  it('renders article links as safe external links', async () => {
    render(
      <WikipediaEmbed sourceUrl={sourceUrl}>
        <p>Авторский текст</p>
      </WikipediaEmbed>,
    )
    await waitFor(() => expect(screen.getByText('Авторский текст')).toBeVisible())
    fireEvent.click(screen.getByRole('button', { name: /wikipedia/i }))

    const link = await screen.findByRole('link', { name: 'демократия' })
    expect(link).toHaveAttribute('href', 'https://en.wikipedia.org/wiki/Democracy')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('keeps author text and offers a fallback link plus retry on error', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 503 } as Response)

    render(
      <WikipediaEmbed sourceUrl={sourceUrl}>
        <p>Авторский текст</p>
      </WikipediaEmbed>,
    )

    const fallback = await screen.findByRole('link', { name: /wikipedia/i })
    expect(fallback).toHaveAttribute('href', sourceUrl)
    expect(screen.getByText('Авторский текст')).toBeVisible()

    ;(global.fetch as jest.Mock).mockResolvedValueOnce(okResponse(article))
    fireEvent.click(screen.getByRole('button', { name: /повторить/i }))

    fireEvent.click(await screen.findByRole('button', { name: /читать статью wikipedia/i }))
    expect(await screen.findByRole('heading', { name: 'Socialism' })).toBeVisible()
  })

  it('does not toggle when the user has selected text', async () => {
    jest.spyOn(window, 'getSelection').mockReturnValue({ toString: () => 'выделенный фрагмент' } as Selection)

    render(
      <WikipediaEmbed sourceUrl={sourceUrl}>
        <p>Авторский текст</p>
      </WikipediaEmbed>,
    )
    await waitFor(() => expect(screen.getByText('Авторский текст')).toBeVisible())
    fireEvent.click(screen.getByRole('button', { name: /wikipedia/i }))

    expect(screen.queryByRole('region', { name: /статья wikipedia/i })).not.toBeInTheDocument()
  })
})
