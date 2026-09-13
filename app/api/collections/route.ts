export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { listPublishedCollections } from '@/lib/collections/repo'
import { isMissingCollectionsSchemaError } from '@/lib/collections/errors'
import { collectionErrorResponse } from '@/lib/collections/http'

export async function GET() {
  try {
    return NextResponse.json({ collections: await listPublishedCollections() })
  } catch (error) {
    if (isMissingCollectionsSchemaError(error)) return NextResponse.json({ collections: [] })
    return collectionErrorResponse(error)
  }
}
