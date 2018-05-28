const fs = require('fs');
const path = require('path');
const util = require('util');

const fetch = require('node-fetch');

const utils = require('./utils');
const db = require('./db');


const API_ENDPOINT = 'https://min-api.cryptocompare.com/data/';

const BASE_PATH = path.join(__dirname, '..');

const SQLITE_DB_PATH = path.join(BASE_PATH, 'sqlite', 'crypto.db');
const SQLITE_SETUP_SCRIPT = path.join(BASE_PATH, 'sqlite', 'crypto_data.sql');

const INFRA_JSON = path.join(BASE_PATH, 'crypto.json');

const NUM_CONCURRENT_REQ = 1;

/**
 * Update the top list of cryptocurrencies
 * @param {number} limit The number of data points to return (default: 250)
 * @param {string} tsym The currency symbol to convert into [Max character length: 10] (default: USD)
 * @param {boolean} replaceInfraJson Replace the items in the infra.json (true) or write to a separate file (default: false)
 */
async function updateTopList(limit = 50, pages = 5, tsym = 'USD', replaceInfraJson = false) {
    const infraJson = await utils.getInfraJson(INFRA_JSON);

    const promise = new Promise((resolve, reject) => {
        let newChildren = [];

        function loadTopList() {
            if (pages === 0) {
                clearInterval(timer);
                resolve(newChildren);
                return;
            }

            console.log(`loading page ${pages}`);

            fetch(`${API_ENDPOINT}top/totalvol?limit=${limit}&tsym=${tsym}&page=${pages}`)
                .then(res => res.json())
                .then(json => {
                    const r = {};
                    json.Data.forEach(item => {
                        // ThermalPlot infrastructure format
                        r[item.CoinInfo.Name] = {
                            alias: item.CoinInfo.Name,
                            title: item.CoinInfo.FullName,
                            traits: ['s']
                        };
                    });
                    console.log(`loaded ${json.Data.length} items`);
                    newChildren = [r, ...newChildren];
                });

            pages--;
        }

        const timer = setInterval(loadTopList, 2000);
    });

    Promise.all([infraJson, promise])
        .then(jsons => {
            jsons[0].root.children = Object.assign({}, ...jsons[1]);
            return jsons[0];
        })
        .then(infraJson => {
            const filename = (replaceInfraJson) ? INFRA_JSON : 'currency_info.json';

            //const writeFile = util.promisify(fs.writeFile);
            //return writeFile('currency_info.json', JSON.stringify(json))
            return new Promise(function (resolve, reject) {
                fs.writeFile(filename, JSON.stringify(infraJson), function (err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(filename);
                    }
                });
            });
        })
        .then(filename => console.log(`Top list updated with ${limit} items! The file is located at ${filename}`))
        .catch(err => {
            console.error(err);
        });
}

//updateTopList(50, 5, 'USD', true); // 5 * 50 = 250 items


async function _updateHistCoinData(fromSymbols, limit = 365, toSymbol = 'BTC', table = 'crypto_prices', swapFromTo = false) {
    const dbHandler = db.open(SQLITE_DB_PATH);
    await db.prepareTables(dbHandler, SQLITE_SETUP_SCRIPT);

    const symbolsCopy = fromSymbols.slice(0);

    function loadHistCoinData() {
        if (symbolsCopy.length === 0) {
            console.log('----------------');
            console.log('finished loading');
            clearInterval(timer);
            db.close(dbHandler);
            return;
        }

        symbolsCopy.splice(0, NUM_CONCURRENT_REQ).forEach((symbol) => {
            let fsym = symbol;
            let tsym = toSymbol;

            if (swapFromTo) {
                fsym = toSymbol;
                tsym = symbol;
            }

            console.log(`${symbol} ... start loading`);
            fetch(`${API_ENDPOINT}histoday?limit=${limit}&tsym=${tsym}&fsym=${fsym}`)
                .then(res => res.json())
                .then(json => {
                    json.Data.forEach(item => {
                        const statement = dbHandler.prepare(`INSERT INTO ${table} VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
                        const info = statement.run(
                            item.time, // ts,
                            item.open, // opening_price,
                            item.high, // highest_price,
                            item.low, // lowest_price,
                            item.close, // closing_price,
                            item.volumefrom, // volume_crypto,
                            item.volumeto, // volume_btc,
                            symbol // currency_code
                        );
                        //console.log(info);
                    });
                    return json;
                })
                .then((json) => {
                    console.log(`${symbol} ... done (${json.Data.length} rows)`);
                    console.log(`still ${symbolsCopy.length} coins to load ...`);
                });
        });
    }

    const timer = setInterval(loadHistCoinData, 2000);
}


async function updateHistCoinData() {
    const _symbols = await utils.getSymbols(INFRA_JSON);
    const symbols = _symbols.filter((s) => s !== 'BTC'); // no BTC because we store them separately in btc_prices
    console.log(symbols.length);
    _updateHistCoinData(symbols, 365, 'BTC', 'crypto_prices');

    //_updateHistCoinData(['USD', 'EUR', 'GBP', 'JPY'], 365, 'BTC', 'btc_prices', true); // true -> swap from and to
}


updateHistCoinData();