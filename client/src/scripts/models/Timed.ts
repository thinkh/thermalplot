/**
 * Created by Samuel Gratzl on 16.04.2014.
 */
import * as d3 from 'd3';
import { IStepper } from '../services/Animator';

/**
 * module containing time based values classes
 */

function to_single_value_impl(v: any) {
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'undefined' || v === null) {
    return v;
  }
  if (typeof v.mean === 'number') {
    return v.mean;
  }
  if (typeof v.min === 'number') {
    return v.min;
  }
  if (typeof v.max === 'number') {
    return v.max;
  }
  //assume it a hist, use the maximal hist bin key
  var r = d3.entries(v).reduce((prev, act) => prev.value > act.value ? prev : act, { key: '', value: 0 });
  return r.key;
}

function to_hist_value_impl(v: any) {
  if (typeof v === 'undefined' || v === null) {
    return {};
  }
  if (typeof v === 'number') {
    //fake a aggregated number
    return {
      mean: v,
      max: v,
      min: v
    };
  }
  if (typeof v === 'string') {
    //histogram of size one
    var r = {};
    r[v] = 1;
    return r;
  }
  //keep the value
  return v;
}

export function to_single_value(v: any) {
  if (Array.isArray(v)) {
    return v.map(to_single_value_impl);
  }
  return to_single_value_impl(v);
}

export function to_hist_value(v: any) {
  if (Array.isArray(v)) {
    return v.map(to_hist_value_impl);
  }
  return to_hist_value_impl(v);
}

/**
 * value along with its time step
 */
export class TimedValue<T> {
  constructor(public ts: number, public v_raw: T, public duration: number = 0) {
  }

  get v() {
    return to_single_value(this.v_raw);
  }

  get hist() {
    return to_hist_value(this.v_raw);
  }
}

export class TimedIndexedValue<T> extends TimedValue<T> {
  constructor(ts: number, v: T, duration: number, public index: number) {
    super(ts, v, duration);
  }
}

export class TimedParentValue<T, P> extends TimedValue<T> {
  constructor(public parent: P, ts: number, v: T, duration: number = 0) {
    super(ts, v, duration);
  }
}

/**
 * utility definition for a function that combines multiple values to a single one
 */
export interface IBinner<T> {
  (data: T[]): T;
}

/**
 * a range in an array for a given time step
 */
class TSRange {
  constructor(public ts: number, public start: number, public end: number) {

  }
  get last() {
    return this.end - 1;
  }
  get first() {
    return this.start;
  }
  get length() {
    return this.end - this.start;
  }
  get isValid() {
    return this.start >= 0 && this.length > 0
  }

  /**
   * selects the data according to this range
   * @param arr
   * @param binner
   * @returns {*}
   */
  bin<T>(arr: T[], binner: IBinner<T>) {
    if (binner && this.length > 1) {
      return binner(arr.slice(this.start, this.end));
    } else {
      return arr[this.last];
    }
  }
}

var invalidRange = new TSRange(-1, -1, -1);

export class ImmutableTimedList<T> {
  constructor(public tss: number[] = [], public vs: T[] = [], public durations: number[] = []) {
  }

  get length(): number {
    return this.vs.length;
  }

  get isEmpty(): boolean {
    return this.length == 0;
  }

  get minTimeStamp(): number {
    return this.isEmpty ? NaN : this.tss[0];
  }

  get maxTimeStamp(): number {
    return this.isEmpty ? NaN : this.tss[this.tss.length - 1];
  }

  get(index: number): TimedIndexedValue<T> {
    if (this.isEmpty || index >= this.length)
      return null;
    return new TimedIndexedValue<T>(this.tss[index], this.vs[index], this.durations[index], index);
  }

  getTS(index: number): number {
    return this.tss[index];
  }

  getV(index: number): T {
    return to_single_value(this.vs[index]);
  }

  getVRaw(index: number): T {
    return this.vs[index];
  }

  getHist(index: number): T {
    return to_hist_value(this.vs[index]);
  }

  getDuration(index: number): number {
    return this.durations[index];
  }

  /**
   * return the nearest value, which is <= the given ts or null if no one exists
   * @param ts the timestamp to look for
   * @param duration the minimal duration to return
   */
  floor(ts: number, duration = 0): TimedIndexedValue<T> {
    var d = this.tss, l = d.length, low = 0, high = l - 1, i, c,
      dur = this.durations;
    //no data or all too large
    if (l == 0 || d[0] > ts) {
      return null;
    }
    //larger than the last one
    if (d[high] <= ts) {
      return this.get(high);
    }
    //in between
    while (low <= high) {
      i = Math.floor((low + high) / 2);
      c = d[i] - ts;
      if (c > 0) { //larger
        high = i - 1;
      } else if (c < 0 && ts >= d[i + 1]) { //smaller
        low = i + 1;
      } else { //direct hit or in the right spot
        return this.get(i);
      }
    }
    return null;
  }

