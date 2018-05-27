const path = require('path');
const Database = require('better-sqlite3');

const UseCaseDBSocketHandler = require('../../../server/UseCaseDBSocketHandler');
const logger = require('../../../server/logger');

const BASE_PATH = path.join(__dirname, '..');
const SQLITE_DB_PATH = path.join(BASE_PATH, 'sqlite', 'crypto.db');
const TABLE_CRYPTO_PRICES = 'crypto_prices';
const TABLE_CRYPTO_PRICES_FIELDS = ['opening_price', 'highest_price', 'lowest_price', 'closing_price', 'volume_crypto', 'volume_btc'];

const TABLE_BTC_PRICES = 'btc_prices';
const TABLE_BTC_PRICES_FIELDS = ['date', 'currency_code', 'opening_price', 'highest_price', 'lowest_price', 'closing_price', 'volume_currency', 'volume_btc'];


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
        super(socket, 24 * 60 * 60, 'day');  // TIME FACTOR in sec = 1 day
        this.dateformat = 'Y-m-d';

        this.filter_in = ['ETH', 'LTC', 'IOT', 'XLM'];
    }

    open_db() {
        return open_db();
    }

    find_first_ts() {
        const row = this.db.prepare('select min(s.date) as date from ' + TABLE_CRYPTO_PRICES + ' s where 1=1 ' + this.filter('currency_code')).get();
        return Date.parse(row.date) / 1000; // [ms -> sec]
    }

    find_last_ts() {
        const row = this.db.prepare('select max(s.date) from ' + TABLE_CRYPTO_PRICES + ' s where 1=1 ' + this.filter('currency_code')).get();
        return Date.parse(row.date) / 1000; // [ms -> sec]
    }

    read_data(start, end, time_factor) {
        start *= time_factor;
        end *= time_factor;

        function to_time(t) {
            const date = new Date();
            date.setTime(t * 1000); // [sec -> ms]
            let r = date.getFullYear() + '-'
            if (date.getMonth() < 10) {
                r += '0'
            }
            r += date.getMonth() + 1; // +1 because JS counts month form 0
            r += '-';
            const day = date.getDate();
            r += (day < 10) ? '0' + day : day;
            return r;
        }

        logger.info('read data between [%s (%d s)] and [%s (%d s)] with timeFactor: %s', to_time(start), start, to_time(end), end, time_factor);
        const sql = ('select currency_code, date, ' + TABLE_CRYPTO_PRICES_FIELDS.join(',') +
            ' from ' + TABLE_CRYPTO_PRICES + ' s where s.date >= ? and s.date < ?  ' + this.filter('currency_code') +
            ' order by s.date asc')

        const rows = this.db.prepare(sql).all(to_time(start), to_time(end));

        return rows.map((row) => {
            const r = {
                nip: row.currency_code,
                ts: Date.parse(row.date) / 1000, // [ms -> sec] row.ts*time_factor
                attrs: {}
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

        const db = open_db();

        const sql = ('select ' + TABLE_BTC_PRICES_FIELDS.join(', ') +
            ' from ' + TABLE_BTC_PRICES + ' where date >= ? and date < ? and currency_code = ?' +
            ' order by date ' + order_by);

        logger.info('execute query with %s %s %s', field, start, end);
        const rows = db.prepare(sql).all(start, end, field);

        close_db(db);

        // write csv header
        this.res.write(TABLE_BTC_PRICES_FIELDS.join(',') + '\n');

        // write csv data
        rows.map((row) => Object.values(row))
            .forEach(line => {
                this.res.write(line.join(',') + '\n');
            });

        this.res.end();
    }
}

exports.CSVHandler = CSVHandler;