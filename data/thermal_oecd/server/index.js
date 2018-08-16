const path = require('path');
const Database = require('better-sqlite3');

const UseCaseDBSocketHandler = require('../../../server/UseCaseDBSocketHandler');
const logger = require('../../../server/logger');

const BASE_PATH = path.join(__dirname, '..');
const SQLITE_DB_PATH = path.join(BASE_PATH, 'sqlite', 'data.db');
const BASE_TABLE = 'oecd';

const SQLITE_FIELDS = ['lt_interest_rate', 'st_interest_rate'];

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
        super(socket, 30 * 24 * 60 * 60, 'month');  // TIME FACTOR in sec = 1 month (30.44 days)
        this.dateformat = 'Y-m';
    }

    open_db() {
        return open_db();
    }

    find_first_ts() {
        const row = this.db.prepare('select min(s.ts) as date from ' + BASE_TABLE + ' s where 1=1 ' + this.filter('key')).get();
        return Date.parse(row.date) / 1000; // [ms -> sec]
    }

    find_last_ts() {
        const row = this.db.prepare('select max(s.ts) from ' + BASE_TABLE + ' s where 1=1 ' + this.filter('key')).get();
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
            return r;
        }

        logger.info('read data between [%s (%d s)] and [%s (%d s)] with timeFactor: %s', to_time(start), start, to_time(end), end, time_factor);
        const sql = ('select key, ts, ' + SQLITE_FIELDS.join(',') +
            ' from ' + BASE_TABLE + ' s where s.ts >= ? and s.ts < ?  ' + this.filter('key') +
            ' order by s.ts asc')

        const rows = this.db.prepare(sql).all(to_time(start), to_time(end));

        return rows.map((row) => {
            const r = {
                nip: row.key,
                ts: Date.parse(row.ts) / 1000, // [ms -> sec] row.ts*time_factor
                attrs: {}
            };

            SQLITE_FIELDS.forEach((field) => {
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

        const sql = ('select ts, ' + SQLITE_FIELDS.join(', ') +
            ' from ' + BASE_TABLE + ' where ts >= ? and ts < ? and key = ?' +
            ' order by ts ' + order_by);

        logger.info('execute query with', { field, start, end });
        const rows = db.prepare(sql).all(start, end, field);

        close_db(db);

        // write csv header
        this.res.write('date,');
        this.res.write(SQLITE_FIELDS.join(',') + '\n');

        // write csv data
        rows.map((row) => Object.values(row))
            .forEach(line => {
                this.res.write(line.join(',') + '\n');
            });

        this.res.end();
    }
}

exports.CSVHandler = CSVHandler;