  /**
   * returns the percentages loaded within the given data range, i.e. the last known value which is within this range
   * @param from
   * @param to
   */
  percentagesLoaded(from: number, to: number) {
    var f = this.floor(to);
    if (f === null || f.ts < from) {
      return 0; //nothing in the range
    }
    return (f.ts - from) / (to - from);
  }

  /**
   * access the raw values of this list between the given timestamps
   * @param from >= from
   * @param to <= to
   * @param duration the minimal duration
   * @return {*}
   */
  rawValues(from: number, to: number, duration = 0) {
    var start = this.ceiling(from, duration);
    var end = this.floor(to, duration);
    if (start === null || end === null || end < start) {
      return [];
    }
    return d3.range(start.index, end.index + 1).map((index) => this.get(index));
  }
  numRawValues(from: number, to: number, duration = 0) {
    var start = this.ceiling(from, duration);
    var end = this.floor(to, duration);
    if (start === null || end === null || end < start) {
      return 0;
    }
    return end.index + 1 - start.index;
  }

  /**
   * return the nearest value, which is >= the given ts or null if no one exists
   * @param ts the timestamp to look for
   */
  ceiling(ts: number, duration = 0): TimedIndexedValue<T> {
    var d = this.tss, l = d.length, low = 0, high = l - 1, i, c;
    //no data or all too large
    if (l == 0 || d[high] < ts) {
      return null;
    }
    //smaller than the first one
    if (d[0] >= ts) {
      return this.get(0);
    }
    //in between
    while (low <= high) {
      i = Math.floor((low + high) / 2);
      c = d[i] - ts;
      if (c < 0) { //larger
        low = i + 1;
      } else if (c > 0 && ts <= d[i - 1]) { //smaller
        high = i - 1;
      } else { //direct hit or in the right spot
        return this.get(i);
      }
    }
    return null;
  }

  /**
   * slices this timed list, similar to Array.prototype.slice
   * @param start
   * @param end
   * @returns {ImmutableTimedList<T>}
   */
  slice(start: number, end?: number): ImmutableTimedList<T> {
    return new ImmutableTimedList<T>(this.tss.slice(start, end), this.vs.slice(start, end), this.durations.slice(start, end));
  }

  private select(from: number, to: number, step: IStepper, feedForward: boolean): TSRange[] {
    var r: TSRange[] = [], act: number = from;
    if (this.areNoValuesThere(from, to, step, feedForward)) {
      for (act = from; act <= to; act = step.step(act)) {
        r.push(invalidRange);
      }
    } else {
      var start = this.floor(step.prev(from)), d = this.tss, i: number, its: number, end: number;
      if (!start) {
        i = 0;
        its = d[i];
        for (act = from; act < its; act = step.step(act)) {
          r.push(invalidRange);
        }
      } else {
        //inner start
        i = start.index;
        its = start.ts;

        //fill up left out of bounds
        while (its <= step.prev(from)) {
          i++;
          its = d[i];
        }
      }
      for (; act <= to; act = step.step(act)) {
        if (i === d.length) { //boundaries reached
          break;
        }
        end = i;
        //count range
        while (act >= d[end] && end < d.length) {
          end++;
        }
        r.push(new TSRange(act, i, end));
        i = end;
      }
      //fill out right out of bounds
      for (; act <= to; act = step.step(act)) {
        r.push(invalidRange);
      }
    }
    return r;
  }

  /**
   * checks if there are any values for the given time span
   * @param from
   * @param to
   * @param step
   * @param feedForward
   * @returns {boolean}
   */
  areNoValuesThere(from: number, to: number, step: IStepper, feedForward: boolean) {
    if (this.isEmpty) {
      return true;
    }
    if (!feedForward) {
      return to < this.minTimeStamp || this.maxTimeStamp < step.prev(from);
    } else {
      return to < this.minTimeStamp;
    }
  }

  values(from: number, to: number, step: IStepper, binner: IBinner<T>, feedForward = true, invalidValue: T = null): T[] {
    if (this.areNoValuesThere(from, to, step, feedForward)) {
      var r = new Array<T>(), act: number = from;
      for (act = from; act <= to; act = step.step(act)) {
        r.push(invalidValue);
      }
      return r;
    }
    var selection = this.select(from, to, step, feedForward);
    var prev: T = invalidValue;
    return selection.map((range, index) => {
      if (range.isValid) {
        return prev = range.bin(this.vs, binner);
      } else if (feedForward) {
        if (index == 0) {
          if (range.start > 0) {
            prev = this.vs[range.start - 1];
          } else if (from > this.maxTimeStamp) {
            prev = this.vs[this.vs.length - 1];
          }
        }
        return prev;
      } else {
        return invalidValue;
      }
    }).map(to_single_value);
  }

