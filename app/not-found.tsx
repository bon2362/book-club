import Link from 'next/link'

// 404 «Вырванная страница». Намеренно выбивается из редакторского канона:
// тупиковый экран должен читаться как отдельный объект. Стили — `.nf-*` в globals.css.
export default function NotFound() {
  return (
    <main className="nf">
      <div className="nf-prev" aria-hidden="true">
        <div className="nf-brand">
          Долгое наступление<small>книжный клуб</small>
        </div>
        <div className="nf-chapter">Глава 12</div>
        <div className="nf-lines">
          {Array.from({ length: 11 }, (_, i) => <i key={i} />)}
        </div>
        <div className="nf-pagenum">403</div>
      </div>
      <section className="nf-torn">
        <span className="sr-only">Ошибка 404</span>
        <div className="nf-num" aria-hidden="true">404</div>
        <h1 className="nf-title">
          Эту страницу<br />кто-то вырвал.
        </h1>
        <div className="nf-actions">
          <Link href="/" className="nf-btn">
            К оглавлению <span aria-hidden="true">&#8594;</span>
          </Link>
        </div>
      </section>
    </main>
  )
}
