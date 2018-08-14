const fs = require('fs');
const path = require('path');
const db = require('./db');

require('dotenv').config()

if (!process.env.ALPHAVANTAGE_API_KEY) {
    console.error('ERROR: No API key found!');
    console.log('1. Get an API key at https://www.alphavantage.co/support/#api-key');
    console.log('2. Rename `default.env` into `.env`');
    console.log('3. Add the key `ALPHAVANTAGE_API_KEY=xxxxxxxx`');
    console.log('4. Run this script again');
    return; // exit script
}

const BASE_PATH = path.join(__dirname, '..');

const SQLITE_DB_PATH = path.join(BASE_PATH, 'sqlite', 'data.db');
const SQLITE_SETUP_SCRIPT = path.join(BASE_PATH, 'sqlite', 'setup-sqlite-tables.sql');
const SYMBOLS_JSON = path.join(BASE_PATH, 'sqlite', 'ftse250-symbols.json');

function wait(delay) {
    console.log(`Waiting ${delay} ms`);
    return new Promise(function (resolve) {
        setTimeout(resolve, delay);
    });
}

async function updateSQLiteData() {
    const dbHandler = db.open(SQLITE_DB_PATH);
    await db.prepareTables(dbHandler, SQLITE_SETUP_SCRIPT);

    const table = 'stocks';
    const stocks = JSON.parse(fs.readFileSync(SYMBOLS_JSON, 'utf8'));
    const alpha = require('alphavantage')({ key: process.env.ALPHAVANTAGE_API_KEY });

    for (const stock of stocks.reverse()) {
        const symbol = stock.symbol;
        // check if symbol already in database
        let sql = `SELECT ts FROM stocks WHERE ticker = ? ORDER BY ts desc LIMIT 1,1`;
        const lastTimestamp = dbHandler.prepare(sql).get(symbol);

        // 'full' for initialization, 'compact' for daily updates
        const requestMode = (lastTimestamp === undefined) ? 'full' : 'compact';

        try {
            console.log(`[${symbol}] requesting ${requestMode} data...`);
            const data = await alpha.data.daily_adjusted(symbol, requestMode);
            const item = alpha.util.polish(data);
            const timepoints = Object.entries(item.data);
            console.log(`[${symbol}] inserting data...`);
            const changes = timepoints.map(timepoint => {
                const statement = dbHandler.prepare(`INSERT INTO ${table} VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                const info = statement.run(
                    symbol, // ticker
                    timepoint[0].split('T')[0], // date
                    timepoint[1].volume, // volume
                    timepoint[1].open, // open
                    timepoint[1].close, // close
                    timepoint[1].adjusted, // adj_close
                    timepoint[1].high, // high
                    timepoint[1].low, // low
                    timepoint[1].change // change
                );
                return info.changes;
            });
            const sum = changes.reduce((prev, curr) => prev + curr, 0);
            console.log(`[${symbol}] inserted ${sum} / ${timepoints.length} timepoints`);

            //await wait(5000);
        } catch (e) {
            console.error(`[${symbol}] error: "${e}"`);
        }
    }

    console.log('----------------');
    console.log('finished loading');
    db.close(dbHandler);
}

updateSQLiteData();