  frequencies(from: number, to: number, step: IStepper, artificialStart = true): number[] {
    var selection = this.select(from, to, step, false);
    return selection.map((range, index) => {
      if (range.isValid && index == 0 && !artificialStart) {
        return range.end;
      }
      return range.length;
    });
  }

  valueList<P>(parent: P, from: number, to: number, step: IStepper, binner: IBinner<T>, feedForward: boolean, filter: (T) => boolean, invalidValue: T = null, r = new Array<TimedParentValue<T, P>>()): TimedParentValue<T, P>[] {
    if (this.isEmpty) { //no data at all
      return r;
    }
    function push(act: number, v: T) {
      if (filter(v) && !(isNaN(<any>v))) {
        r.push(new TimedParentValue(parent, act, v, step.refStepWidth));
      }
    }
    var selection = this.select(from, to, step, feedForward);
    var prev: T = invalidValue;
    selection.forEach((range, index) => {
      if (range.isValid) {
        prev = range.bin(this.vs, binner);
        push(range.ts, prev);
      } else if (feedForward) {
        if (index == 0) {
          if (range.start > 0) {
            prev = this.vs[range.start - 1];
          } else if (from > this.maxTimeStamp) {
            prev = this.vs[this.vs.length - 1];
          }
        }
        push(range.ts, prev);
      } else {
        push(range.ts, invalidValue);
      }
    });
    return r;
  }

  frequencyList<P>(parent: P, from: number, to: number, step: IStepper, artificialStart: boolean = true, r = new Array<TimedParentValue<number, P>>()): TimedParentValue<number, P>[] {
    if (this.isEmpty) { //no data at all
      return r;
    }
    function push(act: number, v: number) {
      if (!isNaN(v) && v > 0) {
        r.push(new TimedParentValue(parent, act, v, step.refStepWidth));
      }
    }
    var selection = this.select(from, to, step, false);
    selection.forEach((range, index) => {
      if (range.isValid && index == 0 && !artificialStart) {
        push(range.ts, range.end);
      } else {
        push(range.ts, range.length);
      }
    });
    return r;
  }

}

class TimestepRange {
  constructor(public from: number, public to: number = from + 1) {

  }
  contains(ts: number) {
    return this.from <= ts && ts < this.to;
  }

  includes(other: TimestepRange) {
    return this.contains(other.from) && this.contains(other.to);
  }

  equals(other: TimestepRange) {
    return this.from === other.from && this.to === other.to;
  }

  overlap(other: TimestepRange) {
    if (this.includes(other)) {
      return other;
    }
    if (other.includes(this)) {
      return this;
    }
    if (this.to < other.from || this.from > other.to) {
      return null; //no overlap at all
    }
    if (this.from < other.from) {
      return new TimestepRange(other.from, this.to);
    }
    return new TimestepRange(this.from, other.to);
  }
}
/**
 * mutable version of a time list
 */
export class TimedList<T> extends ImmutableTimedList<T> {
  private _maxSize: number;
  private _minimumTimeRange: number;
  /**
   * set of locked timestamps which can't be auto removed
   * @type {Array}
   */
  private lockedTimestamps: TimestepRange[] = [];

  private _cache;//:Set<number>;

  constructor(maxSize: number = 3000, minimumTimeRange = 10E4) {
    super();
    this._maxSize = maxSize;
    this._minimumTimeRange = minimumTimeRange;
  }

  has(ts: number) {
    return this.cache.has(ts);
  }

  private get cache() {
    if (!this._cache) {
      this._cache = d3.set();
      this.tss.forEach(t => this._cache.add(t));
    }
    return this._cache;
  }

  /**
   * the maximum size of this time list, if the capacity is filled old entries may get removed, see also minimumTimeRange
   * @returns {number}
   */
  get maxSize(): number {
    return this._maxSize;
  }

  set maxSize(v: number) {
    this._maxSize = v;
    this.removeOldEntries();
  }

  /**
   * locks the given time range from being cleared
   * @param from
   * @param to
   */
  lock(from: number, to: number = from + 1) {
    var n = new TimestepRange(from, to);
    //already there
    if (this.lockedTimestamps.some(t => t.equals(n) || t.includes(n))) {
      return false;
    }
    this.lockedTimestamps.push(n);
  }

