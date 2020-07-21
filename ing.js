const process = require('process')
process.on('unhandledRejection', e => { throw e })

const { ING_CLIENT_NUMBER, ING_ACCESS_CODE } = require('secrets')
if (!ING_CLIENT_NUMBER) throw new Error('no ING_CLIENT_NUMBER')
if (!ING_ACCESS_CODE) throw new Error('no ING_ACCESS_CODE')

const puppeteer = require('puppeteer')
const tar = require('tar-stream')
const contentDisposition = require('content-disposition')
const { login } = require('ing-au-login')
const axios = require('axios')

;(async () => {
  /* globals instance */

  const browser = await puppeteer.launch()
  const page = await browser.newPage()

  await login(page, ING_CLIENT_NUMBER, ING_ACCESS_CODE)

  const statementAccounts = await axios.post(
    'https://www.ing.com.au/api/EStatementAccounts/Service/EStatementAccountsService.svc/json/EStatementAccounts/EStatementAccounts',
    '',
    {
      headers: {
        'content-type': 'application/json',
        'x-authtoken': await page.evaluate(() => instance.client.token),
        'x-messagesignature': await page.evaluate(() => document.querySelector('ing-key-store').signMessage('X-AuthToken:' + instance.client.token))
      }
    })
    .then(response => response.data.Response.Accounts.map(acct => ({
      AccountNumber: acct.AccountNumber,
      ProductName: acct.ProductName
    })))

  const getStatementBody = JSON.stringify({ AccountNumber: statementAccounts[0].AccountNumber, PeriodType: '7' })
  const statements = await axios.post(
    'https://www.ing.com.au/api/GetStatements/Service/GetStatementsService.svc/json/GetStatements/GetStatements',
    getStatementBody,
    {
      headers: {
        'content-type': 'application/json',
        'x-authtoken': await page.evaluate(() => instance.client.token),
        'x-messagesignature': await page.evaluate((body) => document.querySelector('ing-key-store').signMessage('X-AuthToken:' + instance.client.token + body), getStatementBody)
      }
    }
  ).then(response => response.data.Response.Items)

  const response = await axios.post(
    'https://www.ing.com.au/api/EStatementRetrieveDocument/Service/EStatementRetrieveDocumentService.svc/json/EStatementRetrieveDocument/EStatementRetrieveDocument',
    new URLSearchParams({
      'X-AuthToken': await page.evaluate(() => instance.client.token),
      AccountNumber: statementAccounts[0].AccountNumber,
      ProductName: statementAccounts[0].ProductName,
      Id: statements[0].Id
    }),
    { responseType: 'arraybuffer' }
  )

  const pack = tar.pack()
  pack.entry(
    { name: contentDisposition.parse(response.headers['content-disposition']).parameters.filename },
    response.data
  )
  pack.pipe(process.stdout)

  await browser.close()
})()
