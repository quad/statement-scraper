const process = require('process')
process.on('unhandledRejection', e => { throw e })

const { USAA_USERNAME, USAA_PASSWORD, USAA_PIN, USAA_COOKIES } = process.env
if (!USAA_USERNAME) throw new Error('no USAA_USERNAME')
if (!USAA_PASSWORD) throw new Error('no USAA_PASSWORD')
if (!USAA_PIN) throw new Error('no USAA_PIN')
if (!USAA_COOKIES) throw new Error('no USAA_COOKIES')

const commander = require('commander')
const puppeteer = require('puppeteer')
const path = require('path')
const fs = require('fs').promises

async function withBrowser (headless, context) {
  const browser = await puppeteer.launch({ headless })
  const page = await browser.newPage()
  // await page.emulate(puppeteer.devices['iPad Pro'])
  // await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 11_0_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4298.0 Safari/537.36')

  try {
    await context(page)
  } finally {
    await browser.close()
  }
}

async function withAuth (page, context) {
  const cookies_latest_fn = path.join(USAA_COOKIES, 'latest')
  const cookies_latest = JSON.parse(await fs.readFile(cookies_latest_fn))

  await page.setCookie(...cookies_latest)

  try {
    await context(page)
  } finally {
    const cookies_new = (await page.cookies())
      .filter(({ name }) => name.startsWith('usaa.com.machine.auth'))
    if (cookies_new.length) {
      const cookie_new_fn = path.join(
        USAA_COOKIES,
        Math.floor(cookies_new[0].expires).toString()
      )
      await fs.writeFile(cookie_new_fn, JSON.stringify(cookies_new, null, 2))
      await fs.unlink(cookies_latest_fn)
      await fs.symlink(path.basename(cookie_new_fn), cookies_latest_fn)
    }
  }
}

async function login (page) {
  await page.goto('https://www.usaa.com/inet/ent_home/CpHome?action=INIT&jump=jp_default')
  await page.screenshot({ path: 'screenshot-login-0.png' })

  await page.type('.ent-logon-jump-form #Logon input[name=j_username]', USAA_USERNAME)
  await page.type('.ent-logon-jump-form #Logon input[name=j_password]', USAA_PASSWORD)
  await page.screenshot({ path: 'screenshot-login-0.png' })
  await Promise.all([
    page.waitForNavigation(),
    page.click('.ent-logon-jump-form #Logon button')
  ])
  await page.screenshot({ path: 'screenshot-login-1.png' })

  await page.type('#pinTextField', USAA_PIN)
  await Promise.all([
    page.waitForNavigation(),
    page.tap('#ida')
  ])
  await page.screenshot({ path: 'screenshot-login-2.png' })
  await page.waitForSelector('#portalContent')

  await page.screenshot({ path: 'screenshot-login-3.png' })
}

withBrowser(
  !process.argv.includes('login'),
  async page => {
    await withAuth(page, login)

    await page.goto('https://www.usaa.com/inet/ent_edd/CpEdd?action=INIT')
    await page.tap('.category-folder-link .all')
    await page.waitForSelector('.documentYear-heading')

    // 'https://mobile.usaa.com/inet/ent_edde/ViewMyDocuments/SubCategory?3-1.IBehaviorListener.0-categoryDocsMainPanel-hiddenSimulationLink='
    await page.$$eval(
      '.categoryDocsAlign .subcategories-heading-group-heading a[aria-expanded=false]',
      elements => elements.forEach(e => e.click())
    )
    await page.waitForNavigation('networkidle0')

    await page.screenshot({ path: 'screenshot-dcl.png' })
  }
)
