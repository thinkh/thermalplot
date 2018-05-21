/**
 * Created by Samuel Gratzl on 19.03.2015.
 */
import * as angular from '@bower_components/angular';
import * as d3 from '@bower_components/d3/d3';
import { TimedParentValue, TimedIndexedValue, TimedValue } from './Timed';
import { IAttribute, ConstantAttribute, Attribute, IPathElem } from './Models';
import { Node } from './Infrastructure';
import { createStepper, IStepper } from '../services/Animator';
import { PVDSelection } from '../services/DataSelection';

var sumIt: any = d3.sum;

/**
 * normalize the given value in the given range
 * @param v
 * @param range
 * @param clampValue
 * @return {number}
 */
export function norm(v: number, range: number[], clampValue = true) {
  v = (v - range[0]) / (range[1] - range[0]);
  if (clampValue) {
    v = clamp(v, [0, 1]);
  }
  return v;
}

export function clamp(v: number, range: number[]) {
  return Math.max(Math.min(v, range[1]), range[0]);
}

//unnormalize the value
export function unnorm(v: number, range: number[]) {
  //scales a normalized value to the given range
  return (v * (range[1] - range[0])) + range[0];
}

/**
 * element of a doi formula defined by the attribute name, its weight, and the normalization information
 */
export class DOIComponent {
  constructor(public attr: string, public weight: number, public range = [-1, 1], public invert: boolean = false) {

  }

  get min() {
    return this.range[0];
  }
  set min(v: number) {
    this.range[0] = +v;
  }

  get max() {
    return this.range[1];
  }
  set max(v: number) {
    this.range[1] = +v;
  }

  /**
   * maps the given value in the input range to the given weighted output range
   * @param v
   * @param range
   * @return {number}
   */
  f(v: number, range: number[]) {
    var num = unnorm(norm(v, this.range), range) * this.weight;
    // if the attribute should be inverted
    if (this.invert) {
      return -1 * num;
    }
    return num;
  }

  get name() {
    return this.attr;
  }

  /**
   * weight as percentage
   * @return {number}
   */
  get percentage() {
    return this.weight * 100;
  }

  set percentage(value: number) {
    this.weight = value / 100;
  }

  clone() {
    return new DOIComponent(this.attr, this.weight, this.range.slice(), this.invert);
  }

  public toPlainObject() {
    return {
      attr: this.attr,
      weight: this.weight,
      range: this.range,
      invert: this.invert
    }
  }
}

/**
 * one doi value with all of its attributes
 */
export class DOIValue {
  /**
   * a doi value
   * @param s the smoothed doi value
   * @param b the trend
   * @param ts time stamp of the value
   */
  constructor(public s: number, public b: number, public ts: number) {

  }
}

/**
 * doi formula
 */
export class DOIFormula {
  public stepper: IStepper;

  /**
   * the doi formula
   * @param components elements of the formula
   * @param alpha alpha factor for smoothing
   * @param beta beta factor for trend smoothing
   * @param nsteps number of steps for the whole doi window
   * @param default_ default value
   * @param range the doi range
   * @param step the step to use see createStepper
   * @param fuzzyDays number of allowed fuzzy steps days
   * @param deltaMethod the delta method to use
   * @param loadingPercentage
   */
  constructor(public components: DOIComponent[] = [], public alpha: number = 0.3, public beta: number = 0.3, public nsteps: number = 20, public default_: number = 0, public range = [0, 1], step: any = 1, public fuzzyDays = 5, public deltaMethod = 'localwindow', public loadingPercentage = 0.3) {
    this.stepper = createStepper(typeof (step) === 'number' ? step : 0, step.toString());
  }

  get min() {
    return this.range[0];
  }
  set min(v: number) {
    this.range[0] = +v;
  }
  get max() {
    return this.range[1];
  }
  set max(v: number) {
    this.range[1] = +v;
  }

  windowEnd(ts: number) {
    return this.stepper.step(ts, this.nsteps);
  }
  windowStart(ts: number) {
    return this.stepper.step(ts, -this.nsteps);
  }
  fuzzyStepWindow(ts: number) {
    return this.stepper.step(ts, this.nsteps + this.fuzzyDays);
  }

  get attributes() {
    return this.components.map((d) => d.attr);
  }

  /**
   * evals multiple attribute values to compute the raw doi value
   * @param values
   * @return {*}
   */
  evalX(values: number[]) {
    //f does normalization and clamping so in the range 0..1
    var sum = sumIt(values, (d, i) => this.components[i].f(d, this.range));
    sum = clamp(sum, this.range);
    return sum;
  }

