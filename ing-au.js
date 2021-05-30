const { ING_CLIENT_NUMBER, ING_ACCESS_CODE } = process.env
if (!ING_CLIENT_NUMBER) throw new Error('no ING_CLIENT_NUMBER')
if (!ING_ACCESS_CODE) throw new Error('no ING_ACCESS_CODE')

const { login } = require('ing-au-login')
const axios = require('axios')
const contentDisposition = require('content-disposition')

const sign = (page, body) => page.evaluate(body => ({
  'x-authtoken': instance.client.token,
  'x-messagesignature': document
    .querySelector('ing-key-store')
    .signMessage('X-AuthToken:' + instance.client.token + body)
}), body)

const signedPost = async (page, url, body) => axios.post(
  url, body, {
    headers: { 'content-type': 'application/json', ...await sign(page, body) }
  }
)

class Document {
  constructor(account, date, id, product) {
    this.account = account
    this.date = date
    this.id = id
    this.product = product
  }

  prefix(filename) {
    const date = this.date.replace('-', '')
    return `${this.account}-${date}-${this.id}` + (filename ? `-${filename}` : '')
  }
}

module.exports = {
  list: async (page) => {
    await login(page, ING_CLIENT_NUMBER, ING_ACCESS_CODE)

    const accountsR = await signedPost(
      page,
      'https://www.ing.com.au/api/EStatementAccounts/Service/EStatementAccountsService.svc/json/EStatementAccounts/EStatementAccounts',
      '')
    const accounts = accountsR.data.Response.Accounts.map(account => ({
        AccountNumber: account.AccountNumber,
        ProductName: account.ProductName
      }))

    const documentRPs = accounts.map(
      async ({ AccountNumber, ProductName }) => {
        const response = await signedPost(
          page,
          'https://www.ing.com.au/api/GetStatements/Service/GetStatementsService.svc/json/GetStatements/GetStatements',
          JSON.stringify({ AccountNumber, PeriodType: '7' }))

        return response.data.Response.Items.map(item =>
          new Document(AccountNumber, item.StartDate, item.Id, ProductName))
      })

    const documentRs = await Promise.all(documentRPs)

    return documentRs.flat()
  },
  download: async (page, docs, output) => {
    const documentPs = docs.map(
      async (doc) => {
          const response = await axios.post(
            'https://www.ing.com.au/api/EStatementRetrieveDocument/Service/EStatementRetrieveDocumentService.svc/json/EStatementRetrieveDocument/EStatementRetrieveDocument',
            new URLSearchParams({
              'X-AuthToken': await page.evaluate(() => instance.client.token),
              AccountNumber: doc.account,
              ProductName: doc.product,
              Id: doc.id,
            }),
            { responseType: 'arraybuffer' }
          )

        const filename = contentDisposition
          .parse(response.headers['content-disposition'])
          .parameters
          .filename

        await output(doc.prefix(filename), response.data)
      }
    )

    await Promise.all(documentPs)
  },
}
