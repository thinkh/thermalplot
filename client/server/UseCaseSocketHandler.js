const logger = require('./logger');

class UseCaseSocketHandler {

    constructor(socket/*: SocketIOClient.Socket*/) {
        this.currentTime = 0;
        this.socket = socket;
    }

    open() {
        this.send_start_time(this.currentTime);
    }

    send_start_time(ts_start, time_unit = 's', step = 60000) {
        logger.info("send start time: %d ms", ts_start);
        const msg = {
            internal: "startTime",
            startTime: ts_start,
            timeUnit: time_unit,
            step: step
        };
        this.write_json(msg);
    }

    send_time_selection(ts_from, ts_to, auto_load = true) {
        logger.info("send start time: %d ms", ts_from)
        const msg = {
            internal: "selectTimeRange",
            tsFrom: ts_from,
            tsTo: ts_to,
            autoLoad: auto_load
        }
        this.write_json(msg);
    }

    write_json(msg) {
        this.socket.emit('msg', msg);
    }
}

module.exports = UseCaseSocketHandler;