const process = require('process')
process.on('unhandledRejection', e => { throw e })

require('dotenv').config()

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const { program } = require('commander')

async function loadFilter(filename) {
  const rl = readline.createInterface({
    input: fs.createReadStream(filename),
    crlfDelay: Infinity
  })

  const lines = []
  for await (const line of rl) {
    lines.push(line)
  }
  return lines
}

function withoutPrefixIn(filter) {
  return item => !filter.some(f => f.startsWith(item.prefix()))
}

async function run ({ list, download }, destination, program, options) {
  const puppeteer = require('puppeteer')
  const browser = await puppeteer.launch()

  const output = destination || '.'
  const outputF = async (fn, data) => fs.promises.writeFile(path.join(output, fn), data)
  const filter = program.opts().filter ? await loadFilter(program.opts().filter) : []

  try {
    const page = await browser.newPage()
    const docs = await list(page)
    const docsToDownload = docs.filter(withoutPrefixIn(filter))

    if (program.opts().list) {
      return docsToDownload
        .map(i => i.prefix())
        .forEach(i => console.log(i))
    }

    await download(page, docsToDownload, outputF)
  } finally {
    await browser.close()
  }
}

program
  .description('Downloads (screen-scrapes) documents from sundry banking platforms')
  .option('-l, --list', 'lists documents available to download')
  .option('-f, --filter <file>', 'DO NOT download documents listed in the filter file')

program
  .command('ing [destination]')
  .description('download ING Direct AU documents into the specified directory')
  .addHelpText('after', '\nNeeds ING_CLIENT_NUMBER and ING_ACCESS_CODE to be set (supports .env file)')
  .action((destination, options) => run(require('./ing-au'), destination, program, options))

program
  .parse(process.argv)
