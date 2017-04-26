__author__ = 'holger'

import csv
import argparse

import sqlite3

parser = argparse.ArgumentParser(description='')
parser.add_argument('--basedir', default='./')
parser.add_argument('--db', default='oecd.db')
parser.add_argument('--file', default="myfile.csv")
parser.add_argument('--column', default="col_name")
parser.add_argument('--clear', action='store_true')
args = parser.parse_args()

columns_name = ['lt_interest_rate', 'st_interest_rate']
columns_type = ['real','real']

with sqlite3.connect(args.basedir + args.db) as db:

    columns = []
    i=0
    for c in columns_name:
        columns.append(columns_name[i] + ' ' + columns_type[i])
        i+=1

    columns_str = ', '.join(columns)

    db.execute('CREATE TABLE IF NOT EXISTS oecd(key text, ts text, ' + columns_str + ', PRIMARY KEY (key, ts) ON CONFLICT IGNORE )')
    db.execute('CREATE INDEX IF NOT EXISTS oecd_key on oecd(key)')
    db.execute('CREATE INDEX IF NOT EXISTS oecd_ts on oecd(ts)')

    def to_row(r):
        print r
        key = r[3].replace('"', '').replace('"', '')
        ts =  r[6].replace('"', '').replace('"', '')
        val = float(r[14])
        return val ,key, ts
        #return key, ts, val

    column = args.column
    with open(args.basedir + args.file,'r') as f:
        it = (r for (i,r) in enumerate(csv.reader(f,delimiter='|')) if i > 0) # skip first row (header)
        #r = to_row(it.next())
        #print it.next(), r,r[1],r[1] in keys
        for ri in (to_row(r) for r in it if r[3] is not None):
            #if ri[1] is not None:
            #print ri
            db.execute('UPDATE oecd SET '+column+' = ? WHERE key = ? AND ts = ?', ri)
            db.execute('INSERT OR IGNORE INTO oecd('+column+',key,ts) VALUES(?,?,?)', ri)
            #db.commit()
        #db.executemany('UPDATE air SET temperature = ? WHERE key = ? AND ts = ?',
        db.commit()
