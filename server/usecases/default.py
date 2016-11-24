
from __future__ import print_function

import tornado, os
import tornado.escape
import tornado.ioloop
from tornado.options import define, options
import tornado.options
import tornado.web
import tornado.websocket
import sys
from datetime import datetime
import time
import ujson


class UseCaseSocketHandler(tornado.websocket.WebSocketHandler):
    def __init__(self, application, request):
        super(UseCaseSocketHandler, self).__init__(application, request)
        self.currentTime = 0

    def open(self):
        self.send_start_time(self.currentTime)

    def send_start_time(self, ts_start, time_unit = 's', step=60000):
        if options.environment == 'dev':
            log("send start time: {0} ms".format(ts_start))
        msg = dict(internal="startTime", startTime=ts_start, timeUnit=time_unit, step=step)
        self.write_json(msg)


    def send_time_selection(self, ts_from, ts_to, auto_load = True):
        if options.environment == 'dev':
            log("send start time: {0} ms".format(ts_from))
        msg = dict(internal="selectTimeRange", tsFrom=ts_from, tsTo=ts_to, autoLoad=auto_load)
        self.write_json(msg)

    def write_json(self, msg):
        self.write_message(ujson.dumps(msg))



class UseCaseStaticDataHandler(tornado.web.RequestHandler):
    def get(self, usecase, filename):
        path = os.path.join(options.usecases_dir, usecase, filename)
        print(usecase + ': ' + path)
        if os.path.isfile(path) == True \
		   and (filename.endswith('.json') == True or filename.endswith('.html') == True):
            file = open(path, 'r')
            content = file.read()
            file.close()
            self.set_header('Content-Type', 'text/javascript')
            self.write(content)
        else:
            #self.clear()
            self.set_status(400)
            self.finish("{\"msg\": \"File '"+path+"' not found!\"}")


class UseCaseConfigHandler(UseCaseStaticDataHandler):
    def get(self, usecase):
        UseCaseStaticDataHandler.get(self, usecase, options.usecases_config)


def log(*args):
    if options.environment == 'dev':
        print(' '.join(args), file=sys.stderr)

def ms(ts):
    return 'utc '+str(datetime.utcfromtimestamp(ts))+' ('+str(ts)+' s)'

def ms2(ts):
    ts = ts / 1000
    return ms(ts)