  get isMirrored() {
    return this.range[0] === - this.range[1];
  }

  unnorm(value: number) {
    //if we arent in this range scale it back to the output range
    if (this.range[0] !== 0 || this.range[1] !== 1) {
      value = unnorm(value, this.range);
    }
    return value;
  }

  /**
   * evals the doi formula
   * @param doi_tm1 the previous doi value
   * @param x_t the current value
   * @param ts the current time stamp
   * @return {DOIValue}
   */
  eval(doi_tm1: DOIValue, x_t: number, ts: number) {
    var s_tm1 = doi_tm1.s;
    var b_tm1 = doi_tm1.b;
    //compute the smoothed new value s..smoothed
    var s_t = this.alpha * x_t + (1 - this.alpha) * (s_tm1 + b_tm1);
    //compute the next trend
    var b_t = this.beta * (s_t - s_tm1) + (1 - this.beta) * b_tm1;
    //create the value
    return new DOIValue(clamp(s_t, this.range), b_t, ts);
  }

  /**
   * create a start doi value given the values and a trend of 0
   * @param x_t
   * @param ts
   * @return {DOIValue}
   */
  start(x_t: number, ts: number) {
    return new DOIValue(x_t, 0, ts);
  }

  /**
   * forecast the given doi vlaue
   * @param doi_l
   * @param t the target time to forecast a value to
   * @return {number}
   */
  forecast(doi_l: DOIValue, t: number) {
    // compute a forecast for the future doi by adding i times the trend
    var s_t = doi_l.s + doi_l.b * (t - doi_l.ts) / this.stepper.refStepWidth;
    return clamp(s_t, this.range);
  }

  static deltaMethods = ['local', 'global', 'localwindow'];

  /**
   * compute the delta doi
   * @param doi_t current doi
   * @param doi_tm1 previous doi
   * @param doi_start start of window
   * @param doi_tmw previous window doi i.e. like tm1 but with a window larger than one unit by default (end-start=window)
   *
   * <code>
   *   ------------------------------------------------------------> time
   *                  | t_start           | t_t       | t_end
   *                  <------------window------------->
   *      | t_tmw (t-window)             | t_tm1 (t-1)
   *                  <----delta global--->
   *                                     <> delta local
   *      <-----delta localwindow--------->
   * </code>
   *
   * @return {number}
   */
  computeDelta(doi_t: number, doi_tm1: number, doi_start: number, doi_tmw: number) {
    if (this.deltaMethod === 'global') {
      //variant 1: global
      return doi_t - doi_start;
    } else if (this.deltaMethod === 'localwindow') {
      //variant 3: global + local
      return doi_t - doi_tmw;
    } else { //if (this.deltaMethod === 'local') {
      //variant 2: local
      return doi_t - doi_tm1;
    }
  }

  /**
   * compute the loading starting time step
   */
  getLoadingStart(from: number, selectionWindow: number) {
    var base = this.stepper.step(from, -this.nsteps + -this.fuzzyDays);
    if (this.deltaMethod === 'localwindow') { //need the whole window for computing the deltadoi in start
      base -= selectionWindow;
    }
    return base;
  }

  clone(): DOIFormula {
    var f = new DOIFormula(this.components, this.alpha, this.beta, this.nsteps, this.default_, this.range, 1, this.fuzzyDays, this.deltaMethod, this.loadingPercentage);
    f.stepper = this.stepper;
    return f;
  }

  public toPlainObject() {
    return {
      components: this.components.map((c) => c.toPlainObject()),
      alpha: this.alpha,
      beta: this.beta,
      nsteps: this.nsteps,
      default_: this.default_,
      range: this.range,
      step: this.stepper.refStepWidth,
      fuzzyDays: this.fuzzyDays,
      deltaMethod: this.deltaMethod,
      loadingPercentage: this.loadingPercentage
    };
  }
}

export interface DOIWindow {
  doi_t: number;
  delta_t: number;
  doi_prev: number;
}
export interface DeltaDOI {
  doi: number;
  delta: number;
  ts: number;
}

class DeltaDOIImpl implements DeltaDOI {
  constructor(public doi: number, public delta: number, public ts: number = 0) {

  }
}

export function compute(node: Node, s: PVDSelection, f: DOIFormula) {
  if (node.getAttr('doi') === undefined) {
    return f.default_;
  }
  var v = node.getAttr('doi').floor(s.point);
  return v ? v.v : f.default_;
}

