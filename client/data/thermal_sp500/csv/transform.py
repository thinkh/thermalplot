__author__ = 'sam'

import csv
import argparse

import sqlite3

parser = argparse.ArgumentParser(description='DOT Importer')
parser.add_argument('--db', default="yql.db")
parser.add_argument('--stock', default="sp500.csv")
parser.add_argument('--just', nargs='+', default=None)

args = parser.parse_args()

class Stock(object):
  def __init__(self, stockline):
    self.ticker = stockline[0].strip()

if args.just is None:
  stocks = []
  with open(args.stock,'r') as f:
    stocks = [Stock(r) for i,r in enumerate(csv.reader(f,delimiter=';')) if i > 0]

with sqlite3.connect(args.db) as db:
  db.execute('CREATE TABLE IF NOT EXISTS stocks(ticker text, date text, volume int, open real, close real, adj_close real, high real, low real, change real, PRIMARY KEY (ticker, date) ON CONFLICT IGNORE )')
  db.execute('CREATE INDEX IF NOT EXISTS stocks_ticker on stocks(ticker)')
  db.execute('CREATE INDEX IF NOT EXISTS stocks_date on stocks(date)')


  def transform(ticker):
    query = 'SELECT ticker, date, volume, open, close, adj_close, high, low from stocks where ticker = ? order by date asc'
    rows = db.execute(query, (ticker,))
    prev = [None, 0]
    def compute(row):
      t = list(row)
      if prev[0] is None:
        t.append(0)
      else:
        t.append(t[4]-prev[0][4])
      prev[0] = t
      prev[1] += 1
      return t
    db.executemany('INSERT OR REPLACE INTO stocks values(?, ?, ?, ?, ?, ?, ?, ?, ?)',(compute(r) for r in rows))
    db.commit()
    print 'transformed',ticker,' ',prev[1]

if args.just is not None:
  for stock in args.just:
    transform(stock)
else:
  for stock in stocks:
    transform(stock.ticker)