class UseCaseDBSocketHandler(UseCaseSocketHandler):
    def __init__(self, application, request, timeFactor, step_unit = 'none'):
        super(UseCaseDBSocketHandler, self).__init__(application, request)
        log('inited')
        self.previous_time = 0
        #the factor to group times stamp, one means no change
        self.timeFactor = timeFactor  #TIME FACTOR in sec = 1 hour
        self.step_unit = step_unit

        #send a bulk of data ever 30 messages at onces
        self._dataItemsPerMessage = 30

        self.dt = 1
        self.db = None
        self.callback1 = None

        self.filter_in = []
        self.filter_ex = []

        self.__class__.closedTimestamp = 0
        self.__class__.closedSystemTimestamp = 0
        self.__class__.closedTimeFactor = 0

    def open(self):
        self.db = self.open_db()

        f = str(self.timeFactor)
        if self.__class__.closedSystemTimestamp <= 0:
            self.previous_time = self.find_first_ts()
            self.previous_time = int(float(self.previous_time) / self.timeFactor) #[s]
        else:
            #shift to the previous end timestamp + the real delta time inbetween
            self.timeFactor = self.__class__.closedTimeFactor
            self.previous_time = int(self.__class__.closedTimestamp + (round(time.time()) - self.__class__.closedSystemTimestamp) / self.timeFactor)

        self.send_start_time(self.previous_time)

        self.send_constant_data()

        self.callback1 = tornado.ioloop.PeriodicCallback(self.send_data, self.dt*1000) #[ms]
        self.callback1.start()

    def open_db(self):
        return None

    def find_first_ts(self):
        return 0

    def find_last_ts(self):
        return 0

    def read_constant_data(self):
        return []

    def read_data(self, start, end, time_factor):
        return []

    def send_constant_data(self):
        self.send_messages(self.read_constant_data())
        self.write_json(dict(internal='constantsSent'))

    def send_messages(self, msgs):
        bulk = []
        total = 0
        #assert that the timestamps are increasing order
        for msg in msgs:
            bulk.append(msg)
            total += 1
            if len(bulk) >= self._dataItemsPerMessage: #send a bulk of data at once
                self.send_message_bulk(bulk)
                bulk = []

        if len(bulk) > 0:
            self.send_message_bulk(bulk)
        return total

    def send_message_bulk(self, bulk):
        self.write_json(bulk)
        self.write_json({
            'internal' : 'dataBulkSent',
            'from': bulk[0]['ts'],
            'to' : bulk[len(bulk)-1]['ts']
            })

    def filter(self, prop):
        r = ''
        if self.filter_in is not None and len(self.filter_in) > 0:
            r += 'and '+prop+' in ("' + '","'.join(self.filter_in)+'") '
        if self.filter_ex is not None and len(self.filter_ex) > 0:
            r += 'and '+prop+' not in ("' + '","'.join(self.filter_ex)+'") '
        return r


    def send_data_impl(self, previous_time, act_time):
        count = self.send_messages(self.read_data(previous_time, act_time, self.timeFactor))

        log('send %s - %s = %d messages' % (ms(previous_time*self.timeFactor), ms(act_time*self.timeFactor), count))
            #if len(messages) > 0:
            #    mini = min(messages, key=lambda msg: msg['ts'])['ts']
            #    maxi = max(messages, key=lambda msg: msg['ts'])['ts']
            #    print >>sys.stderr,  '%s-%s = min %s max %s' % (self.previous_time, actTime, mini, maxi)


    def send_data(self):
        act_time = self.previous_time + self.dt #[s]
        self.send_data_impl(self.previous_time, act_time)
        self.previous_time = act_time

    def send_start_time(self, ts, time_unit = 's'):
        log('send start time: %s ms step %s ms' % (ts,self.timeFactor))
        msg = dict(internal='startTime', startTime=ts * self.timeFactor, timeUnit=time_unit, step=self.timeFactor, stepUnit=self.step_unit)
        self.write_json(msg)


    def on_message(self, message):
        log('got message ',str(message))
        parsed = ujson.loads(message)
        if 'type' not in parsed:
            return
        t = parsed['type']
        refid = parsed.get('refid','')

        #create basic response message
        msg = dict(refid=refid)

        if 'jumpTo' == t:
            msg['internal'] = 'jumpedTo'
            self.previous_time = int(parsed['time']/self.timeFactor)
            log('jump to ',ms(self.previous_time*self.timeFactor))
            if 'bulkTill' in parsed:
                till = int(parsed['bulkTill']/self.timeFactor)
                end = self.previous_time
                while (end+self.dt) < till:
                    end += self.dt
                log('send bulk till ',ms(end*self.timeFactor))
                if end > self.previous_time: #send a bulk of data
                    self.send_data_impl(self.previous_time, end)
                    self.previous_time = end
            msg['currentTime'] = self.previous_time

        elif 'startStream' == t:
            msg['internal'] = 'startedStream'
            if 'time' in parsed:
                self.previous_time = int(parsed['time']/self.timeFactor)
            running = self.callback1.is_running()
            log('start streaming at ', ms(self.previous_time*self.timeFactor), str(running))
            if not running:
                self.callback1.start()
            msg['currentTime'] = self.previous_time
            msg['previous'] = running

        elif 'stopStream' == t:
            msg['internal'] = 'stoppedStream'
            running = self.callback1.is_running()
            log('stop streaming at ', ms(self.previous_time*self.timeFactor), str(running))
            if running:
                self.callback1.stop()
            msg['previous'] = running

        elif 'load' == t:
            msg['internal'] = 'loaded'
            start = int(parsed['start']/self.timeFactor)
            end = int(parsed['end']/self.timeFactor)
            log('load data between ', ms(start*self.timeFactor), 'and', ms(end*self.timeFactor))
            if end > start: #send a bulk of data
                self.send_data_impl(start, end)
            msg['start'] = start * self.timeFactor
            msg['end'] = end * self.timeFactor

        elif 'speedup' == t:
            msg['internal'] = 'speededUp'
            self.timeFactor = int(parsed['factor'])
            log('speedup factor to ',self.timeFactor)
            msg['timeFactor'] = self.timeFactor

        elif 'setNodeFilter' == t:
            msg['internal'] = 'currentNodeFilter'
            self.filter_in = parsed.get('filter_in',[])
            self.filter_ex = parsed.get('filter_ex',[])
            log('set node filter IN ',','.join(self.filter_in), ' EX ',','.join(self.filter_ex))
            msg['filter_in'] = self.filter_in
            msg['filter_ex'] = self.filter_ex

        elif 'getNodeFilter' == t:
            msg['internal'] = 'currentNodeFilter'
            msg['filter_in'] = self.filter_in
            msg['filter_ex'] = self.filter_ex

        elif 'extentTime' == t:
            msg['internal'] = 'extentTime'
            msg['first_ts'] = self.find_first_ts()
            msg['last_ts'] = self.find_last_ts()

        else:
            msg['internal'] = 'unknown'
            msg['error'] = 'Unknown Message: '+t

        self.write_json(msg)

    def on_close(self):
        self.__class__.closedTimestamp = self.previous_time
        self.__class__.closedSystemTimestamp = round(time.time())
        self.__class__.closedTimeFactor = self.timeFactor
        if self.callback1 is not None:
            self.callback1.stop()
        if self.db is not None:
            self.db.close()