export function computeWindow(node: Node, s: PVDSelection, f: DOIFormula): DOIWindow {
  if (node.getAttr('doi') === undefined) {
    return { doi_t: f.default_, delta_t: 0, doi_prev: f.default_ };
  }
  if (f.loadingPercentage > 0) {
    var loadingPercentage = computeValidDataPoints(node, s, f);
    if (loadingPercentage < f.loadingPercentage) { //FIXME constant
      return { doi_t: f.default_, delta_t: 0, doi_prev: f.default_ };
    }
  }

  var attr = node.getAttr('doi'), data;

  if (f.deltaMethod === 'global' || f.deltaMethod === 'localwindow') {
    data = attr.values(s.start, s.point, createStepper(s.past), true);
    return { doi_t: data[1], doi_prev: data[0], delta_t: f.computeDelta(data[1], data[0], data[0], data[0]) }
  } else { //local
    data = attr.values(f.stepper.step(s.point, -1), s.point, f.stepper, true);
    return { doi_t: data[1], doi_prev: data[0], delta_t: f.computeDelta(data[1], data[0], 0, 0) }
  }
}

export function computeTrajectory(node: Node, s: PVDSelection, f: DOIFormula): DeltaDOI[] {
  if (node.getAttr('doi') === undefined) {
    return d3.range(s.start, s.point + 1, f.stepper.refStepWidth).map((d, i) => new DeltaDOIImpl(f.default_, 0, d));
  }
  var attr = node.getAttr('doi'), data;
  if (f.deltaMethod === 'global' || f.deltaMethod === 'local') {
    data = attr.values(s.start, s.point, f.stepper, true);
    var doi_start = new DeltaDOIImpl(data[0], 0, s.start);
    return [doi_start].concat(data.slice(1).map((doi, i) => new DeltaDOIImpl(doi, f.computeDelta(doi, data[i], doi_start.doi, 0), f.stepper.step(s.start, i))));
  } else { //} (this.deltaMethod === 'localwindow') {
    var selectionWindow = s.past, start = d3.round(s.past / f.stepper.refStepWidth, 0);
    data = attr.values(s.start - selectionWindow, s.point, f.stepper, true);
    return data.slice(start).map((doi, i) => new DeltaDOIImpl(doi, f.computeDelta(doi, 0, 0, data[i]), f.stepper.step(s.start, i)));
  }
}

export function computeValidDataPoints(node: Node, s: PVDSelection, f: DOIFormula): number {
  if (node.getAttr('doi') === undefined) {
    return 0;
  }
  var attr: DOIAttribute = <DOIAttribute>(<any>node.getAttr('doi'));
  if (attr.constants.some((c) => !c.isSet)) {
    return 0;
  }
  var expected = s.past / f.stepper.refStepWidth;
  var have = attr.dynamics.map((a) => a.numRawValues(s.start, s.end));
  return d3.mean(have) / expected;
}

export class DOIValues {
  private _length: number;
  private values: any[];

  constructor(attrs: IAttribute<number>[], private from: number, private to: number, private step: IStepper) {
    this.values = attrs.map((a) => {
      if (a instanceof ConstantAttribute) {
        return (<any>a).getValue();
      }
      var r = a.values(from, to, step, true);
      this._length = r.length;
      return r;
    });
  }

  get length() {
    return this._length;
  }

  getAt(i: number) {
    return this.values.map((v) => Array.isArray(v) ? v[i] : v);
  }
}

const RETURN_NULL = true;
const NO_FORECASTING = true;

export class DOIAttribute extends Attribute<number> {
  constructor(name: string, alias: string, parent: IPathElem, private formula: DOIFormula = new DOIFormula(), public invert: boolean = false) {
    super(name, alias, parent);
  }

  private add(ts: number, s: number, b: number) {
    this.data.push(ts, s, b, true);
  }

  setFormula(f: DOIFormula) {
    this.attrs.forEach((d) => {
      (<any>d).on('reset.doi', null);
      (<any>d).on('add.doi', null);
    });
    this.formula = f;

    //clear my cache upon an attribute clear
    this.attrs.forEach((d) => {
      (<any>d).on('reset.doi', (from, to) => {
        this.clear(from, this.formula.windowEnd(to));
      });
      (<any>d).on('add.doi', (ts) => {
        this.clear(ts, this.formula.windowEnd(ts));
      });
    });
    this.clear();
  }

  getFormula() {
    return this.formula;
  }

