const path = require('path');
const Database = require('better-sqlite3');

const UseCaseDBSocketHandler = require('../../../server/UseCaseDBSocketHandler');
const logger = require('../../../server/logger');

const BASE_PATH = path.join(__dirname, '..');
const SQLITE_DB_PATH = path.join(BASE_PATH, 'sqlite', 'yql.db');
const TABLE_PRICES = 'prices';
const TABLE_PRICES_FIELDS = ['date', 'open', 'high', 'low', 'close', 'volume', 'adj_close'];

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

    }

    find_last_ts() {

    }

    read_data(start, end, time_factor) {
        
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

        const sql = (`select date(ts,'unixepoch')` + TABLE_PRICES_FIELDS.join(', ') +
            ' from ' + TABLE_PRICES + ' where ts >= ? and ts < ? and currency_code = ?' +
            ' order by ts ' + order_by);

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