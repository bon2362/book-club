// Тип для склонений псевдонимов.
// Используется в pseudonym-declensions.generated.ts (auto-generated).
export interface PseudonymDeclension {
  nom: string   // именительный (= имя)
  gen: string   // родительный: у Барсука
  dat: string   // дательный: Барсуку
  acc: string   // винительный: вижу Барсука
  ins: string   // творительный: с Барсуком
  pre: string   // предложный: о Барсуке
  gender: 'м' | 'ж' | 'с'
}

import { PSEUDONYM_DECLENSIONS } from './pseudonym-declensions.generated'

type DeclCase = 'nom' | 'gen' | 'dat' | 'acc' | 'ins' | 'pre'
type PronounForm = 'он' | 'ему' | 'его' | 'него'

// Ручные оверрайды для зверей, где russian-nouns-js ошибся.
// Заполнить при необходимости после ревью.
const OVERRIDES: Record<string, Partial<Record<DeclCase, string>>> = {
}

export function declinePseudonym(name: string, c: DeclCase): string {
  const override = OVERRIDES[name]?.[c]
  if (override) return override
  const entry = PSEUDONYM_DECLENSIONS[name]
  return entry ? entry[c] : name
}

export function pseudonymPronoun(name: string, form: PronounForm): string {
  const entry = PSEUDONYM_DECLENSIONS[name]
  const gender = entry?.gender ?? 'м'

  if (gender === 'ж') {
    const femMap: Record<PronounForm, string> = { 'он': 'она', 'ему': 'ей', 'его': 'её', 'него': 'неё' }
    return femMap[form]
  }
  if (gender === 'с') {
    const neuMap: Record<PronounForm, string> = { 'он': 'оно', 'ему': 'ему', 'его': 'его', 'него': 'него' }
    return neuMap[form]
  }
  const mascMap: Record<PronounForm, string> = { 'он': 'он', 'ему': 'ему', 'его': 'его', 'него': 'него' }
  return mascMap[form]
}
