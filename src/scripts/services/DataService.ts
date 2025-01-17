import * as angular from 'angular';
import * as d3 from 'd3';
import * as $ from 'jquery';
import * as io from 'socket.io-client';
import { Socket } from 'socket.io-client';
import { Infrastructure, parseNode, Node, AttributeContainer } from "../models/Infrastructure";
import Animator, { PVDAnimator, createStepper } from './Animator';
import DataSelection, { PVDDataSelection } from './DataSelection';
import InfrastructureLoader, { PVDInfrastructureLoader } from './InfrastructureLoader';
import { nextID } from '../directives/VisUtils';

enum TimeUnit {
  //μs, // microsecond
  ms, // millisecond
  s // second
}

class TimeConverter {

  public static serverTimeUnit = TimeUnit.s;
  public static visTimeUnit = TimeUnit.ms;

  constructor() {
  }

  public static fromServer(serverTS: number): number {
    // no convertions for same units
    if (TimeConverter.serverTimeUnit === TimeConverter.visTimeUnit) {
      return serverTS;
    }

    var baseTime = TimeConverter.convertUnitToMs(serverTS, TimeConverter.serverTimeUnit); // in milliseconds
    return TimeConverter.convertMsToUnit(baseTime, TimeConverter.visTimeUnit);
  }

  public static toServer(visTS: number): number {
    // no convertions for same units
    if (TimeConverter.serverTimeUnit === TimeConverter.visTimeUnit) {
      return visTS;
    }

    var baseTime = TimeConverter.convertUnitToMs(visTS, TimeConverter.visTimeUnit); // in milliseconds
    return TimeConverter.convertMsToUnit(baseTime, TimeConverter.serverTimeUnit);
  }

  private static convertUnitToMs(ts, unit): number {
    switch (unit) {
      case TimeUnit.s:
        return ts * 1000;

      case TimeUnit.ms:
      default:
        return ts;
    }
  }

  private static convertMsToUnit(ts, unit): number {
    switch (unit) {
      case TimeUnit.s:
        return ts / 1000;

      case TimeUnit.ms:
      default:
        return ts;
    }
  }
}


/**
 * connects to the websocket service, parses messages and pushes the values to the corresponding attributes
 */
export class PVDDataService {
  private socket: SocketIOClient.Socket = null;
  private listeners = d3.dispatch('open', 'error', 'close', 'message', 'internalMessage', 'bulkSent', 'startedStream', 'stoppedStream');

  /**
   * cache of infrastructure.id -> then fqname->node and alias->node
   * @type {Map<any>}
   */
  private _cacheByInfra: d3.Map<d3.Map<Node>> = d3.map();

  private _defaultInfra: Infrastructure;

  private _maxTimestamp = 0;

  private _prevUseCase = '';

  private callbacks = {};

  private initialMessages = [];

  private promises = {
    initialized: $.Deferred(),
    constantsLoaded: $.Deferred()
  };

  constructor(private pvdAnimator: PVDAnimator,
    private pvdDataSelection: PVDDataSelection,
    private pvdInfrastructureLoader: PVDInfrastructureLoader) {

  }

  reset() {
    this.disconnect();
    this._cacheByInfra = d3.map();
    this._defaultInfra = null;
    this._maxTimestamp = 0;
  }

  set useCase(value) {
    this._prevUseCase = value;
  }

  /**
   * set the default infrastructure
   * @param infrastructure
   */
  set infrastructure(infrastructure: Infrastructure) {
    this._defaultInfra = infrastructure;
  }

  private nodes(infrastructure: Infrastructure = this._defaultInfra): d3.Map<Node> {
    var nodes = this._cacheByInfra.get(infrastructure.id);

    // build nodes cache
    if (nodes === undefined) {
      nodes = d3.map();
      this._cacheByInfra.set(infrastructure.id, nodes);

      infrastructure.nodes().forEach((node) => {
        nodes.set(node.fqname, node);
        if (node.alias) {
          nodes.set(node.alias, node);
        }
      });
    }

    return nodes;
  }

  on(type: string, listener?) {
    if (arguments.length < 2)
      return this.listeners.on(type);
    this.listeners.on(type, listener);
    return this;
  }

  when(type: string, listener?) {
    if (arguments.length < 2) {
      return this.promises[type].promise();
    }
    this.promises[type].promise().then(listener);
  }

