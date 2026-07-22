# Deferred work

- **Единая per-user блокировка rank mutations.** Канонический status endpoint и другие choke-points блокируют существующие `book_priorities`, но отсутствие строк не защищает от двух параллельных вставок для одного пользователя. Нужен отдельный focused change: выбрать общую advisory/user-row lock стратегию и применить её во всех путях записи рангов, а не локально в admin bugfix.
