'use client'

import type { EditorBook, SerializedCollection } from '@/lib/collections/types'
import Header from './Header'
import CollectionEditor from './CollectionEditor'

interface Props {
  isAdmin: boolean
  initial: SerializedCollection | null
  initialBooks: EditorBook[]
}

/** Клиентская обёртка с общей шапкой, чтобы страницы редактора оставались серверными. */
export default function CollectionEditorPage({ isAdmin, initial, initialBooks }: Props) {
  return (
    <>
      <Header isAdmin={isAdmin} />
      <CollectionEditor mode="author" initial={initial} initialBooks={initialBooks} />
    </>
  )
}
