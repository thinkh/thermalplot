const path = require('path');
const Database = require('better-sqlite3');

const UseCaseDBSocketHandler = require('../../../server/UseCaseDBSocketHandler');
const logger = require('../../../server/logger');

const BASE_PATH = path.join(__dirname, '..');
const SQLITE_DB_PATH = path.join(BASE_PATH, 'sqlite', 'oecd.db');
const BASE_TABLE = 'oecd';

const SQLITE_FIELDS = ['lt_interest_rate', 'st_interest_rate'];

/*
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

    dateformat = '%Y-%m'

    __init__(application, request):
        super(SocketHandler, self).__init__(application, request, 30*24*60*60, 'month')  // TIME FACTOR in sec = 1 month (30.44 days)
        // this.filter_in = ['46.99.8']

    open_db(self):
        return sqlite3.connect(sqlite_base_path)

    datetime_to_utc_seconds(datetime):
        return int(calendar.timegm(datetime.timetuple()))

    find_first_ts(self):
        r = this.db.execute('select min(s.ts) from ' + base_table + ' s where 1=1 '+this.filter('key')).fetchone()[0]
        return this.datetime_to_utc_seconds(datetime.strptime(r, this.dateformat)) // .strftime('%s')

    find_last_ts(self):
        r = this.db.execute('select max(s.ts) from ' + base_table + ' s where 1=1 '+this.filter('key')).fetchone()[0]
        return this.datetime_to_utc_seconds(datetime.strptime(r, this.dateformat)) // .strftime('%s')

    """
    read_constant_data(self):
        import csv
        with open(base_path+'stations_constants.csv','r') as f:
            reader = csv.reader(f,delimiter='\t')
            data = [r for r in reader]
        header = data[0]
        data = data[1:]

        to_msg(r):
            msg = dict(nip=r[0],ts=0)
            msg['attrs'] = { h : float(r[i+1]) for i,h in enumerate(header[1:]) if r[i+1] != 'NA' }
            return msg
        return (to_msg(r) for r in data)
        """

    read_data(start, end, time_factor):
        to_time(t):
            d = datetime.utcfromtimestamp(t*time_factor)
            r = str(d.year)+'-'
            if(d.month < 10):
                r += '0'
            r += str(d.month)
            return r

        logger.info(str(time_factor),str(to_time(start)), str(to_time(end)))
        q = ('select key, ts, ' + ', '.join(sqlite_fields) +
             ' from ' + base_table + ' s where s.ts >= ? and s.ts < ?  '+ this.filter('key') +
             ' order by s.ts asc')

        it = this.db.execute(q,[to_time(start), to_time(end)])

        convert_row(row):
            r = dict(nip=row[0],ts=this.datetime_to_utc_seconds(datetime.strptime(row[1], this.dateformat))) // int(float(row[1])*time_factor))
            for ri in row:
                if(ri == null):
                    ri = ''

            // r['attrs'] = dict(co2_emissions=row[2],gdp=row[3],life_expectancy=row[4],population_growth=row[5],total_fertility=row[6],total_population=row[7],under5mortality=row[8])
            r['attrs'] = dict()

            i=2
            for field in sqlite_fields:
                if(row[i] != '' and row[i] != null):
                    r['attrs'][field] = row[i]
                i += 1

            // print(r, row[1])
            return r

        return map(convert_row, it)
    }
*/

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