  private fire(type: string, ...args: any[]) {
    this.listeners[type].apply(this, args);
  }

  /**
   * largest timestamp received
   * @returns {number}
   */
  get maxTimeStamp() {
    return this._maxTimestamp;
  }

  /**
   * whether the service is connected to a dataservice
   * @returns {boolean}
   */
  get isConnected() {
    return this.socket !== null && this.socket.connected;
  }

  /**
   * conntect to the webservice by the given uri
   * @param uri
   * @returns {boolean}
   */
  connect(useCase = this._prevUseCase): boolean {
    if (this.isConnected) {
      return false;
    }
    console.log('Connect to WebSocket');

    this.socket = io({
      autoConnect: false,
      query: {
        uc: useCase
      }
    });

    this.socket.on('connect', () => this.onopen());
    this.socket.on('disconnect', () => this.onclose());
    this.socket.on('connect_error', (error) => this.onerror((<ErrorEvent>error)));
    this.socket.on('error', (error) => this.onerror((<ErrorEvent>error)));
    this.socket.on('timeout', (error) => this.onerror((<ErrorEvent>error)));
    this.socket.on('msg', (msg) => this.onmessage(msg));

    this.socket.connect();

    return true;
  }

  /**
   * disconnects from the webservice
   * @returns {boolean}
   */
  disconnect(): boolean {
    if (!this.isConnected) {
      return false;
    }
    console.log('Disconnect from WebSocket');
    this.socket.disconnect();
    this.socket = null;
    return true;
  }

  /**
   * sends the given message to the socket, returns true if it was successfully sent
   * @param msg
   * @returns {boolean}
   */
  send(msg: any): boolean {
    if (!this.isConnected) {
      return false;
    }
    if ($.isPlainObject(msg)) {
      msg = JSON.stringify(msg);
    }
    console.debug('send message: ', msg);
    if (!this.isConnected) {
      this.initialMessages.push(msg);
    } else {
      this.socket.emit('msg', msg);
    }
    return true;
  }

  private onclose() {
    console.debug('onclose');
    this.disconnect(); // executed on disconnect from server
    this.fire('close');
  }

  private onopen() {
    console.debug('onopen', this.initialMessages);
    this.initialMessages.forEach((m) => this.socket.emit('msg', m));
    this.initialMessages = [];
    this.fire('open');
  }

  private onerror(error: ErrorEvent) {
    console.error('onerror', error);
    this.fire('error', error);
  }

  private onmessage(msg: any) {
    msg = this.parse(msg);
    if (msg === null || msg === undefined) {
      return;
    }
    if (Array.isArray(msg)) {
      for (var i = 0; i < msg.length; ++i) {
        this.fire('message', msg[i]);
        this.handleMessage(msg[i]);
      }
    } else {
      this.fire('message', msg);
      this.handleMessage(msg);
    }
  }

  private parse(msg: any): any {
    var obj = msg;
    if (typeof msg === 'string') { //test if it is a json code
      try {
        obj = JSON.parse(msg);
      } catch (e) {
        console.error("can't parse websocket message: " + msg, e);
      }
    }
    return obj;
  }

  private handleMessage(msg: any): void {
    //console.info('msg: ',JSON.stringify(msg));
    if (msg.nip) {
      this.handleNodeMessage(msg);
    } else if (msg.sip && msg.dip) {
      this.handleEdgeMessage(msg);
    } else if (msg.internal) {
      this.handleInternalMessage(msg);
    } else {
      console.warn('unknown message: ', JSON.stringify(msg));
    }
  }

  private fireCallback(msg) {
    var refid = msg.refid || '';
    if (refid in this.callbacks) {
      this.callbacks[refid](msg);
      delete this.callbacks[refid];
    }
  }

