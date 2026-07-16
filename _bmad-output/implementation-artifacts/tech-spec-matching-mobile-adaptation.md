---
title: 'Адаптация книжного Matching для мобильных экранов'
type: 'feature'
created: '2026-07-16'
status: 'done'
baseline_commit: '61ed3b19fba3a1d150faedee5b490c620fe230e7'
context:
  - 'docs/features/matching.md'
  - 'docs/features/testing.md'
  - 'app/globals.css'
---

# Адаптация книжного Matching для мобильных экранов

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Книжный режим функционально работает на телефоне, но его шапка, карточки и диалог книги не соответствуют подготовленному мобильному прототипу; вкладки также позволяют случайно оставить скрытый сценарный режим.

**Approach:** При ширине до 540px сохранить текущую модель и компоненты, но перестроить их в компактную книжную доску: единое меню сессии, полноширинные карточки и нижний лист книги. Desktop и административный режим не регрессируют.

## Boundaries & Constraints

**Always:** Использовать существующие данные/API и дизайн-токены; сохранить `CoverImage`, split-кнопку и актуальную механику авто-записи; мобильные цели нажатия не меньше 44px; поддержать 360–540px, клавиатуру, reduced motion и safe-area.

**Ask First:** Любое изменение бизнес-правил матчинга, API, БД или desktop-композиции.

**Never:** Не переносить рамку iPhone и её отступ 58px, placeholder-обложки, цвета/радиусы прототипа литералами; не создавать отдельную мобильную страницу или дублирующую модель состояния.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Mobile entry | Book mode initialized; viewport becomes ≤540px while scenarios selected | UI switches to books and hides mode tabs | No transient scenario-only blank board |
| Session menu | Mobile participant opens header menu | Session meta, participants, viewer mark, tail and leave action fit viewport | Existing locked/admin/observer leave rules remain |
| Assigned viewer | Viewer already belongs to a circle | Own card stays emphasized; other cards are dim and actionless | No mutation affordance is exposed |
| Book detail | Mobile user opens a book | Full-width 90svh sheet with 96×144 cover and readable participant chips | ×, scrim, Escape and downward drag close; short drag returns sheet |

</frozen-after-approval>

## Code Map

- `components/nd/MatchingHeader.tsx` -- shared desktop/mobile session header and participant popover.
- `components/nd/MatchingRealtimeClient.tsx` -- mode selection and responsive book-mode enforcement.
- `components/nd/MatchingBookCard.tsx` -- card states, including assigned-viewer dimming.
- `components/nd/MatchingBookDetailModal.tsx` -- responsive modal/bottom-sheet interaction.
- `app/globals.css` -- canonical Matching mobile geometry and token-based styling.
- `e2e/matching-layout.spec.ts` -- existing responsive layout goldens.
- `docs/features/matching.md`, `docs/wiki/Matching.md` -- technical and owner-facing behavior.

## Tasks & Acceptance

**Execution:**
- [ ] `MatchingHeader.tsx` + tests -- add adaptive hamburger trigger, mobile session metadata, viewer-by-ref marker, participant tail and in-popover leave action while retaining desktop header.
- [ ] `MatchingRealtimeClient.tsx` + tests -- force initialized book sessions to books on entering mobile and hide tabs there.
- [ ] `MatchingBookCard.tsx` + tests -- expose `is-dim` for cards locked by another assignment.
- [ ] `MatchingBookDetailModal.tsx` + tests -- align mobile content hierarchy and add accessible drag-down dismissal.
- [ ] `app/globals.css` -- reproduce 393px composition with tokens: header, 56×80 cards, full-width CTA, 96×144 sheet, no horizontal overflow.
- [ ] `e2e/matching-layout.spec.ts` -- update two existing goldens only; assert bounding boxes, book-only mobile mode, menu, cards and sheet.
- [ ] Matching docs -- document responsive behavior without changing product semantics.

**Acceptance Criteria:**
- At 393px and 360px the header, cards, controls, menus and sheet remain inside the viewport and the page scrolls naturally.
- Mobile shows books only; desktop still offers both tabs and preserves its participant header.
- All seven prototype states remain recognizable using production data, copy and current auto-enroll behavior.
- No new raw color, radius or shadow literals are introduced.

## Spec Change Log

## Design Notes

**Visual thesis:** a quiet editorial book board: cover and title lead; terracotta records intent; green marks a found circle; whitespace and thin status lines carry hierarchy.

**Content plan:** session identity and state in the top row; secondary session facts in the menu; decision guidance once; then ranked books, counts, action and circle roster; long metadata only in the bottom sheet.

**Interaction thesis:** one obvious primary action per card, progressive disclosure for auto-enroll and session details, and a bottom sheet that preserves context while supporting touch, keyboard and focus return.

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` -- all static and unit checks pass.
- `npm run test:e2e:focused -- e2e/matching-layout.spec.ts --grep "393px keeps cards|board preserves controls"` -- updated mobile layout goldens pass.
- `npm run build` -- production build succeeds.

**Manual checks:**
- Compare real `/matching` at 393×852 against all seven handoff states; inspect 360px, desktop, keyboard focus and reduced motion.
