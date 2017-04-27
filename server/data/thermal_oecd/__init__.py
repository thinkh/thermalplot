'''
Created on 09.10.2014

@author: Samuel Gratzl
'''
from __future__ import print_function

import tornado.escape
import tornado.ioloop
from tornado.options import options
import tornado.web
import tornado.websocket
import os
import sqlite3
import sys
from datetime import datetime
import time
import calendar

from usecases.default import log
import usecases.default

base_path = os.path.dirname(__file__) + '/'
sqlite_base_path = base_path + 'sqlite/oecd.db'
base_table = 'oecd'

sqlite_fields = ['lt_interest_rate', 'st_interest_rate']

class SocketHandler(usecases.default.UseCaseDBSocketHandler):

    dateformat = '%Y-%m'

    def __init__(self, application, request):
        super(SocketHandler, self).__init__(application, request, 30*24*60*60, 'month')  #TIME FACTOR in sec = 1 month (30.44 days)
        #self.filter_in = ['46.99.8']

    def open_db(self):
        return sqlite3.connect(sqlite_base_path)

    def datetime_to_utc_seconds(self, datetime):
        return int(calendar.timegm(datetime.timetuple()))

    def find_first_ts(self):
        r = self.db.execute('select min(s.ts) from ' + base_table + ' s where 1=1 '+self.filter('key')).fetchone()[0]
        return self.datetime_to_utc_seconds(datetime.strptime(r, self.dateformat)) #.strftime('%s')

    def find_last_ts(self):
        r = self.db.execute('select max(s.ts) from ' + base_table + ' s where 1=1 '+self.filter('key')).fetchone()[0]
        return self.datetime_to_utc_seconds(datetime.strptime(r, self.dateformat)) #.strftime('%s')

    """
    def read_constant_data(self):
        import csv
        with open(base_path+'stations_constants.csv','r') as f:
            reader = csv.reader(f,delimiter='\t')
            data = [r for r in reader]
        header = data[0]
        data = data[1:]

        def to_msg(r):
            msg = dict(nip=r[0],ts=0)
            msg['attrs'] = { h : float(r[i+1]) for i,h in enumerate(header[1:]) if r[i+1] != 'NA' }
            return msg
        return (to_msg(r) for r in data)
        """

    def read_data(self, start, end, time_factor):
        def to_time(t):
            d = datetime.utcfromtimestamp(t*time_factor)
            r = str(d.year)+'-'
            if(d.month < 10):
                r += '0'
            r += str(d.month)
            return r

        log(str(time_factor),str(to_time(start)), str(to_time(end)))
        q = ('select key, ts, ' + ', '.join(sqlite_fields) +
             ' from ' + base_table + ' s where s.ts >= ? and s.ts < ?  '+ self.filter('key') +
             ' order by s.ts asc')

        it = self.db.execute(q,[to_time(start), to_time(end)])

        def convert_row(row):
            r = dict(nip=row[0],ts=self.datetime_to_utc_seconds(datetime.strptime(row[1], self.dateformat))) #int(float(row[1])*time_factor))
            for ri in row:
                if(ri == None):
                    ri = ''

            #r['attrs'] = dict(co2_emissions=row[2],gdp=row[3],life_expectancy=row[4],population_growth=row[5],total_fertility=row[6],total_population=row[7],under5mortality=row[8])
            r['attrs'] = dict()

            i=2
            for field in sqlite_fields:
                if(row[i] != '' and row[i] != None):
                    r['attrs'][field] = row[i]
                i += 1

            #print(r, row[1])
            return r

        return map(convert_row, it)


class CSVHandler(tornado.web.RequestHandler):

    def get(self, location, start, end, order_by):
        self.db = sqlite3.connect(sqlite_base_path)
        data = self.read_data(location, start, end, order_by)
        self.db.close()

        #self.set_header('Content-Type', 'text/csv')
        self.write('date,')
        self.write(','.join(sqlite_fields)+'\n')
        for line in data:
            self.write(','.join(line)+'\n')

    def read_data(self, location, start, end, order_by):
        if order_by is None:
            order_by = 'asc'

        q = ('select ts, '+ ', '.join(sqlite_fields) +
             ' from ' + base_table + ' where ts >= ? and ts < ? and key = ?' +
             ' order by ts ' + order_by)
        log(q, location, start, end)
        it = self.db.execute(q, [start, end, location])

        def convert_row(row):
            #return map(str,row)
            r = []
            for field in row:
                if(field != '' and field != None):
                    r.append(str(field))
                else:
                    r.append('')
            #print(r)
            return r

        return map(convert_row, it)

def getHandlers():
    '''
    Returns the possible Tornado handlers for this use case
    :return:
    '''
    return [
        (r'/'+options.pathname+'thermal_oecd/socket', SocketHandler),
        (r'/'+options.pathname+'thermal_oecd/csv/([\%\w\d\._]*)/(\d{4}-\d{2}-\d{2})/(\d{4}-\d{2}-\d{2})/(asc|desc)?', CSVHandler)
    ]
