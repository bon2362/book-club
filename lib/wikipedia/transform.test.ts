import { collectWikipediaImageTitles, transformWikipediaHtml } from './transform'

const html = `
  <html><body>
    <script>alert(1)</script>
    <div class="hatnote">service note</div>
    <table class="infobox"><tr><td>infobox</td></tr></table>
    <section>
      <h2>History <span class="mw-editsection">edit</span></h2>
      <p>First <b>strong</b> paragraph with <a href="./Democracy">democracy</a>.</p>
      <ul><li>One</li><li>Two</li></ul>
      <blockquote>Quoted idea</blockquote>
      <figure typeof="mw:File/Thumb">
        <a href="./File:Attributed.jpg"><img resource="./File:Attributed.jpg" src="//upload.wikimedia.org/attributed.jpg" alt="Attributed"></a>
        <figcaption>Caption</figcaption>
      </figure>
      <figure><img resource="./File:Missing.jpg" src="//upload.wikimedia.org/missing.jpg"></figure>
      <ol class="references"><li>Reference</li></ol>
      <div class="navbox">Navigation</div>
    </section>
  </body></html>`

const attribution = {
  artist: 'Example Author',
  licenseName: 'CC BY-SA 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  descriptionUrl: 'https://commons.wikimedia.org/wiki/File:Attributed.jpg',
}

describe('transformWikipediaHtml', () => {
  it('returns only supported reading-mode nodes', () => {
    const nodes = transformWikipediaHtml({
      html,
      articleUrl: 'https://en.wikipedia.org/wiki/Socialism',
      imageAttributions: new Map([['File:Attributed.jpg', attribution]]),
    })

    expect(nodes.map(node => node.type)).toEqual(['heading', 'paragraph', 'list', 'quote', 'image'])
    expect(JSON.stringify(nodes)).not.toMatch(/alert|infobox|Reference|Navigation|Missing/)
    expect(JSON.stringify(nodes)).toContain('https://en.wikipedia.org/wiki/Democracy')
  })

  it('collects the first File: titles in document order', () => {
    expect(collectWikipediaImageTitles(html)).toEqual([
      'File:Attributed.jpg',
      'File:Missing.jpg',
    ])
  })

  it('omits images whose source is not a Wikimedia HTTPS URL', () => {
    const hostile = `
      <html><body><section>
        <figure><a href="./File:Js.jpg"><img resource="./File:Js.jpg" src="javascript:alert(1)"></a></figure>
        <figure><a href="./File:Data.jpg"><img resource="./File:Data.jpg" src="data:image/png;base64,AAAA"></a></figure>
        <figure><a href="./File:Evil.jpg"><img resource="./File:Evil.jpg" src="//evil.example.com/x.jpg"></a></figure>
      </section></body></html>`

    const nodes = transformWikipediaHtml({
      html: hostile,
      articleUrl: 'https://en.wikipedia.org/wiki/Socialism',
      imageAttributions: new Map([
        ['File:Js.jpg', attribution],
        ['File:Data.jpg', attribution],
        ['File:Evil.jpg', attribution],
      ]),
    })

    expect(nodes).toEqual([])
  })
})
