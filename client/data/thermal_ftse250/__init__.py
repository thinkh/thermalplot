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
import ujson

from usecases.default import log
import usecases.default

base_path = os.path.dirname(__file__) + '/'
sqlite_base_path = base_path + 'sqlite/yql.db'


class Broadcaster(object):
    def __init__(self):
        self.listeners = set()

    def add_listener(self, listener):
        self.listeners.add(listener)

    def remove_listener(self, listener):
        self.listeners.remove(listener)

    def broadcast(self, msg):
        for listener in self.listeners:
            listener.write_json(msg)

global_broadcaster = Broadcaster()

class SocketHandler(usecases.default.UseCaseDBSocketHandler):

    def __init__(self, application, request):
        super(SocketHandler, self).__init__(application, request, 60*60*24)  #TIME FACTOR in sec = 1 day

        self.filter_ex = ['^FTSE']
        self.filter_in = []

        global_broadcaster.add_listener(self)


    def open(self):
        usecases.default.UseCaseDBSocketHandler.open(self)
        # disable streaming by default, because this use case loads data on demand
        running = self.callback1.is_running()
        if running:
            self.callback1.stop()

    def open_db(self):
        return sqlite3.connect(sqlite_base_path)

    def on_close(self):
        super(SocketHandler, self).on_close()
        global_broadcaster.remove_listener(self)

    def find_first_ts(self):
        return self.db.execute('select strftime("%s", min(s.date)) from stocks s where 1=1 '+self.filter('ticker')).fetchone()[0]

    def find_last_ts(self):
        return self.db.execute('select strftime("%s", max(s.date)) from stocks s where 1=1 '+self.filter('ticker')).fetchone()[0]

    def read_data(self, start, end, time_factor):
        f = str(time_factor)+'.0'
        def to_time(t):
            d = datetime.utcfromtimestamp(t*time_factor)
            return d.strftime('%Y-%m-%d')

        #ticker text, date text, volume int, open real, close real, adj_close real, high real, low real, change real
        q = ('select ticker, round(strftime("%s", date(s.date))/'+f+',1) as t, volume, open, close, adj_close, high, low, change'+
             ' from stocks s where s.date >= ? and s.date < ?  '+ self.filter('ticker') +
             ' order by s.date asc')
        it = self.db.execute(q,[to_time(start), to_time(end)])

        def convert_row(row):
            #full: ticker text, date text, volume int, open real, close real, adj_close real, high real, low real, change real
            r = dict(nip=row[0],ts=int(float(row[1])*time_factor))
            r['attrs'] = dict(volume=row[2], open=row[3], close=row[4], adj_close=row[5],high=row[6],low=row[7],change=row[8])
            #print r
            return r

        return map(convert_row, it)


    def on_message(self, message):
        parsed = ujson.loads(message)
        if 'type' not in parsed:
            return

        if 'broadcast' == parsed['type']:
            parsed['internal'] = parsed['type']
            global_broadcaster.broadcast(parsed)
            #self.write_json(msg) # sending in broadcast

        # for all other messages use the parent function
        else:
            super(SocketHandler, self).on_message(message)


class StockCSVHandler(tornado.web.RequestHandler):

    fields = ['date', 'open', 'high', 'low', 'close', 'volume', 'adj_close']

    def get(self, ticker, start, end, order_by):
        self.db = sqlite3.connect(sqlite_base_path)
        data = self.read_data(ticker, start, end, order_by)
        self.db.close()

        self.set_header('Content-Type', 'text/csv')
        self.write(','.join(self.fields)+'\n')
        for line in data:
            self.write(','.join(line)+'\n')

    def read_data(self, ticker, start, end, order_by):
        if order_by is None:
            order_by = 'asc'

        #ticker text, date text, volume int, open real, close real, adj_close real, high real, low real, change real
        q = ('select '+ ', '.join(self.fields) +
             ' from stocks s where s.date >= ? and s.date < ? and ticker = ?' +
             ' order by s.date ' + order_by)
        log(q, ticker, start, end)
        it = self.db.execute(q, [start, end, ticker])

        def convert_row(row):
            #full: ticker text, date text, volume int, open real, close real, adj_close real, high real, low real, change real
            #r = dict(date=row[1], volume=row[2], open=row[3], close=row[4], adj_close=row[5],high=row[6],low=row[7],change=row[8])
            #print(r)
            #return r
            return map(str,row)

        return map(convert_row, it)

def getHandlers():
    '''
    Returns the possible Tornado handlers for this use case
    :return:
    '''
    return [
        (r'/'+options.pathname+'thermal_ftse250/socket', SocketHandler),
        (r'/'+options.pathname+'thermal_ftse250/csv/([\%\^\w]*)/(\d{4}-\d{2}-\d{2})/(\d{4}-\d{2}-\d{2})/(asc|desc)?', StockCSVHandler)
    ]