  /**
   * internal messages are identified by an .internal attribute, which contains the exact subtype
   * @param msg
   */
  private handleInternalMessage(msg: any) {
    this.fire('internalMessage', msg);
    switch (msg.internal) {
      case 'broadcast':
        {
          //console.log('recieved broadcast message', msg);
          break;
        }
      case 'startTime': {
        // set time unit
        if (msg.timeUnit !== undefined) {
          TimeConverter.serverTimeUnit = (msg.timeUnit === 'ms') ? TimeUnit.ms : TimeUnit.s;
        }

        this.pvdAnimator.now = TimeConverter.fromServer(msg.startTime) - 1000; //give a real time shift of 1sec

        var bak = this.pvdAnimator.stepper.refStepWidth;
        this.pvdAnimator.stepper = createStepper(TimeConverter.fromServer(msg.step) || this.pvdAnimator.dt, msg.stepUnit);
        this.pvdDataSelection.adaptToStepSize(this.pvdAnimator.stepper.refStepWidth, bak);

        this.promises.initialized.resolve({
          startTime: TimeConverter.fromServer(msg.startTime) - 1000,
          serverTimeUnit: TimeConverter.serverTimeUnit,
          step: TimeConverter.fromServer(msg.step) || this.pvdAnimator.dt,
          stepUnit: msg.stepUnit
        });

        this.pvdAnimator.start();
        break;
      }
      case 'selectTimeRange': {
        var nowBak = this.pvdAnimator.now;
        this.pvdDataSelection.setPinnedSelection(msg.tsTo, msg.tsTo - msg.tsFrom);

        if (msg.autoLoad === true) {
          var that = this;
          this.when('initialized').then((time) => {
            // auto start if now is end of time range
            var stopStream = TimeConverter.fromServer(msg.tsTo) < nowBak;

            console.info("load initial time range [" + new Date(msg.tsFrom).toUTCString() + ", " + new Date(msg.tsTo).toUTCString() + "]");

            that.load(new Date(msg.tsFrom), new Date(msg.tsTo),
              function () {
                console.info('complete: initial time range');
                if (stopStream) {
                  that.stopStream(function () {
                    console.info('stopped streaming: "now" (' + nowBak + ') is outside of selected time range');
                  });
                }
              });
          });
        }
        break;
      }
      case 'availableTimeRange': {
        this.pvdDataSelection.setAvailableTimeRange(TimeConverter.fromServer(msg.tsFrom), TimeConverter.fromServer(msg.tsTo));
        break;
      }
      case 'jumpedTo':
        {
          this.fireCallback(msg);
          break;
        }
      case 'loaded':
        {
          this.fireCallback(msg);
          break;
        }
      case 'speededUp': {
        this.fireCallback(msg);
        break;
      }
      case 'startedStream': {
        this.fireCallback(msg);
        this.fire('startedStream');
        break;
      }
      case 'stoppedStream': {
        this.fireCallback(msg);
        this.fire('stoppedStream');
        break;
      }
      case 'currentNodeFilter': {
        this.fireCallback(msg);
        break;
      }
      case 'extentTime': {
        this.fireCallback(msg);
        break;
      }
      case 'unknown': {
        console.error('unknown server message:', msg.error);
        this.fireCallback(msg);
        break;
      }
      case 'constantsSent': {
        this.fireCallback(msg);
        this.promises.constantsLoaded.resolve(true);
        break;
      }
      case 'dataBulkSent': {
        this.fireCallback(msg);
        this.fire('bulkSent', TimeConverter.fromServer(msg.from), TimeConverter.fromServer(msg.to));
        break;
      }
      case 'addNode': {
        //console.debug('addNode', msg);
        var infra = this.pvdInfrastructureLoader.getUnchecked(msg.infra);
        if (infra === null) {
          console.error('unknown infrastructure id:', msg.infra, 'for new node', msg.name);
        } else {
          var parentNode = infra.findNode(msg.parent);
          if (parentNode === null) {
            console.error('unknown parent node:', msg.parent, 'for new node', msg.name);
          }
          var node = parseNode(msg.name, msg, parentNode, this.pvdInfrastructureLoader.traits);
          infra.addNode(node);

          var nodes = this.nodes(infra);
          nodes.set(node.fqname, node);
          if (node.alias) {
            nodes.set(node.alias, node);
          }
        }
        break;
      }
      default: {
        console.warn('invalid internal message: ' + msg.internal, JSON.stringify(msg));
        break;
      }
    }
  }

  public createInternalMessage(type, callback?) {
    var msg: any = { type: type };
    if (callback) {
      msg.refid = nextID();
      this.callbacks[msg.refid] = callback;
    }
    return msg;

  }