  /**
   * all attributes of this formula
   * @returns {IAttribute<any>[]}
   */
  get attrs() {
    var n = <Node>(<any>this.parent);
    return this.formula.attributes.map((a) => n.getAttr(a));
  }

  /**
   * all constants attributes of the formula
   * @returns {any}
   */
  get constants(): ConstantAttribute<any>[] {
    var r: any = this.attrs.filter((a) => a instanceof ConstantAttribute);
    return r;
  }

  /**
   * all dynamic attributes of the formula
   * @returns {IAttribute<any>[]}
   */
  get dynamics() {
    return this.attrs.filter((a) => !(a instanceof ConstantAttribute));
  }

  private resolve(ts: number, returnNullAsDefault: boolean = !RETURN_NULL, noForecasting: boolean = !NO_FORECASTING) {
    if (super.has(ts)) { //cached?
      return super.floor(ts).v;
    }
    //compute the value
    return this.compute(ts, returnNullAsDefault, noForecasting);
  }

  /**
   * computes the common timestamp among all attributes of this doi formula
   * @param ts
   * @returns {any}
   */
  private commonFloorTS(ts: number) {
    //check if constants are there
    if (this.constants.some(a => a.floor(ts) === null)) {
      return null;
    }
    var tss: number[] = []; // new Set<number>();
    var d = this.dynamics, v: number = null;
    if (d.length === 0) {
      return ts; //just static constants -> stupid
    }
    for (var i = 0; i < d.length; ++i) {
      var t = d[i].floor(ts);
      if (t === null) {
        return null; //no data in one attr
      }
      tss.push(t.ts);
    }
    tss.sort();
    //assume data are coming from past to future
    return tss.length === 0 ? null : tss[0];
  }

  private fuzzyHas(a: IAttribute<any>, ts: number, useFuzzy = true) {
    //fuzzy days just for the first in cache, rest can be interpolated
    const fuzzy = useFuzzy ? this.formula.fuzzyDays : 0;
    // find valid day based on the steps (deprecated)
    // -> works for normalized data (e.g., stock data), but does not work for event based data (e.g., IT network)
    /*for(var i = 0; i <= fuzzy; ++i) {
      if (a.has(this.formula.stepper.step(ts, -i))) {
        return true;
      }
    }*/
    // new: find any valid timestamp within the range
    const ts_start = this.formula.stepper.step(ts, -fuzzy);
    const f = a.floor(ts);
    return f && f.ts >= ts_start;
  }

  /**
   * checks whether all the dynamic attributes of this doi formula have the necessary time window for computing the given timestamp
   * @param ts the time stamp to check
   * @param useFuzzy whether fuzzy checking should be applied
   **/
  private haveWindow(ts: number, useFuzzy = true) {
    var start = this.formula.windowStart(ts);
    return this.dynamics.every(a => this.fuzzyHas(a, start, useFuzzy));
  }

  private first(ts: number) {
    var from = this.formula.windowStart(ts);
    var values = new DOIValues(this.attrs, from, ts, this.formula.stepper);
    var toValue = (i) => {
      var values_i = values.getAt(i);
      return this.formula.evalX(values_i);
    };
    var doi_tm1 = this.formula.start(toValue(0), from);
    for (var i = 1; i < values.length; ++i) {
      //volatile
      doi_tm1 = this.formula.eval(doi_tm1, toValue(i), this.formula.stepper.step(from, i));
    }
    //correct
    //if (this.fqname.match(/Japan.*/)) {
    //  console.log('add first',ts, doi_tm1.ts, doi_tm1.s, doi_tm1.b);
    //}
    this.add(ts, doi_tm1.s, doi_tm1.b);
    return doi_tm1;
  }

  private intermediate(doi_tm1: DOIValue, ts: number) {
    if (doi_tm1.ts >= ts) { //bigger due to fuzzy days
      return doi_tm1;
    }
    var values = new DOIValues(this.attrs, this.formula.stepper.step(doi_tm1.ts), ts, this.formula.stepper);
    var toValue = (i) => {
      var values_i = values.getAt(i);
      return this.formula.evalX(values_i);
    };
    //if (this.fqname.match(/Japan.*/)) {
    // console.log('start range', doi_tm1.ts, doi_tm1.s, doi_tm1.b,values);
    //}
    for (var i = 0; i < values.length; ++i) {
      doi_tm1 = this.formula.eval(doi_tm1, toValue(i), this.formula.stepper.step(doi_tm1.ts));
      //store
      //if (this.fqname.match(/Japan.*/)) {
      //  console.log('add range',doi_tm1.ts, doi_tm1.s,doi_tm1.b);
      //}

      this.add(doi_tm1.ts, doi_tm1.s, doi_tm1.b);
    }
    return doi_tm1;
  }

