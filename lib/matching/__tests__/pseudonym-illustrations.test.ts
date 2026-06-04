import { getPseudonymPhoto } from '../pseudonym-illustrations'
import { SPECIES_PHOTOS } from '../species-images.generated'

describe('getPseudonymPhoto', () => {
  it('возвращает запись для ника, у которого есть фото', () => {
    const keys = Object.keys(SPECIES_PHOTOS)
    expect(keys.length).toBeGreaterThan(0)
    const known = keys[0]
    const photo = getPseudonymPhoto(known)
    expect(photo).not.toBeNull()
    expect(photo!.file).toMatch(/^\/matching\/species\/.+\.webp$/)
    expect(photo!.license).toBeTruthy()
    expect(photo!.author).toBeTruthy()
  })

  it('возвращает null для неизвестного ника', () => {
    expect(getPseudonymPhoto('__нет-такого-вида__')).toBeNull()
  })
})