  public loadIndexPointData(timestamp: number, setIndexPoint = true) {
    var that = this;
    //round to full date
    var ts = this.pvdAnimator.stepper.round(timestamp);

    // unlock old timestamp and lock new one
    if (that.pvdDataSelection.indexPoint) {
      that.pvdDataSelection.infra.unlockInAttributes(that.pvdDataSelection.indexPoint);
    }

    that.load(
      this.pvdAnimator.stepper.step(ts, -this.pvdDataSelection.doi.fuzzyDays),
      this.pvdAnimator.stepper.step(ts), //plus one day
      (msg) => {
        console.info('complete: index point data', ts);
        that.pvdDataSelection.infra.lockAndSetIndexTS(ts);
        if (setIndexPoint) {
          that.pvdDataSelection.indexPoint = ts;
        }
      }
    );
  }

  /**
   * sends an internal message to jump to the given milliseconds and updates the animator accordingly
   * @param date in ms
   * @param bulkLoadTill optional
   * @param autoStart optional, default: true
   * @param callback optional function
   */
  jumpTo(date, bulkLoadTill?, autoStart = true, callback?) {
    if (typeof date !== 'number') {
      date = date.valueOf();
    }
    var ms = date;
    var msg: any = this.createInternalMessage('jumpTo', callback);
    msg.time = TimeConverter.toServer(ms);

    if (bulkLoadTill) {
      if (typeof bulkLoadTill !== 'number') {
        bulkLoadTill = bulkLoadTill.valueOf();
      }

      msg.bulkTill = TimeConverter.toServer(bulkLoadTill);
    }
    this.send(msg);
    var r = this.pvdAnimator.isAnimating;
    this.pvdAnimator.stop();

    this.pvdAnimator.now = this.pvdAnimator.stepper.step(ms, -1);
    //clear all existing data
    this.clear();

    if (r && autoStart) {
      this.pvdAnimator.start();
    }
  }

  startStream(date?, callback?) {
    var msg: any = this.createInternalMessage('startStream', callback);
    if (date !== undefined && date !== null) {
      var ms = date.valueOf();
      msg.time = TimeConverter.toServer(ms);
    }
    this.send(msg);
  }

  stopStream(callback?) {
    var msg: any = this.createInternalMessage('stopStream', callback);
    this.send(msg);
  }

  extentTime(callback?) {
    var msg: any = this.createInternalMessage('extentTime', callback);
    this.send(msg);
  }

  /**
   * bulk load of data
   * @param start
   * @param end
   * @param callback
   */
  load(start, end, callback?) {
    var msg: any = this.createInternalMessage('load', callback);

    if (typeof start !== 'number') {
      start = start.valueOf();
    }
    if (typeof end !== 'number') {
      end = end.valueOf();
    }

    msg.start = TimeConverter.toServer(start);
    msg.end = TimeConverter.toServer(end);
    this.send(msg);
  }

  setNodeFilter(nodes_in: string[], nodes_ex: string[], callback?) {
    var msg: any = this.createInternalMessage('setNodeFilter', callback);
    msg.filter_in = nodes_in;
    msg.filter_ex = nodes_ex;
    this.send(msg);
  }

  getNodeFilter(callback) {
    var msg: any = this.createInternalMessage('getNodeFilter', callback);
    this.send(msg);
  }


  bulkLoadAndJump(from, end, autoStart = true, callback?) {
    return this.jumpTo(from, end, autoStart, callback);
  }

  /**
   * clear all data in the infrastructure
   */
  clear() {
    this._defaultInfra.clearAttributes();
  }

  private inverseOidIndex: d3.Map<Infrastructure> = undefined;

  /**
   * Creates index once for the defined oids in all infrastructures
   * The index consist of d3.map({'oid': infrastructure})
   */
  private createInverseOidIndex() {
    if (this.inverseOidIndex === undefined) {
      this.inverseOidIndex = d3.map();
      this.pvdInfrastructureLoader.getAllUnchecked().forEach((i) => {
        i.oids.forEach((oid) => {
          this.inverseOidIndex.set(oid, i);
        });
      });
    }
  }

