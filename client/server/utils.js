exports.ms = function (ts) {
    const d = new Date();
    d.setTime(ts * 1000); // [sec -> ms]
    return 'utc ' + d.toUTCString() + ' (' + ts + ' s)';
}


exports.ms2 = function (ts) {
    ts = ts / 1000
    return exports.ms(ts);
}

exports.int = function (float) {
    return Math.round(float);
}