const path = require('path');
const Database = require('better-sqlite3');

const UseCaseDBSocketHandler = require('../../../server/UseCaseDBSocketHandler');
const logger = require('../../../server/logger');

const BASE_PATH = path.join(__dirname, '..');
const SQLITE_DB_PATH = path.join(BASE_PATH, 'sqlite', 'crypto.db');
const TABLE_CRYPTO_PRICES = 'crypto_prices';
const TABLE_CRYPTO_PRICES_FIELDS = ['opening_price', 'highest_price', 'lowest_price', 'closing_price', 'volume_crypto', 'volume_btc'];

const TABLE_BTC_PRICES = 'btc_prices';
const TABLE_BTC_PRICES_FIELDS = ['currency_code', 'opening_price', 'highest_price', 'lowest_price', 'closing_price', 'volume_currency', 'volume_btc'];


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

        //this.filter_in = ['ETH', 'LTC', 'IOT', 'XLM'];
    }

    open_db() {
        return open_db();
    }

    find_first_ts() {
        const row = this.db.prepare('select min(s.ts) as ts from ' + TABLE_CRYPTO_PRICES + ' s where 1=1 ' + this.filter('currency_code')).get();
        return row.ts; // [sec]
    }

    find_last_ts() {
        const row = this.db.prepare('select max(s.ts) as ts from ' + TABLE_CRYPTO_PRICES + ' s where 1=1 ' + this.filter('currency_code')).get();
        return row.ts; // [sec]
    }

    read_data(start, end, time_factor) {
        start *= time_factor;
        end *= time_factor;
        const currency = 'USD'; // fiat currency from TABLE_BTC_PRICES

        logger.info('read data between [%s (%d s)] and [%s (%d s)] with timeFactor: %s', new Date(start * 1000).toUTCString(), start, new Date(end * 1000).toUTCString(), end, time_factor);
        const sql = `
            SELECT
                cp.currency_code,
                cp.ts,
                ${TABLE_CRYPTO_PRICES_FIELDS.slice(0, -2).map((field) => `cp.${field}*bp.${field} as ${field}`).join(',')},
                cp.volume_crypto,
                cp.volume_btc,
                cp.volume_btc*bp.closing_price as volume_currency,
                cp.volume_btc as volume
            FROM ${TABLE_CRYPTO_PRICES} cp
            LEFT JOIN ${TABLE_BTC_PRICES} bp
            ON cp.ts = bp.ts
            WHERE
                bp.currency_code = '${currency}'
                AND cp.ts >= ? and cp.ts < ?
                ${this.filter('currency_code')}
            ORDER BY cp.ts ASC`;

        const rows = this.db.prepare(sql).all(start, end);

        return rows.map((row) => {
            const r = {
                nip: row.currency_code,
                ts: row.ts, // [sec] // row.ts*time_factor
                attrs: {
                    volume: row.volume
                }
            };

            TABLE_CRYPTO_PRICES_FIELDS.forEach((field) => {
                r.attrs[field] = row[field];
            });

            return r;
        });
    }
}

exports.SocketHandler = SocketHandler;


class CSVHandler {

    constructor(res) {
        this.res = res;
    }

    get(field, start, end, order_by) {
        if (order_by === null) {
            order_by = 'asc';
        }

        start = Date.parse(start) / 1000; // [ms -> sec]
        end = Date.parse(end) / 1000; // [ms -> sec]

        const db = open_db();

        const sql = (`select date(ts,'unixepoch')` + TABLE_BTC_PRICES_FIELDS.join(', ') +
            ' from ' + TABLE_BTC_PRICES + ' where ts >= ? and ts < ? and currency_code = ?' +
            ' order by ts ' + order_by);

        logger.info('execute query with %s %s %s', field, start, end);
        const rows = db.prepare(sql).all(start, end, field);

        close_db(db);

        // write csv header
        this.res.write('date,' + TABLE_BTC_PRICES_FIELDS.join(',') + '\n');

        // write csv data
        rows.map((row) => Object.values(row))
            .forEach(line => {
                this.res.write(line.join(',') + '\n');
            });

        this.res.end();
    }
}

exports.CSVHandler = CSVHandler;