  /**
   * Looks up an infrastructure for the given oid and returns it.
   * If no infrastructure is found, it returns the the set `_defaultInfra`.
   * Note that the look up accepts wildcards in the oid definition of an infrastructure (e.g.,
   * the oid definition "*.customers.mowis.com" will match incoming oids such as "cust_a.customers.mowis.com"
   * or "cust_b.customers.mowis.com")
   *
   * @param oid
   * @returns {Infrastructure}
     */
  private getInfraForOid(oid): Infrastructure {

    this.createInverseOidIndex(); // create index once

    var infra = this._defaultInfra;

    if (oid !== undefined) {
      this.pvdInfrastructureLoader.getAllUnchecked().forEach((i) => {
        if (this.inverseOidIndex.has(oid)) {
          infra = this.inverseOidIndex.get(oid);
        } else {
          var filtered = this.inverseOidIndex.keys().filter(function (key) {
            return new RegExp("^" + key.replace("*", ".*") + "$").test(oid);
          });

          if (filtered.length > 0) {
            infra = this.inverseOidIndex.get(filtered[0]);
          } else {
            //console.log('nothing found -> use default infra', infra);
          }
        }
        //console.log(infra);
      });
    }

    return infra;
  }

  /**
   * resolve a node by name/alias
   * @param name
   * @param oid
   * @returns {any}
     */
  private resolve(name: string, oid: string = undefined): Node {
    // TODO extend to handle maps of multiple sip and dip from historical data (e.g. mowis)
    // skip any entry that is not a string
    if (typeof name !== "string") {
      return null;
    }

    var infra = this.getInfraForOid(oid);

    // remove grouped node name e.g. "(my-node.de).parent.com"
    name = name.replace(/\(/gi, '').replace(/\)/gi, '');

    //name = this.clean(name); // causes always missings
    var r = this.nodes(infra).get(name);

    if (r) {
      return r;
    }

    if (infra.external && infra.external.match(name)) {
      return infra.external;
    }

    return null;
  }

  private handleNodeMessage(msg: any) {
    var node: Node = this.resolve(msg.nip, msg.o_id);
    if (!node) {
      //console.warn('invalid node message, invalid node: ' + msg.nip, JSON.stringify(msg));
      return;
    }
    //console.log('message: ' + node.fqIname, JSON.stringify(msg));
    this.handleAttributeMessage(node, msg);
  }

  private handleEdgeMessage(msg: any) {
    var src: Node = this.resolve(msg.sip, msg.o_id);
    if (!src) {
      //console.warn('invalid edge message, invalid src node: ' + msg.sip, JSON.stringify(msg));
      return;
    }
    var dst: Node = this.resolve(msg.dip, msg.o_id);
    if (!dst) {
      //console.warn('invalid edge message, invalid src node: ' + msg.dip, JSON.stringify(msg));
      return;
    }
    //console.log(dst, src);
    var edge = src.getOutgoingEdge(dst);
    if (!edge) {
      //console.warn('invalid edge message, unknown edge: '+src.fqIname+'('+msg.sip+')-'+dst.fqIname+'('+msg.dip+')', msg);
      return;
    }
    this.handleAttributeMessage(edge, msg);
  }

  /**
   * parses and pushes all attributes within a message
   * @param container
   * @param msg
   */
  private handleAttributeMessage(container: AttributeContainer, msg: any) {
    var ts: number = TimeConverter.fromServer(msg.ts);
    if (this._maxTimestamp < ts) {
      this._maxTimestamp = ts;
    }
    var duration = msg.dur || 0;
    var pushAttrError = [];
    var that = this;
    function pushAttr(attr: string, value: any) {
      //attr = that.clean(attr);
      var a: any = container.getAttr(attr);
      if (!a) {
        pushAttrError.push(attr);
        return;
      }
      a.push(ts, value, duration);
    }
    //single attribute case
    if (msg.attr) {
      pushAttr(msg.attr, msg.val);

      //multi attribute case
    } else if (msg.attrs) {
      d3.map(msg.attrs).forEach((attr, value) => {
        pushAttr(attr, value);
      });
    }
    if (pushAttrError.length > 0) {
      console.warn('invalid attrs:', pushAttrError, 'for container', (<any>container).fqIname, 'in message:', JSON.stringify(msg));
    }
  }
}

/*export default angular.module('services.pvdDataService', [
  Animator,
  DataSelection,
  InfrastructureLoader
]).service('pvdDataService', PVDDataService).name;*/
export default angular.module('services.pvdDataService', [
  Animator,
  DataSelection,
  InfrastructureLoader
])
  .service('pvdDataService', [
    'pvdAnimator',
    'pvdDataSelection',
    'pvdInfrastructureLoader',
    PVDDataService
  ]).name;
