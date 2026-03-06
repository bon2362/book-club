'use client'

import { useState } from 'react'
import Image from 'next/image'

function getInitials(author: string): string {
  return author
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')
}

interface Props {
  coverUrl: string | null
  title: string
  author: string
}

export default function CoverImage({ coverUrl, title, author }: Props) {
  const [imgError, setImgError] = useState(false)

  if (coverUrl && !imgError) {
    return (
      <Image
        src={coverUrl}
        alt={`Обложка: ${title}`}
        fill
        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 200px"
        style={{ objectFit: 'cover' }}
        onError={() => setImgError(true)}
      />
    )
  }

  return (
    <div
      aria-label={`Обложка: ${title}`}
      style={{
        width: '100%',
        height: '100%',
        background: '#F5F5F5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--nd-sans), system-ui, sans-serif',
          fontSize: '1.5rem',
          color: '#999',
          userSelect: 'none',
        }}
      >
        {getInitials(author)}
      </span>
    </div>
  )
}
