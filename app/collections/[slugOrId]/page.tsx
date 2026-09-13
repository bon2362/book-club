import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { loadCollectionPageData, serializeCollection } from '@/lib/collections/repo'
import { isMissingCollectionsSchemaError } from '@/lib/collections/errors'
import { canEditCollection } from '@/lib/collections/rules'
import { markdownExcerpt } from '@/lib/collections/format'
import { viewerFromSession } from '@/lib/collections/http'
import type { CollectionViewer } from '@/lib/collections/types'
import { getUserSignupState } from '@/lib/signup-books'
import CollectionPageClient from '@/components/nd/CollectionPageClient'

export const dynamic = 'force-dynamic'

type Params = { params: { slugOrId: string } }

async function loadOrNull(ref: string, viewer: CollectionViewer) {
  try {
    return await loadCollectionPageData(ref, viewer)
  } catch (error) {
    if (isMissingCollectionsSchemaError(error)) return null
    throw error
  }
}

/** Превью ссылки в Telegram: название, начало описания и картинка из обложек. Только для опубликованной. */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const data = await loadOrNull(params.slugOrId, { userId: null, isAdmin: false })
  if (!data?.record.slug) return {}

  const { record } = data
  const title = `${record.title} — подборка`
  const description = markdownExcerpt(record.descriptionMarkdown, 200)
  const version = (record.editedAt ?? record.publishedAt ?? record.updatedAt).getTime()
  const image = { url: `/api/og/collections/${record.slug}?v=${version}`, width: 1200, height: 630 }

  return {
    title: `${title} · Долгое наступление`,
    description,
    alternates: { canonical: `/collections/${record.slug}` },
    openGraph: {
      title,
      description,
      url: `/collections/${record.slug}`,
      siteName: 'Долгое наступление',
      locale: 'ru_RU',
      type: 'website',
      images: [image],
    },
    twitter: { card: 'summary_large_image', title, description, images: [image.url] },
  }
}

export default async function CollectionPage({ params }: Params) {
  const session = await auth()
  const viewer = viewerFromSession(session)
  const data = await loadOrNull(params.slugOrId, viewer)
  if (!data) notFound()

  const { record, books } = data
  if (record.slug && params.slugOrId !== record.slug) redirect(`/collections/${record.slug}`)

  const signupState = viewer.userId ? await getUserSignupState(viewer.userId) : null

  return (
    <CollectionPageClient
      collection={serializeCollection(record)}
      books={books}
      viewer={{ isLoggedIn: Boolean(viewer.userId), isAdmin: viewer.isAdmin, canEdit: canEditCollection(record, viewer) }}
      signupState={signupState}
    />
  )
}
