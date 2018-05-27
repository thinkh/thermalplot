const winston = require('winston');
const util = require('util');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(info => {
            if (!info.splat) {
                info.splat = [];
            }
            return `${info.timestamp} ${info.level}:\t${util.format(info.message, ...info.splat)}\t${JSON.stringify(info.splat)}`;
        })
    ),
    transports: [
        //
        // - Write to all logs with level `info` and below to `combined.log` 
        // - Write all logs error (and below) to `error.log`.
        //
        new winston.transports.File({ filename: './logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: './logs/combined.log' })
    ]
});

//
// If we're not in production then log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
//  
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.timestamp(),
            winston.format.printf(info => {
                if (!info.splat) {
                    info.splat = [];
                }
                return `${info.timestamp} ${info.level}:\t${util.format(info.message, ...info.splat)}\t${JSON.stringify(info.splat)}`;
            })
        ),
    }));
}

module.exports = logger;