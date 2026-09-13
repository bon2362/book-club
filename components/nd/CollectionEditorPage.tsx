'use client'
import type { EditorBook, SerializedCollection } from '@/lib/collections/types'
import Header from './Header'; import CollectionEditor from './CollectionEditor'
export default function CollectionEditorPage({isAdmin,initial,initialBooks}:{isAdmin:boolean;initial:SerializedCollection|null;initialBooks:EditorBook[]}) { return <><Header isAdmin={isAdmin}/><CollectionEditor mode="author" initial={initial} initialBooks={initialBooks}/></> }
