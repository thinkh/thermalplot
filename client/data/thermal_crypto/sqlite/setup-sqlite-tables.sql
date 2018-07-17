-- international bitcoin currency information 
--DROP TABLE IF EXISTS "currency_info";
CREATE TABLE IF NOT EXISTS "currency_info"(
    currency_code	VARCHAR (10),
    currency 		TEXT
);

--DROP TABLE IF EXISTS "btc_prices";
CREATE TABLE IF NOT EXISTS "btc_prices"(
    ts              REAL,
    opening_price   REAL,
    highest_price   REAL,
    lowest_price    REAL,
    closing_price   REAL,
    volume_btc      REAL,
    volume_currency REAL,
    currency_code   VARCHAR (10),
	PRIMARY KEY (currency_code, ts) ON CONFLICT IGNORE
);

--DROP TABLE IF EXISTS "crypto_prices";
CREATE TABLE IF NOT EXISTS "crypto_prices"(
    ts              REAL,
    opening_price   REAL,
    highest_price   REAL,
    lowest_price    REAL,
    closing_price   REAL,
    volume_crypto   REAL,
    volume_btc      REAL,
    currency_code   VARCHAR (10),
	PRIMARY KEY (currency_code, ts) ON CONFLICT IGNORE
);