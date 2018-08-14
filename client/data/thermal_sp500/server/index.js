const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const UseCaseDBSocketHandler = require('../../../server/UseCaseDBSocketHandler');
const logger = require('../../../server/logger');

const BASE_PATH = path.join(__dirname, '..');
const SQLITE_DB_PATH = path.join(BASE_PATH, 'sqlite', 'yql.db');
const TABLE_PRICES = 'stocks';
const TABLE_PRICES_FIELDS = ['open', 'high', 'low', 'close', 'volume', 'adj_close'];
const CONSTANTS_JSON = path.join(BASE_PATH, 'sqlite', 'sp500_constants.json');

function open_db() {
    logger.debug('connecting to sqlite db at %s', SQLITE_DB_PATH);
    return new Database(SQLITE_DB_PATH, {
        readonly: true,
        fileMustExist: true
    });
}

function close_db(db) {
    logger.debug('close connection to sqlite db at %s', SQLITE_DB_PATH);
    db.close();
}

class SocketHandler extends UseCaseDBSocketHandler {

    constructor(socket) {
        super(socket, 24 * 60 * 60);  // TIME FACTOR in sec = 1 day
        this.dateformat = 'Y-m-d';

        //this.filter_in = ['AA.L', '^FTMC'];
    }

    open_db() {
        return open_db();
    }

    find_first_ts() {
        const row = this.db.prepare(`select min(CAST(strftime('%s', s.date) AS INT)) as ts from ${TABLE_PRICES} s where 1=1 ${this.filter('ticker')}`).get();
        return row.ts; // [sec]
    }

    find_last_ts() {
        const row = this.db.prepare(`select max(CAST(strftime('%s', s.date) AS INT)) as ts from ${TABLE_PRICES} s where 1=1 ${this.filter('ticker')}`).get();
        return row.ts; // [sec]
    }

    read_constant_data() {
        const constants = JSON.parse(fs.readFileSync(CONSTANTS_JSON, 'utf8'));
        // map JSON to message format
        return constants.map((row) => {
            const attrs = Object.entries(row)
                .filter((d) => d[0] !== 'Ticker' && d[1] !== 'NA')
                .reduce((result, item) => {
                    result[item[0]] = parseFloat(item[1]); // cast to float value
                    return result;
                }, {});
            return {
                nip: row['Ticker'],
                ts: 0,
                attrs
            };
        });
    }

    read_data(start, end, time_factor) {
        start *= time_factor;
        end *= time_factor;

        logger.info('read data between [%s (%d s)] and [%s (%d s)] with timeFactor: %s', new Date(start * 1000).toUTCString(), start, new Date(end * 1000).toUTCString(), end, time_factor);
        const sql = `
            SELECT
                ticker,
                CAST(strftime('%s', s.date) AS INT) as ts,
                ${TABLE_PRICES_FIELDS.map((field) => `s.${field} as ${field}`).join(',')} 
            FROM ${TABLE_PRICES} s 
            WHERE
                s.date >= date(?, 'unixepoch') AND s.date < date(?, 'unixepoch') 
                ${this.filter('ticker')}
            ORDER BY ts ASC`;

        const rows = this.db.prepare(sql).all(start, end);

        return rows.map((row) => {
            const r = {
                nip: row.ticker,
                ts: row.ts, // [sec] // row.ts*time_factor
                attrs: {}
            };

            TABLE_PRICES_FIELDS.forEach((field) => {
                r.attrs[field] = row[field];
            });

            return r;
        });
    }
}

exports.SocketHandler = SocketHandler;


class CSVHandler {

    constructor(response) {
        this.response = response;
    }

    get(field, start, end, order_by) {
        if (order_by === null) {
            order_by = 'asc';
        }

        start = Date.parse(start) / 1000; // [ms -> sec]
        end = Date.parse(end) / 1000; // [ms -> sec]

        const db = open_db();

        const sql = (`SELECT date, ${TABLE_PRICES_FIELDS.join(', ')} 
            FROM ${TABLE_PRICES} 
            WHERE date >= date(?, 'unixepoch') AND date < date(?, 'unixepoch') AND ticker = ? 
            ORDER BY date ${order_by}`);

        logger.info(sql);
        logger.info('execute query with %s %s %s', field, start, end);
        const rows = db.prepare(sql).all(start, end, field);

        close_db(db);

        // write csv header
        this.response.write('date,' + TABLE_PRICES_FIELDS.join(',') + '\n');

        // write csv data
        rows.map((row) => Object.values(row))
            .forEach(line => {
                this.response.write(line.join(',') + '\n');
            });

        this.response.end();
    }
}

exports.CSVHandler = CSVHandler;