  /**
   * unlock the given time range from being cleared
   * @param from
   * @param to
   * @return {boolean}
   */
  unlock(from: number, to: number = from + 1) {
    var toAdd = [];
    var u = new TimestepRange(from, to);
    this.lockedTimestamps.forEach((t) => {
      var overlap = t.overlap(u);
      if (overlap === null) {
        return;
      }
      if (overlap === t) {
        t.to = -1; //all included
      } else if (overlap === u) {
        //select a cut, split it into two
        toAdd.push(new TimestepRange(to, t.to));
        t.to = from;
      } else if (overlap.from === t.from) { //left overlap
        t.from = overlap.to;
      } else { //right overlap
        t.to = overlap.from;
      }
    });
    this.lockedTimestamps.push.apply(this.lockedTimestamps, toAdd);
    //remove invalid
    this.lockedTimestamps = this.lockedTimestamps.filter((t) => t.from >= t.to);
  }

  /**
   * the minimum time range to keep in this list, even it exceeds the max size constraint
   * @returns {number}
   */
  get minimumTimeRange(): number {
    return this._minimumTimeRange;
  }

  set minimumTimeRange(v: number) {
    this._minimumTimeRange = v;
    this.removeOldEntries();
  }

  add(value: TimedValue<T>): void {
    this.push(value.ts, value.v_raw, value.duration);
  }

  push(ts: number, v: T, duration: number = 0, replace = true): void {
    //console.log('push value: '+ts+ ' '+v);
    this.removeOldEntries();
    if (this._cache) {
      this._cache.add(ts);
    }
    var d = this.tss;
    for (var i = d.length - 1; i >= 0; i--) {
      var act = d[i];
      if (act === ts && replace) {
        this.vs[i] = v;
        this.durations[i] = duration;
        return;
      }
      if (act < ts) {//add after that index
        d.splice(i + 1, 0, ts);
        this.vs.splice(i + 1, 0, v);
        this.durations.splice(i + 1, 0, duration);
        return;
      }
    }
    //add at the beginning
    d.unshift(ts);
    this.vs.unshift(v);
    this.durations.unshift(duration);
  }

  private removeOldEntries(): void {
    var d = this.tss,
      i,
      act,
      toKeep;
    if (d.length < this.maxSize || this.maxSize < 0 || this.minimumTimeRange < 0) {//too short for optimization
      return;
    }
    //keep at least 10 seconds
    toKeep = d[d.length - 1] - this.minimumTimeRange;

    if (d[0] > toKeep) { //keep everything
      return;
    }
    //find the position
    var f = this.floor(toKeep);


    if (f) {
      this.clear(0, f.ts);
    }
  }

  private clearSlice(from, to) {
    if (to <= from || from < 0 || to > this.tss.length) { //invalid or out of range
      return;
    }
    this.tss.splice(from, to - from); //remove the too old values
    this.vs.splice(from, to - from);
    this.durations.splice(from, to - from);
  }

  clear(from = Number.NEGATIVE_INFINITY, to = Number.POSITIVE_INFINITY): void {
    if (this.isEmpty || this.maxTimeStamp < from || to < this.minTimeStamp) {
      return;
    }
    this._cache = null;

    var toIndex = (ts, f, default_) => {
      var r = f.call(this, ts);
      return r ? r.index : default_;
    };
    var to_t, from_t;
    //optimize
    if (from === Number.NEGATIVE_INFINITY && to === Number.POSITIVE_INFINITY && this.lockedTimestamps.length === 0) {
      this.vs.length = 0;
      this.tss.length = 0;
      this.durations.length = 0;
      return;
    }
    from_t = toIndex(from, this.ceiling, this.vs.length - 1);
    to_t = toIndex(to, this.floor, -1);

    if (to_t < from_t) {
      return; //nothing to clear
    }

    var t = new TimestepRange(from, to);

    var overlaps = this.lockedTimestamps.map((l) => t.overlap(l)).filter((o) => o !== null);
    if (overlaps.length === 0) {
      this.clearSlice(from_t, to_t + 1);
      return;
    }

    if (overlaps.some((o) => o === t)) { //whole range to clear is locked
      return;
    }

    if (overlaps.length === 1) {//most common case first
      var o = overlaps[0],
        o_f = toIndex(o.from, this.ceiling, to_t),
        o_t = toIndex(o.to, this.floor, from_t);
      if (o_t < o_f) { //we have no data in our locked area
        this.clearSlice(from_t, to_t + 1); //delete everything
        return;
      }
      this.clearSlice(from_t, o_f);
      this.clearSlice(o_t + 1, to_t + 1);
      return;
    }
    var acc = from_t, start = acc;
    //check individual timesteps slow but should work
    while (acc <= to_t) {
      var ts = this.tss[acc];
      if (this.lockedTimestamps.some((o) => o.contains(ts))) {
        this.clearSlice(start, acc);
        start = acc + 1;
      }
      acc += 1;
    }
    //clear rest
    this.clearSlice(start, to_t + 1);
  }
}
