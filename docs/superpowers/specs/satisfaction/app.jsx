/* Composes the satisfaction-mode surfaces into the design canvas. */
const { useState } = React;

function Frame({ children, bg = 'var(--bg-input)', border = true }) {
  // Window-ish chrome so each artboard reads as a screen, editorial register.
  return (
    <div style={{
      width: '100%', height: '100%', background: bg, overflow: 'hidden',
      border: border ? '1px solid var(--border)' : 'none',
      borderTop: '2px solid var(--text)', borderRadius: 'var(--radius)',
    }}>
      {children}
    </div>
  );
}

function App() {
  return (
    <DesignCanvas>
      <DCSection
        id="admin"
        title="1 · Создание сессии — выбор режима"
        subtitle="Админка (моноширинный регистр). Новое поле «Режим подбора» в форме создания. Кликните вариант — satisfaction раскрывает, что меняется."
      >
        <DCArtboard id="admin-form" label="Форма создания сессии · с новым полем" width={460} height={620}>
          <Frame bg="var(--bg)">
            <AdminCreateSession />
          </Frame>
        </DCArtboard>
      </DCSection>

      <DCSection
        id="gate"
        title="2 · Экран ранжирования (MatchingRankingGate)"
        subtitle="Участник вступил, но рангов нет. Промежуточный экран перед доской: каталог + список с приоритетами. CTA активна при ≥1 заранжированной книге."
      >
        <DCArtboard id="gate-ranked" label="Есть приоритеты · CTA активна" width={1000} height={780}>
          <Frame border={false}>
            <RankingGate state="ranked" />
          </Frame>
        </DCArtboard>
        <DCArtboard id="gate-empty" label="Список пуст · CTA недоступна" width={1000} height={680}>
          <Frame border={false}>
            <RankingGate state="empty" />
          </Frame>
        </DCArtboard>
      </DCSection>

      <DCSection
        id="scenarios"
        title="3 · Сценарии в satisfaction"
        subtitle="Нейтральные «Сценарий 1…N» по качеству совпадений. Первый не подаётся как «оптимум»; средний ранг — основная метрика, охват — вторичен."
      >
        <DCArtboard id="scen" label="Список сценариев · нейтральный копирайт" width={620} height={840}>
          <Frame border={false}>
            <SatisfactionScenarios />
          </Frame>
        </DCArtboard>
      </DCSection>

      <DCSection
        id="adrift"
        title="4 · Баннер «вы за бортом» — смягчённый"
        subtitle="В satisfaction остаться без круга — норма by design. Баннер теряет тревожный регистр: тёплая поверхность, инфо-иконка, спокойный копирайт. Слева — текущий вид для сравнения."
      >
        <DCArtboard id="adrift-compare" label="До / после" width={780} height={560}>
          <Frame border={false}>
            <AdriftCompare />
          </Frame>
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
