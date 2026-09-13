/** @jest-environment node */
import { authorInitials, fetchCoverDataUrl } from './og'

const response = (type: string, ok = true) => ({
  ok,
  headers: { get: () => type },
  arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
}) as never

describe('fetchCoverDataUrl', () => {
  it('превращает PNG и JPEG в data URL', async () => {
    await expect(fetchCoverDataUrl('https://example.test/cover.png', 100, async () => response('image/png')))
      .resolves.toBe('data:image/png;base64,AQID')
    await expect(fetchCoverDataUrl('https://example.test/cover.jpg', 100, async () => response('image/jpeg; charset=binary')))
      .resolves.toMatch(/^data:image\/jpeg;base64,AQID$/)
  })

  it('не загружает неподходящий, ошибочный или пустой адрес', async () => {
    await expect(fetchCoverDataUrl('https://example.test/cover.webp', 100, async () => response('image/webp'))).resolves.toBeNull()
    await expect(fetchCoverDataUrl('https://example.test/cover.png', 100, async () => response('image/png', false))).resolves.toBeNull()
    await expect(fetchCoverDataUrl(null)).resolves.toBeNull()
  })
})

it('берёт первые буквы первых двух слов автора', () => {
  expect(authorInitials('Дэвид Гребер, младший')).toBe('ДГ')
})
