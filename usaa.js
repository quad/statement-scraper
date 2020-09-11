const process = require('process')
process.on('unhandledRejection', e => { throw e })

const { USAA_USERNAME, USAA_PASSWORD, USAA_PIN, USAA_COOKIES } = require('secrets')
if (!USAA_USERNAME) throw new Error('no USAA_USERNAME')
if (!USAA_PASSWORD) throw new Error('no USAA_PASSWORD')
if (!USAA_PIN) throw new Error('no USAA_PIN')
if (!USAA_COOKIES) throw new Error('no USAA_COOKIES')

const puppeteer = require('puppeteer')
const path = require('path')
const fs = require('fs').promises

;(async () => {
  const browser = await puppeteer.launch()
  const page = await browser.newPage()
  await page.emulate(puppeteer.devices['iPhone SE'])

  const cookies_latest_fn = path.join(USAA_COOKIES, 'latest')
  const cookies_latest = JSON.parse(await fs.readFile(cookies_latest_fn))
  await page.setCookie(...cookies_latest)

  await page.goto('https://www.usaa.com/inet/ent_home/CpHome?action=INIT&jump=jp_default')
  await page.type('.ent-logon-jump-form #Logon input[name=j_username]', USAA_USERNAME)
  await page.type('.ent-logon-jump-form #Logon input[name=j_password]', USAA_PASSWORD)
  await Promise.all([
    page.waitForNavigation(),
    page.tap('.ent-logon-jump-form #Logon button')
  ])
  await page.type('#pinTextField', USAA_PIN)
  await Promise.all([
    page.waitForNavigation(),
    page.tap('#ida')
  ])

  await page.screenshot({path: 'screenshot.png'})

  await page.goto('https://www.usaa.com/inet/ent_edde/ViewMyDocuments/SubCategory?wa_ref=my_docs_general_all')

  document.querySelectorAll('.categoryDocsAlign .subcategories-heading-group-heading a[aria-expanded=false]'))
    .map(t => t.dispatchEvent(new Event('click')))

  const cookies_new = (await page.cookies())
    .filter(c => c.name.startsWith('usaa.com.machine.auth.'))
  const cookie_new_fn = path.join(USAA_COOKIES, Math.floor(cookies_new[0].expires))
  await fs.writeFile(cookie_new_fn, JSON.stringify(cookies_new, null, 2))
  await fs.symlink(cookie_new_fn, cookies_latest_fn)

  await browser.close()
})()
