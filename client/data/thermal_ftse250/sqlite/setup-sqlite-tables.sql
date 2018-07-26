--DROP TABLE IF EXISTS "stocks";
CREATE TABLE IF NOT EXISTS "stocks"(
    ticker text,
    date text,
    volume int,
    open real,
    close real,
    adj_close real,
    high real,
    low real,
    change real,
    PRIMARY KEY (ticker, ts) ON CONFLICT IGNORE 
);

CREATE INDEX IF NOT EXISTS stocks_ticker on stocks(ticker);
CREATE INDEX IF NOT EXISTS stocks_date on stocks(date);