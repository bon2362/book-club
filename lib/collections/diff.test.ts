import { diffCollection, summarizeDiff } from './diff'

const base = { title: 'Т', descriptionMarkdown: 'Раз', displayName: 'Аня', bookIds: ['a', 'b', 'c'] }
describe('diffCollection', () => {
  it('показывает добавления, удаления и текстовые изменения', () => {
    const diff = diffCollection(base, { ...base, title: 'Новое', bookIds: ['a', 'c', 'd'] })
    expect(diff.added).toEqual(['d']); expect(diff.removed).toEqual(['b']); expect(diff.moved).toEqual([])
    expect(diff.title).toEqual({ before: 'Т', after: 'Новое' }); expect(summarizeDiff(diff)).toEqual({ added: 1, removed: 1, textChanged: true, orderChanged: false })
  })
  it('отражает только относительную перестановку сохранившихся книг', () => {
    expect(diffCollection(base, { ...base, bookIds: ['b', 'a', 'c'] }).moved).toEqual([{ bookId: 'b', from: 2, to: 1 }, { bookId: 'a', from: 1, to: 2 }])
    expect(diffCollection(base, { ...base, bookIds: ['b', 'c'] }).moved).toEqual([])
  })
})
