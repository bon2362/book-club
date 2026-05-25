# Качество: CI, Allure, Codecov

Проект проверяется на нескольких уровнях: статический анализ, unit-тесты, e2e-тесты, coverage и визуальная отчетность.

![Allure report](images/allure-report.png)

## Что запускается в CI

GitHub Actions workflow `CI` делает:

1. Устанавливает зависимости.
2. Запускает ESLint.
3. Запускает TypeScript typecheck.
4. Запускает Jest unit-тесты с coverage.
5. Загружает coverage в Codecov.
6. Устанавливает Playwright Chromium.
7. Запускает e2e-тесты.
8. Генерирует Allure-отчет.
9. Публикует Allure на GitHub Pages.
10. Собирает Next.js build.

## Allure

Allure показывает результаты e2e-тестов в удобном интерфейсе:

[bon2362.github.io/book-club](https://bon2362.github.io/book-club/)

Тесты размечены по областям:

- Авторизация;
- Каталог книг;
- Администрирование;
- Профиль;
- UI.

Если e2e падает, Allure и Playwright trace помогают понять, где именно сломался сценарий.

## Codecov

Codecov показывает покрытие unit-тестами:

[codecov.io/gh/bon2362/book-club](https://codecov.io/gh/bon2362/book-club)

Текущая конфигурация:

- project target: 80%;
- patch target: 70%;
- CI не падает, если сам Codecov временно недоступен.

## Playwright E2E

E2E работают в `NEXTAUTH_TEST_MODE=true`. Это включает тестовые endpoints, чтобы создавать пользователей и сессии без реального OAuth.

Ключевые сценарии:

- вход;
- Telegram auth;
- запись на книги;
- профиль;
- админка;
- каталог;
- темы;
- UI-состояния.

## Важное правило для будущих изменений

Если изменение затрагивает:

- форму;
- модалку;
- auth flow;
- сохранение состояния;
- условный рендер;
- CSS-позиционирование;
- админский workflow;

то нужен релевантный e2e-тест. Для сохранения состояния тест должен делать reload и проверять, что состояние осталось.

## Где смотреть результаты

| Что нужно | Где смотреть |
| --- | --- |
| Все проверки CI | GitHub Actions |
| E2E-отчет | GitHub Pages Allure |
| Unit coverage | Codecov |
| Последний deploy | Vercel или footer админки |
| Ошибка конкретного теста | Allure + Playwright trace |
