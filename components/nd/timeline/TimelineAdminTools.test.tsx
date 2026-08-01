/** @jest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react'
import TimelineAdminTools, { type TimelineSearchItem } from './TimelineAdminTools'

const base = {
  start: { year: 1900, era: 'CE' as const },
  end: undefined,
  ongoing: false,
  description: '',
  imageUrl: null,
  imageCaption: null,
}

const items: TimelineSearchItem[] = [
  { kind: 'event', item: { ...base, id: 'attached', title: 'Реформа в ленте', typeId: 't', typeTitle: 'Событие', color: '#5D7290', icon: '', note: '', visible: true } },
  { kind: 'event', item: { ...base, id: 'library', title: 'Реформа в базе', typeId: 't', typeTitle: 'Событие', color: '#5D7290', icon: '', note: '', visible: true, isLibrary: true } },
]

it('помечает прикреплённые и библиотечные результаты по-разному', () => {
  const onSelect = jest.fn()
  render(<TimelineAdminTools items={items} onCreate={jest.fn()} onSelect={onSelect} />)

  fireEvent.change(screen.getByLabelText('Найти в базе'), { target: { value: 'реформа' } })

  expect(screen.getByText('в ленте')).toBeInTheDocument()
  expect(screen.getByText('+ прикрепить')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('option', { name: /Реформа в базе/ }))
  expect(onSelect).toHaveBeenCalledWith(items[1])
})
