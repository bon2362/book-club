'use client'
import Link from 'next/link'
import type { CollectionListItem } from '@/lib/collections/types'
import { textsCount } from '@/lib/collections/format'
import CoverImage from './CoverImage'
export default function CollectionStackCard({ collection, onOpen }: { collection: CollectionListItem; onOpen?: () => void }) { return <Link href={`/collections/${collection.slug}`} onClick={onOpen} data-testid="collection-card" style={{ color: 'var(--text)', textDecoration: 'none' }}><div style={{ display: 'flex', alignItems: 'flex-end', height: 104 }}>{collection.covers.map((cover, index) => <span key={cover.id} style={{ width: 56, aspectRatio: '2 / 3', marginLeft: index ? -18 : 0, zIndex: index, overflow: 'hidden', borderRight: '1px solid var(--border)' }}><CoverImage coverUrl={cover.coverUrl} title={cover.title} author={cover.author} /></span>)}</div><div style={{ paddingTop: 13 }}><span style={{ fontFamily: 'var(--nd-mono)', fontSize: 11, color: 'var(--accent)' }}>{textsCount(collection.textsCount)}</span><div style={{ fontFamily: 'var(--nd-serif)', fontWeight: 700, fontSize: 21, lineHeight: 1.16, marginTop: 8 }}>{collection.title}</div></div></Link> }
