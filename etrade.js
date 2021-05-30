const process = require('process')
process.on('unhandledRejection', e => { throw e })

const { ETRADE_USERNAME, ETRADE_PASSWORD } = require('secrets')
if (!ETRADE_USERNAME) throw new Error('no ETRADE_USERNAME')
if (!ETRADE_PASSWORD) throw new Error('no ETRADE_PASSWORD')

const puppeteer = require('puppeteer')
const tar = require('tar-stream')
const contentDisposition = require('content-disposition')

;(async () => {
  const browser = await puppeteer.launch()
  const page = await browser.newPage()
  await page.emulate(puppeteer.devices['iPhone SE'])

  await page.goto('https://us.etrade.com/e/t/user/login')
  await page.type('#log-on-form input[name=USER]', ETRADE_USERNAME)
  await page.type('#log-on-form input[name=PASSWORD]', ETRADE_PASSWORD)
  await Promise.all([
    page.waitForNavigation(),
    page.tap('#log-on-form #logon_button')
  ])

  await page.goto('https://edoc.etrade.com/e/t/onlinedocs/docsearch?date_type=date_range&from_date=1%2F1%2F2000&to_date=12%2F31%2F9999&doc_type=stmt')

  const statements = await page.$$eval(
    '#statemt_description tr[bgcolor]',
    trs => trs.map(tr => [
      tr.querySelector('td:first-child').innerText,
      tr.querySelector('a').href
    ])
  )

  const pack = tar.pack()
  await Promise.all(
    statements.map(([date, url]) => (async (url) => {
      /* global fetch, btoa */

      const [contentDispositionHeader, data64] = await page.evaluate((url) =>
        fetch(url, { method: 'GET', credentials: 'include' })
          .then(response => {
            if (!response.ok) throw url

            return response.arrayBuffer()
              .then(buffer => new Uint8Array(buffer))
              .then(array => array.reduce((o, b) => o + String.fromCharCode(b), ''))
              .then(btoa)
              .then(body64 => [response.headers.get('content-disposition'), body64])
          }),
      url
      )

      pack.entry(
        { name: contentDisposition.parse(contentDispositionHeader).parameters.filename },
        Buffer.from(data64, 'base64')
      )
    })(url))
  )
  pack.pipe(process.stdout)

  await browser.close()
})()
