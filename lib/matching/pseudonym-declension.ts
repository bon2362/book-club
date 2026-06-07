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
