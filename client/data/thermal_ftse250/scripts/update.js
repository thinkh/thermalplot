require('dotenv').config()

if (!process.env.ALPHAVANTAGE_API_KEY) {
    console.error('ERROR: No API key found!');
    console.log('1. Get an API key at https://www.alphavantage.co/support/#api-key');
    console.log('2. Rename `default.env` into `.env`');
    console.log('3. Add the key `ALPHAVANTAGE_API_KEY=xxxxxxxx`');
    console.log('4. Run this script again');
    return; // exit script
}

const alpha = require('alphavantage')({ key: process.env.ALPHAVANTAGE_API_KEY });

alpha.data.daily_adjusted('msft', 'compact', 'json', '60min').then(data => {
    const polished = alpha.util.polish(data);
    console.log(polished);
});