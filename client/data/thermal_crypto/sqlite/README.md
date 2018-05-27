# Dataset

1. Download dataset from https://blog.timescale.com/analyzing-ethereum-bitcoin-and-1200-cryptocurrencies-using-postgresql-downloading-the-dataset-a1bbc2d4d992
2. Extract dataset

# Convert crypto_prices.csv

1. Open `crypto_prices.csv` Notepad++
2. Search regexp for `(\d{1,2})/(\d{1,2})/(\d{4}) (\d{2}:\d{2})` and replace with `$3-$1-$2`
3. Normal search for `-1-` and replace with `-01-`
4. Repeat for 1-9
5. Save file 

# Convert btc_prices.csv

1. Open `btc_prices.csv` Notepad++
2. Search for ` 20:00:00-04` and replace with an empty string
3. Search for ` 19:00:00-05` and replace with an empty string
4. Save file 

# Import to SQLite

1. Download http://sqlitebrowser.org/
2. Create a new database
3. Run SQL query from crypto_data.sql
4. Import each CVS at File > Import > Table from CSV file
5. Write changes to disk 