__author__ = 'sam'

from yql import YRequest
import csv
import argparse

import datetime
import os

import sqlite3

parser = argparse.ArgumentParser(description='DOT Importer')
parser.add_argument('--basedir', default='./')
parser.add_argument('--db', default='yql.db')
parser.add_argument('--stock', default='sp500.csv')
parser.add_argument('--lastrun', '-l', default=None, help='path to timestamp file to continue until now')
parser.add_argument('--just', nargs='+', default=None)
parser.add_argument('--clear', action='store_true')
parser.add_argument('--start', '-s', default=None, help='start date')
parser.add_argument('--end', '-e', default=None, help='end date')
parser.add_argument('--years', nargs='+', default=None, help='years to import')

args = parser.parse_args()

class Stock(object):
  def __init__(self, stockline):
    self.ticker = stockline[0].strip()

if args.just is None:
  stocks = []
  with open(args.basedir + args.stock,'r') as f:
    stocks = [Stock(r) for i,r in enumerate(csv.reader(f,delimiter=';')) if i > 0 and len(r) > 0]


with sqlite3.connect(args.basedir + args.db) as db:
  db.execute('CREATE TABLE IF NOT EXISTS stocks(ticker text, date text, volume int, open real, close real, adj_close real, high real, low real, change real, PRIMARY KEY (ticker, date) ON CONFLICT IGNORE )')
  db.execute('CREATE INDEX IF NOT EXISTS stocks_ticker on stocks(ticker)')
  db.execute('CREATE INDEX IF NOT EXISTS stocks_date on stocks(date)')

  if args.clear:
    db.execute('DELETE from stocks')

  def load(ticker, start, end):
    y = YRequest(table='yahoo.finance.historicaldata')
    #query = 'select * from yahoo.finance.historicaldata where symbol = @stock and startDate = @start and endDate = @end';
    #print query
    #result = y.execute(query, dict(stock=ticker, start=start,end=end),env='store://datatables.org/alltableswithkeys')
    y.add_filter('symbol',ticker)
    y.add_filter('startDate',start)
    y.add_filter('endDate',end)
    response = y.json()
    result = hasattr(response.result,'query') and response.result.query.results.quote if response.result.query.results else None
    #print dir(result), type(result)

    #stock.history = result.rows
    prev = [0]
    def toRow(row):
      if not hasattr(row,'Volume'):
        pass
      volume = int(row.Volume)
      adj_close = float(row.Adj_Close)
      high = float(row.High)
      low = float(row.Low)
      date = row.Date
      open_ = float(row.Open)
      close = float(row.Close)
      change = close - prev[0]
      prev[0] = close
      return (ticker, date, volume, open_, close, adj_close, high, low, change)
    if result is None or (result.count > 0 and not hasattr(result[0],'Volume')):
      print '\ninvalid return set: skip ' + str(result[0] if result else response.result)
    else:
      print '\b ' + ticker + ' ' + str(len(result))
      db.executemany('INSERT OR IGNORE INTO stocks values(?, ?, ?, ?, ?, ?, ?, ?, ?)',(toRow(r) for r in result))
      db.commit()

  def load_stocks(start, end):
    print '\b load stocks from ' + start + ' to ' + end
    if args.just is not None:
      for stock in args.just:
        load(stock, start, end)
    else:
      for stock in stocks:
        load(stock.ticker, start, end)

  if args.years is not None:
    for year in args.years:
      load_stocks(year+'-01-01', year+'-12-31')

  elif args.lastrun is not None and os.path.isfile(args.basedir + args.lastrun) is True:
    now = datetime.datetime.now()
    start = end = now.strftime('%Y-%m-%d')

    with open(args.basedir + args.lastrun,'r') as f:
      f.seek(0)
      start = f.readline()

    load_stocks(start, end)

    with open(args.basedir + args.lastrun,'w') as f:
      f.seek(0)
      f.write(end)

  elif args.start is not None and args.end is not None:
    load_stocks(args.start, args.end)

  else:
    print('Missing start and end date! Specify by --start and --end or --lastrun logfile.')
