import type { Metadata } from 'next'
import MatchingFeaturePresentation from '@/components/nd/MatchingFeaturePresentation'

export const metadata: Metadata = {
  title: 'Презентация: читательские круги',
  description: 'Упрощенный интерактивный рассказ о сценариях читательских кругов',
}

export default function MatchingPresentationPage() {
  return <MatchingFeaturePresentation />
}
