# FTSE 250 Use Case

## Installation

1. Run `npm install`
2. Get an API key at https://www.alphavantage.co/support/#api-key
3. Rename `default.env` into `.env`
4. Add the key `ALPHAVANTAGE_API_KEY=xxxxxxxx`


## Update list of items

By default a list of the top 250 stocks (as of May 2016) is already pre-configured.
If you wish to update the list run `npm run update-items`.


## Update time series data

Run `npm run update-items`