  /**
   * forecasts the given doi value and forecast the give time stamp out of it
   * @param doi_tm1
   * @param ts
   * @returns {number}
   */
  private forecast(doi_tm1: DOIValue, ts: number) {
    //volatile
    return this.formula.forecast(doi_tm1, ts);
  }

  private compute(ts: number, returnNullAsDefault: boolean, noForecasting: boolean): number {
    var attrs = this.attrs;
    var prev_v = this.data.floor(ts);
    if (!attrs.every((a) => this.fuzzyHas(a, ts, prev_v === null))) {
      //don't have the value
      var common = this.commonFloorTS(ts);
      if (common == null) {
        return returnNullAsDefault ? null : this.formula.default_;
      }
      var prev_doi;
      if (prev_v) { //we have something to continue
        prev_doi = this.intermediate(new DOIValue(prev_v.v, prev_v.duration, prev_v.ts), common);
      } else {
        if (this.haveWindow(common, true)) { //first
          prev_doi = this.first(common);
        } else {
          return returnNullAsDefault ? null : this.formula.default_;
        }
      }
      return noForecasting ? null : this.forecast(prev_doi, ts);
    } else {
      if (prev_v) { //fi
        return this.intermediate(new DOIValue(prev_v.v, prev_v.duration, prev_v.ts), ts).s;
      }
      //first one
      if (this.haveWindow(ts, true)) {
        return this.first(ts).s;
      }
      return returnNullAsDefault ? null : this.formula.default_;
    }
  }

  get min(): number {
    return this.formula.range[0];
  }

  get max(): number {
    return this.formula.range[1];
  }

  toString() {
    return this.fqIname;
  }

  get valueType(): any {
    return Number;
  }

  get isNormalizeAble(): boolean {
    return true;
  }

  normalize(value: number): number {
    return norm(value, this.formula.range);
  }

  push(ts: number, value: any, duration: number = 0) {
    throw new Error('invalid cant push to doi');
  }

  areNoValuesThere(from: number, to: number, step: IStepper, feedForward: boolean = false) {
    if (super.areNoValuesThere(from, to, step, feedForward)) {
      //check if we compute some
      var common = this.commonFloorTS(from);
      if (common === null) {
        return false;
      }
      //data point too far away
      if (!feedForward && common < step.step(from, -this.formula.fuzzyDays)) {
        return false;
      }
      //can compute the first one?
      return !this.haveWindow(common);
    }
    return false;
  }

  values(from: number, to: number, step: IStepper, feedForward: boolean = true): number[] {
    var r = [];
    for (; from <= to; from = step.step(from)) {
      r.push(this.resolve(from));
    }
    return r;
  }

  frequencies(from: number, to: number, step: IStepper): number[] {
    throw new Error();
  }

  valueList(from: number, to: number, step: IStepper, r = new Array<TimedParentValue<number, IAttribute<number>>>()): TimedParentValue<number, IAttribute<number>>[] {
    throw new Error()
  }

  floor(ts: number): TimedIndexedValue<number> {
    //try to resolve the precise timestamp and then return the cached value
    this.resolve(ts, RETURN_NULL, NO_FORECASTING);
    return super.floor(ts);
  }

  ceiling(ts: number): TimedIndexedValue<number> {
    //TODO
    this.resolve(ts, RETURN_NULL, NO_FORECASTING);
    return super.floor(ts);
  }


  rawValues(from: number, to: number): TimedValue<number>[] {
    var r = [];
    //use the formula stepper for stepping to compute 'raw' values, i.e. values having an attribute defined step width
    for (; from <= to; from = this.formula.stepper.step(from)) {
      var v = this.resolve(from, RETURN_NULL);
      if (v === null) {
        continue; //no more values //wrong later maybe enough data are there -> skip
      }
      r.push(new TimedValue(from, v));
    }
    return r;
  }

  numRawValues(from: number, to: number) {
    return this.rawValues(from, to).length;
  }

  lock(ts: number) {
    //can't lock
  }

  unlock(ts: number) {
    //can't unlock;
  }

  /**
   * is the specific timestamp point available?
   * @param ts
   * @returns {boolean}
   */
  has(ts: number) {
    if (super.has(ts)) { //in the cache?
      return true;
    }
    //try to resolve
    return this.resolve(ts, RETURN_NULL) !== null;
  }
}
