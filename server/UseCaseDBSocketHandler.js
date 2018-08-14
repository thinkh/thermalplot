const UseCaseSocketHandler = require('./UseCaseSocketHandler');
const utils = require('./utils');
const logger = require('./logger');

let closedTimestamp = 0;
let closedSystemTimestamp = 0;
let closedTimeFactor = 0;

class UseCaseDBSocketHandler extends UseCaseSocketHandler {

    constructor(socket, timeFactor, step_unit = 'none') {
        super(socket);
        logger.debug('UseCaseDBSocketHandler initialized');
        this.previous_time = 0;
        // the factor to group times stamp, one means no change
        this.timeFactor = timeFactor;  // TIME FACTOR in sec = 1 hour
        this.step_unit = step_unit;

        // send a bulk of data ever 30 messages at onces
        this._dataItemsPerMessage = 30;

        this.dt = 1;
        this.db = null;
        this.callback = null;

        this.filter_in = [];
        this.filter_ex = [];

        this.socket.on('msg', (data) => {
            this.on_message(data);
        });
    }

    open() {
        this.db = this.open_db();

        if (closedSystemTimestamp <= 0) {
            this.previous_time = this.find_first_ts();
            this.previous_time = utils.int(this.previous_time / this.timeFactor); // [s]

        } else {
            // shift to the previous end timestamp + the real delta time in between
            this.timeFactor = closedTimeFactor;
            this.previous_time = utils.int((closedTimestamp + Date.now() - closedSystemTimestamp) / this.timeFactor);
        }

        this.send_start_time(this.previous_time);

        this.send_constant_data();

        this.callback = new PeriodicCallback(() => this.send_data(), this.dt * 1000); // [ms]
        this.callback.start();
    }

    open_db() {
        return null;
    }

    find_first_ts() {
        return 0;
    }

    find_last_ts() {
        return 0;
    }

    read_constant_data() {
        return [];
    }

    read_data(start, end, time_factor) {
        return [];
    }

    send_constant_data() {
        const msgs = this.read_constant_data();
        this.send_messages(msgs);
        this.socket.emit('msg', { internal: 'constantsSent' });
    }

    send_messages(msgs) {
        let bulk = [];
        let total = 0;
        // assert that the timestamps are increasing order
        msgs.forEach((msg) => {
            bulk = [...bulk, msg];
            total += 1;
            if (bulk.length >= this._dataItemsPerMessage) { // send a bulk of data at once
                this.send_message_bulk(bulk);
                bulk = [];
            }
        });
        if (bulk.length > 0) {
            this.send_message_bulk(bulk);
        }
        return total;
    }

    send_message_bulk(bulk) {
        this.socket.emit('msg', bulk);
        this.socket.emit('msg', {
            'internal': 'dataBulkSent',
            'from': bulk[0].ts,
            'to': bulk[bulk.length - 1].ts
        });
    }

    filter(prop) {
        let r = '';
        if (this.filter_in !== null && this.filter_in.length > 0) {
            r += 'and ' + prop + ' in ("' + this.filter_in.join('","') + '") ';
        }
        if (this.filter_ex !== null && this.filter_ex.length > 0) {
            r += 'and ' + prop + ' not in ("' + this.filter_ex.join('","') + '") ';
        }
        return r;
    }

    send_data_impl(previous_time, act_time) {
        const msgs = this.read_data(previous_time, act_time, this.timeFactor);
        const count = this.send_messages(msgs);

        logger.info('send %s - %s = %d messages', utils.ms(previous_time * this.timeFactor), utils.ms(act_time * this.timeFactor), count);
        // if len(messages) > 0:
        //     mini = min(messages, key=lambda msg: msg['ts'])['ts']
        //     maxi = max(messages, key=lambda msg: msg['ts'])['ts']
        //     print >>sys.stderr,  '%s-%s = min %s max %s', (this.previous_time, actTime, mini, maxi)
    }

    send_data() {
        const act_time = this.previous_time + this.dt; // [s]
        this.send_data_impl(this.previous_time, act_time);
        this.previous_time = act_time;
    }

    send_start_time(ts, time_unit = 's') {
        logger.info('send start time: %d ms step %d ms', ts, this.timeFactor);
        const msg = {
            internal: 'startTime',
            startTime: ts * this.timeFactor,
            timeUnit: time_unit,
            step: this.timeFactor,
            stepUnit: this.step_unit
        };
        logger.info('', msg);
        this.socket.emit('msg', msg);
    }

