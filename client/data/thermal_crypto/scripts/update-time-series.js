const fetch = require('node-fetch');

const utils = require('./utils');
const db = require('./db');
const config = require('./config');

async function _updateHistCoinData(fromSymbols, limit = 365, toSymbol = 'BTC', table = 'crypto_prices', swapFromTo = false) {
    const dbHandler = db.open(config.SQLITE_DB_PATH);
    await db.prepareTables(dbHandler, config.SQLITE_SETUP_SCRIPT);

    const symbolsCopy = fromSymbols.slice(0);

    function loadHistCoinData() {
        if (symbolsCopy.length === 0) {
            console.log('----------------');
            console.log('finished loading');
            clearInterval(timer);
            db.close(dbHandler);
            return;
        }

        symbolsCopy.splice(0, config.NUM_CONCURRENT_REQ).forEach((symbol) => {
            let fsym = symbol;
            let tsym = toSymbol;

            if (swapFromTo) {
                fsym = toSymbol;
                tsym = symbol;
            }

            console.log(`${symbol} ... start loading`);
            fetch(`${config.API_ENDPOINT}histoday?limit=${limit}&tsym=${tsym}&fsym=${fsym}`)
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
    const _symbols = await utils.getSymbols(config.INFRA_JSON);
    const symbols = _symbols.filter((s) => s !== 'BTC'); // no BTC because we store them separately in btc_prices
    console.log(symbols.length);
    _updateHistCoinData(symbols, 365, 'BTC', 'crypto_prices');

    //_updateHistCoinData(['USD', 'EUR', 'GBP', 'JPY'], 365, 'BTC', 'btc_prices', true); // true -> swap from and to
}


updateHistCoinData();