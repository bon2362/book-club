'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'

const HIDE_THRESHOLD = 60  // px — начинаем скрывать после этого
const TOP_THRESHOLD = 10   // px — у самого верха всегда показываем

interface ScrollHideContextValue {
  isHidden: boolean
}

const ScrollHideContext = createContext<ScrollHideContextValue>({ isHidden: false })

export function ScrollHideProvider({ children }: { children: React.ReactNode }) {
  const [isHidden, setIsHidden] = useState(false)
  const lastScrollY = useRef(0)

  useEffect(() => {
    function handleScroll() {
      const y = window.scrollY

      if (y < TOP_THRESHOLD) {
        setIsHidden(false)
        lastScrollY.current = y
        return
      }

      const scrollingDown = y > lastScrollY.current

      if (scrollingDown && y > HIDE_THRESHOLD) {
        setIsHidden(true)
      } else if (!scrollingDown) {
        setIsHidden(false)
      }
      // scrollY между TOP_THRESHOLD и HIDE_THRESHOLD при скролле вниз — без изменений

      lastScrollY.current = y
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <ScrollHideContext.Provider value={{ isHidden }}>
      {children}
    </ScrollHideContext.Provider>
  )
}

export function useScrollHide() {
  return useContext(ScrollHideContext)
}