    on_message(message) {
        logger.debug('got message ' + message);
        const parsed = JSON.parse(message);

        if (!parsed.type) {
            logger.error('no message.type');
            return;
        }

        const refid = parsed.refid || '';

        // create basic response message
        const msg = {
            refid
        };

        const running = this.callback.is_running();

        switch (parsed.type) {
            case 'jumpTo':
                msg.internal = 'jumpedTo';
                this.previous_time = utils.int(parsed.time / this.timeFactor);

                logger.info('jump to %s', utils.ms(this.previous_time * this.timeFactor));

                if (parsed.bulkTill) {
                    let till = utils.int(parsed.bulkTill / this.timeFactor);
                    let end = this.previous_time;

                    while ((end + this.dt) < till) {
                        end += this.dt;
                    }

                    logger.info('send bulk till %s', utils.ms(end * this.timeFactor));

                    if (end > this.previous_time) { // send a bulk of data
                        this.send_data_impl(this.previous_time, end);
                        this.previous_time = end;
                    }
                }
                msg.currentTime = this.previous_time;
                break;

            case 'startStream':
                msg.internal = 'startedStream';

                if (parsed.time) {
                    this.previous_time = utils.int(parsed.time / this.timeFactor);
                }

                logger.info('start streaming at %s %s', utils.ms(this.previous_time * this.timeFactor), running);

                if (!running) {
                    this.callback.start()
                }
                msg.currentTime = this.previous_time;
                msg.previous = running;
                break;

            case 'startStream':
                msg.internal = 'stoppedStream';

                logger.info('stop streaming at %d %s', utils.ms(this.previous_time * this.timeFactor), running);

                if (running) {
                    this.callback.stop();
                }
                msg.previous = running;
                break;

            case 'load':
                msg.internal = 'loaded';
                const start = utils.int(parsed.start / this.timeFactor);
                const end = utils.int(parsed.end / this.timeFactor);
                logger.info('load data between %s and %s', utils.ms(start * this.timeFactor), utils.ms(end * this.timeFactor));
                if (end > start) { // send a bulk of data
                    this.send_data_impl(start, end);
                }
                msg.start = start * this.timeFactor;
                msg.end = end * this.timeFactor;
                break;

            case 'speedup':
                msg.internal = 'speededUp';
                this.timeFactor = utils.int(parsed.factor);
                logger.info('speedup factor to %d', this.timeFactor);
                msg.timeFactor = this.timeFactor;
                break;

            case 'setNodeFilter':
                msg.internal = 'currentNodeFilter';
                this.filter_in = parsed.filter_in || [];
                this.filter_ex = parsed.filter_ex || [];

                logger.info('set node filter IN %s EX %s', this.filter_in.join(','), this.filter_ex.join(','));

                msg.filter_in = this.filter_in;
                msg.filter_ex = this.filter_ex;
                break;

            case 'getNodeFilter':
                msg.internal = 'currentNodeFilter';
                msg.filter_in = this.filter_in;
                msg.filter_ex = this.filter_ex;
                break;

            case 'extentTime':
                msg.internal = 'extentTime';
                msg.first_ts = this.find_first_ts();
                msg.last_ts = this.find_last_ts();
                break;

            default:
                msg.internal = 'unknown';
                msg.error = 'Unknown Message: ' + parsed.type;
                logger.warn(msg.error);
                break;
        }

        this.socket.emit('msg', msg);
    }

    close() {
        // closedTimestamp = this.previous_time;
        // closedSystemTimestamp = Date.now();
        // closedTimeFactor = this.timeFactor;
        if (this.callback !== null) {
            this.callback.stop();
        }
        if (this.db !== null) {
            this.db.close()
        }
    }
}

module.exports = UseCaseDBSocketHandler;

class PeriodicCallback {

    constructor(callback, timeout) {
        this.callback = callback;
        this.timeout = timeout;
        this.timerId = -1;
    }

    start() {
        this.timerId = setTimeout(this.callback, this.timeout);
    }

    stop() {
        clearInterval(this.timerId);
        this.timerId = -1;
    }

    is_running() {
        return (this.timerId > 0);
    }
}