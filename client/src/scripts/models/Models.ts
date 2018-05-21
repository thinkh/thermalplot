/**
 * Created by Samuel Gratzl on 16.04.2014.
 */
import * as d3 from '@bower_components/d3/d3';
import { TimedParentValue, TimedIndexedValue, TimedValue, TimedList, IBinner } from "./Timed";
import { IStepper } from "../services/Animator";
import { Node, AttributeContainer, findLeastCommonAncestor, Edge, Infrastructure } from './Infrastructure';

/**
 * a path elem part of the infrastructure graph: node, edge, attribute
 */
export interface IPathElem {
  /**
   * the infrastructure this path belongs to
   */
  infrastructure: Infrastructure;
  /**
   * return the name of the element
   */
  name: string;
  /**
   * return the fully qualified name
   */
  fqname: string;

  /**
   * returns the fully qualified name including the infrastructure id
   */
  fqIname: string;

  /**
   * alias to the fqname, must be globally unique
   */
  alias: string;

  /**
   * alias to fqname
   */
  toString(): string;

  /**
   * the parent element
   */
  parent: IPathElem;

  /**
   * chain of parents starting with itself
   */
  parents: IPathElem[];
}

export interface IAttribute<T> extends IPathElem {

  /**
   * the type of values
   */
  valueType: any;
  /**
   * the number of items in this attribute
   */
  length: number;

  /**
   * whether #normalize does something useful
   * @returns {boolean}
   */
  isNormalizeAble: boolean;

  /**
   * normalizes the given input value to a range 0..1
   * @param value
   * @returns {number}
   */
  normalize(value: T): number;

  rawValues(from: number, to: number): TimedValue<T>[];
  numRawValues(from: number, to: number): number;

  /**
   * see ImmutableTimedList#areNoValuesThere
   * @param from
   * @param to
   * @param step
   * @param feedForward
   */
  areNoValuesThere(from: number, to: number, step: IStepper, feedForward: boolean): boolean;
  /**
   * see ImmutableTimedList#list
   * @param from
   * @param to
   * @param step
   */
  list(from: number, to: number, step: IStepper): T[];
  values(from: number, to: number, step: IStepper, feedForward: boolean): T[];

  /**
   * see TimedList#frequencies
   * @param from
   * @param to
   * @param step
   */
  frequencies(from: number, to: number, step: IStepper): number[];


  /**
   * see TimedList#valueList
   * @param from
   * @param to
   * @param step
   */
  valueList(from: number, to: number, step: IStepper, r: TimedParentValue<T, IAttribute<T>>[]): TimedParentValue<T, IAttribute<T>>[];
  /**
   * see TimedList#floor
   * @param from
   * @param to
   * @param step
   */
  floor(ts: number): TimedIndexedValue<T>;

  /**
   * see TimedList#ceiling
   * @param from
   * @param to
   * @param step
   */
  ceiling(ts: number): TimedIndexedValue<T>;

  /**
   * resets this attribute
   */
  clear();
  clear(from: number, to: number);
  lock(ts: number);
  unlock(ts: number);
  has(ts: number): boolean;
}

export class Attribute<T> implements IAttribute<T> {
  private listeners = d3.dispatch('add', 'reset');
  protected data = new TimedList<T>();
  protected invalidValue = null;
  public binner: IBinner<T> = null;

  constructor(public name: string, public alias: string, public parent: IPathElem) {
    if (!alias) {
      this.alias = null;
    }
  }

  get parents() {
    var r = this.parent.parents;
    r.splice(0, 0, this);
    return r;
  }

  get infrastructure() {
    return this.parent.infrastructure;
  }

  get fqname() {
    return this.parent.fqname + '#' + this.name;
  }

  get fqIname() {
    return this.parent.fqIname + '#' + this.name;
  }

  toString() {
    return this.fqIname;
  }

  get valueType(): any {
    return null;
  }

  get length() {
    return this.data.length;
  }

  get isNormalizeAble(): boolean {
    return false;
  }

  normalize(value: T): number {
    return Number.NaN;
  }

  on(type: string, listener?) {
    if (arguments.length < 2)
      return this.listeners.on(type);
    this.listeners.on(type, listener);
    return this;
  }

  fire(type: string, ...arg: any[]) {
    this.listeners[type].apply(this.listeners[type], arg);
  }

  /**
   * chance for subclasses to preprocess (e.g. clamp values)
   * @param value
   * @returns {any}
   */
  protected preprocess(value: any): T {
    return value;
  }

  /**
   * pushes a value to this attribute
   * @param ts
   * @param value
   * @param duration
   */
  push(ts: number, value: any, duration: number = 0) {
    var v = this.preprocess(value);
    this.data.push(ts, v, duration);
    this.fire('add', ts, v, duration);
  }

  areNoValuesThere(from: number, to: number, step: IStepper, feedForward: boolean = false) {
    return this.data.areNoValuesThere(from, to, step, feedForward);
  }

  list(from: number, to: number, step: IStepper): T[] {
    return this.values(from, to, step);
  }

  values(from: number, to: number, step: IStepper, feedForward: boolean = true): T[] {
    return this.data.values(from, to, step, this.binner, feedForward, this.invalidValue);
  }

  rawValues(from: number, to: number): TimedValue<T>[] {
    return this.data.rawValues(from, to);
  }

  numRawValues(from: number, to: number) {
    if (this.data) {
      return this.data.numRawValues(from, to);
    }
    return this.rawValues(from, to).length;
  }

  frequencies(from: number, to: number, step: IStepper): number[] {
    return this.data.frequencies(from, to, step);
  }

  valueList(from: number, to: number, step: IStepper, r = new Array<TimedParentValue<T, IAttribute<T>>>()): TimedParentValue<T, IAttribute<T>>[] {
    return this.data.valueList<IAttribute<T>>(this, from, to, step, this.binner, false, (v: T) => v !== this.invalidValue, this.invalidValue, r);
  }

  floor(ts: number): TimedIndexedValue<T> {
    return this.data.floor(ts);
  }

  ceiling(ts: number): TimedIndexedValue<T> {
    return this.data.ceiling(ts);
  }

  clear(from = Number.NEGATIVE_INFINITY, to = Number.POSITIVE_INFINITY) {
    if (this.data) {
      this.data.clear(from, to);
    }
    this.fire('reset', from, to);
  }
  lock(ts: number) {
    if (this.data) {
      this.data.lock(ts);
    }
  }
  unlock(ts: number) {
    if (this.data) {
      this.data.unlock(ts);
    }
  }
  has(ts: number) {
    if (this.data) {
      return this.data.has(ts);
    }
    return false;
  }
}

export class StringAttribute extends Attribute<string> {
  constructor(name: string, alias: string, parent: IPathElem) {
    super(name, alias, parent);
  }

  get valueType(): any {
    return String;
  }

  preprocess(value: any): string {
    return value ? value.toString() : '';
  }
}

export class CategoricalAttribute extends Attribute<string> {
  constructor(name: string, alias: string, parent: IPathElem, public categories: string[], public ordinal: boolean, invalidValue: string = null) {
    super(name, alias, parent);
    this.invalidValue = invalidValue;
  }

  get valueType(): any {
    return String;
  }

  preprocess(value: any): string {
    if (typeof value === 'number') { //map indices to their corresponding category
      var i = Math.round(+value);
      if (i < 0 || i >= this.categories.length) {
        return this.invalidValue;
      }
      return this.categories[i];
    }
    if (typeof value === 'undefined') {
      return this.invalidValue;
    }
    if (typeof value === 'string') {
      return value;
    }
    //complex hist object
    return value;
  }

  get isNormalizeAble(): boolean {
    return this.ordinal; //just ordinal ones, in which the category order has a meaning
  }

  /**
   * normalize the item to their normalized index position in the categories
   * @param value
   * @returns {number}
   */
  normalize(value: string): number {
    if (value === this.invalidValue) {
      return 0;
    }
    var index = this.categories.indexOf(value);
    if (index < 0) {
      return 0;
    }
    return (index + 1) / this.categories.length;
  }
}

export class NumberAttribute extends Attribute<number> {
  constructor(name: string, alias: string, parent: IPathElem, public min: number = Number.NEGATIVE_INFINITY, public max: number = Number.POSITIVE_INFINITY, public value: number = 0, public unit: string = "", public invert: boolean = false, public dynamicRange: boolean = false) {
    super(name, alias, parent);
    this.invalidValue = isFinite(min) ? min : Number.NaN;
  }

  get valueType(): any {
    return Number;
  }

  preprocess(value: any): number {
    if (typeof value === 'number' || typeof value === 'string') {
      return this.clamp(+value);
    }
    //complex object return unchanged
    return value;
  }

  private clamp(v: number) {
    if (v < this.min) {
      v = this.min;
    } else if (v > this.max) {
      v = this.max;
    }
    return v;
  }

  get isNormalizeAble(): boolean {
    //if min and max are valid values
    return isFinite(this.min) && !isNaN(this.min) && isFinite(this.max) && !isNaN(this.max);
  }

  normalize(value: number): number {
    if (isNaN(value)) {
      return 0;
    }
    if (this.min == 0 && this.max == 1) {
      return value;
    }
    return (value - this.min) / (this.max - this.min);
  }

  get range(): number[] {
    return [this.min, this.max];
  }

  rangeFromData(from, to): number[] {
    var range = [];
    if (this.data.numRawValues(from, to) > 0) {
      range = d3.extent(this.data.rawValues(from, to).map(d => d.v));
    }
    return range;
  }
}

/**
 * Attribute that calculates the value of two or multiple other NumberAttributes
 *
 * IMPORTANT: We assume that all attributes used in the formula have the same data for every timestamp.
 *            For performance reasons we test, e.g. only the first attribute.
 */
export class NumberCalcAttribute extends NumberAttribute {

  private templateVars = [];

  private _attrs = [];

  constructor(name: string, alias: string, parent: IPathElem, public min: number = Number.NEGATIVE_INFINITY, public max: number = Number.POSITIVE_INFINITY, public value: number = 0, public unit: string = "", public invert: boolean = false, private _formula: string = '') {
    super(name, alias, parent, min, max, value, unit, invert);

    // extract variables
    this.templateVars = this.getTemplateVars(_formula);

    // strip anything other than digits, (), -+/* and .
    //this._formula = _formula.replace(/[^-()\d/*+.]/g, '');
  }

  /**
   * Returns all template variables in the format {tplvar} as an array ['tplvar']
   * @param str
   * @returns {Array}
   */
  private getTemplateVars(str) {
    var results = [], re = /{([^}]+)}/g, text;
    while (text = re.exec(str)) {
      results.push(text[1]);
    }
    return results;
  }

  /**
   * Takes an object with template variables as keys and the values
   * and solves the given formula by using the JS eval() function.
   * @param values {'tplvar1': 10, 'tplvar2': 3}
   * @returns {any}
   */
  private solveFormula(values) {
    var formula2 = this.formula;
    this.templateVars.forEach((tv) => {
      formula2 = formula2.replace('{' + tv + '}', values[tv]);
    });
    return eval(formula2);
  }

  get formula(): string {
    return this._formula;
  }

  get attrs() {
    var that = this;
    // cache the attributes
    if (this._attrs.length === 0) {
      this._attrs = this.templateVars.map((tv) => {
        return <NumberAttribute>((<Node>this.parent).getAttr(tv));
      });

      // use first attribute only and assume that all other attributes have the same frequency
      this._attrs[0].on('add', (ts, v, duration) => {
        var values = {};
        that.attrs.forEach((attr) => {
          values[attr.name] = attr.floor(ts).v;
        });
        var result = that.solveFormula(values);
        // fire that new data is available
        that.fire('add', ts, result, duration);
      });
    }
    return this._attrs;
  }

  get valueType() {
    return Number;
  }

  get length() {
    var a = this.attrs;
    if (a.length == 0) {
      return 0;
    }
    return a[0].length;
  }

  get isNormalizeAble(): boolean {
    var a = this.attrs;
    return (a.length === 0 || a[0].isNormalizeAble);
  }

  normalize(value: number): number {
    return this.attrs[0].normalize(value);
  }
  /**
   * pushes a value to this attribute
   * @param ts
   * @param value
   * @param duration
   */
  push(ts: number, value: any, duration: number = 0) {
    throw new Error('invalid cant push to adapter');
  }

  areNoValuesThere(from: number, to: number, step: IStepper, feedForward: boolean = false) {
    return this.attrs[0].areNoValuesThere(from, to, step, feedForward);
  }

  list(from: number, to: number, step: IStepper): number[] {
    return this.values(from, to, step);
  }

  values(from: number, to: number, step: IStepper, feedForward: boolean = true): number[] {
    var values = {};
    this.attrs.forEach((attr) => {
      values[attr.name] = attr.values(from, to, step, feedForward);
    });
    //var result = this.solveFormula(values);
    console.warn('not implemented yet', values);
    return [];//this.wrappee.values(from, to, step, feedForward);
  }

  frequencies(from: number, to: number, step: IStepper): number[] {
    var frequencies = this.attrs.map((attr) => {
      attr.frequencies(from, to, step);
    });
    console.warn('not implemented yet', frequencies);
    return [];//return this.wrappee.frequencies(from, to, step);
  }

  valueList(from: number, to: number, step: IStepper, r = new Array<TimedParentValue<number, IAttribute<number>>>()): TimedParentValue<number, IAttribute<number>>[] {
    var valueList = this.attrs.map((attr) => {
      attr.valueList(from, to, step, r);
    });
    console.warn('not implemented yet', valueList);
    return null;//return this.wrappee.valueList(from, to, step, r);
  }

  rawValues(from: number, to: number): TimedValue<number>[] {
    var result = this.attrs[0].rawValues(from, to).map((tiv: TimedIndexedValue<number>, i) => {
      var values = {};
      this.attrs.forEach((attr) => {
        values[attr.name] = attr.rawValues(from, to)[i].v_raw;
      });
      tiv.v_raw = this.solveFormula(values);
      return tiv;
    });
    //console.log(result);
    return result;
  }

  numRawValues(from: number, to: number): number {
    return this.attrs[0].numRawValues(from, to);
  }

  floor(ts: number): TimedIndexedValue<number> {
    var a = this.attrs;
    if (a.length == 0) {
      return null;
    }
    return a[0].floor(ts);
  }

  ceiling(ts: number): TimedIndexedValue<number> {
    var a = this.attrs;
    if (a.length == 0) {
      return null;
    }
    return a[0].ceiling(ts);
  }

  lock(ts: number) {
    this.attrs.forEach((attr) => { attr.lock(ts); });
  }
  unlock(ts: number) {
    this.attrs.forEach((attr) => { attr.unlock(ts); });
  }
  has(ts: number) {
    return this.attrs.every((attr) => attr.has(ts));
  }
}

export class IntAttribute extends NumberAttribute {
  constructor(name: string, alias: string, parent: IPathElem, min: number = 0, max: number = Number.POSITIVE_INFINITY, value: number = 0, unit: string = '', invert: boolean = false) {
    super(name, alias, parent, min, max, value, unit, invert);
  }

  preprocess(value: any): number {
    if (typeof value === 'number' || typeof value === 'string') {
      value = Math.round(+value);
    }
    //convert to integer
    return super.preprocess(value);
  }
}

export class CounterAttribute extends IntAttribute {
  constructor(name: string, alias: string, parent: IPathElem) {
    super(name, alias, parent);
  }
}

function defaultReduceFrequency(previousValue: number, currentValue: number, index: number, array: number[]) {
  return currentValue + previousValue;
}

function defaultReduceValue<T>(previousValue: T, currentValue: T, index: number, array: T[]) {
  return currentValue;
}

/**
 * composite pattern for attributes
 */
export class ACompositeAttribute<T> implements IAttribute<T> {
  reduceValue: (previousValue: T, currentValue: T, index: number, array: T[]) => T = defaultReduceValue;
  reduceValueInitial: T = null;
  reduceFrequency: (previousValue: number, currentValue: number, index: number, array: number[]) => number = defaultReduceFrequency;
  reduceFrequencyInitial: number = 0;
  normalizeAbleReduce = false;

  constructor(public parent: IPathElem = null, private _name: string = null, public alias: string = null) {
  }

  _attrs() {
    return [];
  }


  get parents() {
    var r = this.parent ? this.parent.parents : new Array<IPathElem>();
    r.splice(0, 0, this);
    return r;
  }

  get infrastructure() {
    if (this.parent) {
      this.parent.infrastructure;
    }
    var a = this._attrs();
    return (a.length > 0 ? a[0].infrastructure : null);
  }

  get fqname() {
    return (this.parent ? this.parent.fqname : '') + '#' + this.name;
  }

  get fqIname() {
    return (this.parent ? this.parent.fqIname : this.infrastructure.id + ':') + '#' + this.name;
  }

  get name() {
    return this._name ? this._name : '(' + this._attrs().map((a) => a.name).join(',') + ')';
  }

  toString() {
    return this.fqIname;
  }

  get valueType() {
    return Number;
  }

  get length() {
    var a = this._attrs;
    if (a.length == 0) {
      return 0;
    }
    return a[0].length;
  }

  get isNormalizeAble(): boolean {
    if (!this.normalizeAbleReduce) {
      return false;
    }
    var a = this._attrs();
    return (a.length === 0 || a[0].isNormalizeAble);
  }

  normalize(value: T): number {
    if (this.isNormalizeAble) {
      var a = this._attrs();
      return a.length === 0 ? <number><any>value : a[0].normalize(value);
    }
    return Number.NaN;
  }

  areNoValuesThere(from: number, to: number, step: IStepper, feedForward: boolean = false) {
    return this._attrs().every((a) => a.areNoValuesThere(from, to, step, feedForward));
  }

  list(from: number, to: number, step: IStepper): T[] {
    return this.values(from, to, step);
  }

  values(from: number, to: number, step: IStepper, feedForward: boolean = true): T[] {
    var a = this._attrs(), ori = a.map((a) => a.values(from, to, step, feedForward)).filter((l) => l.length > 0);
    var r = new Array<T>();
    if (a.length === 0) {
      return r;
    }
    for (var i = 0; i < ori[0].length; ++i) {
      var tmp = ori.map((ti) => ti[i]);
      r.push(tmp.reduce((p, c, i, arr) => this.reduceValue.call(this, p, c, i, arr, a), this.reduceValueInitial));
    }
    return r;
  }

  frequencies(from: number, to: number, step: IStepper): number[] {
    var a = this._attrs(), ori = a.map((a) => a.frequencies(from, to, step));
    var r = new Array<number>();
    if (a.length === 0) {
      return r;
    }
    for (var i = 0; i < ori[0].length; ++i) {
      var tmp = ori.map((ti) => ti[i]);
      r.push(tmp.reduce((p, c, i, arr) => this.reduceFrequency.call(this, p, c, i, arr, a), this.reduceFrequencyInitial));
    }
    return r;
  }

  valueList(from: number, to: number, step: IStepper, r = new Array<TimedParentValue<T, IAttribute<T>>>()): TimedParentValue<T, IAttribute<T>>[] {
    //collect them in a temporary list
    var tmp = new Array<TimedParentValue<T, IAttribute<T>>>(),
      a = this._attrs();
    a.forEach((a) => a.valueList(from, to, step, tmp));
    //group by ts
    var nest = d3.nest().key((d) => d.ts).entries(tmp);
    var val;
    nest.forEach((group) => {
      var tmp2 = group.values.map((ti) => ti.v); //map to value
      val = tmp2.reduce((p, c, i, arr) => this.reduceValue.call(this, p, c, i, arr, a), this.reduceValueInitial); //reduce
      //create a real entry as group is based on strings use the ts from the first entry
      r.push(new TimedParentValue(this, group.values[0].ts, val, step.refStepWidth));
    });
    return r;
  }

  floor(ts: number): TimedIndexedValue<T> {
    return null;
  }

  ceiling(ts: number): TimedIndexedValue<T> {
    return null;
  }

  rawValues(from: number, to: number): TimedValue<T>[] {
    return [];
  }

  numRawValues(from: number, to: number) {
    return this.rawValues(from, to).length;
  }

  clear(from = Number.NEGATIVE_INFINITY, to = Number.POSITIVE_INFINITY) {
    this._attrs().forEach((attr) => attr.clear(from, to));
  }

  lock(ts: number) {
    this._attrs().forEach((attr) => attr.lock(ts));
  }
  unlock(ts: number) {
    this._attrs().forEach((attr) => attr.unlock(ts));
  }
  has(ts: number) {
    return this._attrs().every((attr) => attr.has(ts));
  }
}
/**
 * a composite with a bunch of given attributes
 */
export class CompositeAttribute<T> extends ACompositeAttribute<T> {
  attrs = new Array<IAttribute<T>>();

  constructor(parent: IPathElem = null, _name: string = null, alias: string = null) {
    super(parent, _name, alias);
  }

  _attrs() {
    return this.attrs;
  }
}

/**
 * a composite attribute with all the raw data as array
 */
export class ObjectCompositeAttribute extends CompositeAttribute<Object> {

  constructor(parent: IPathElem = null, _name: string = null, alias: string = null) {
    super(parent, _name, alias);
  }

  values(from: number, to: number, step: IStepper, feedForward: boolean = true): Object[] {
    var a = this._attrs(), ori, tmpBinner;

    // use a temporary binner that bypasses the binning (== the raw data)
    ori = a.map((a: Attribute<Object>) => {
      tmpBinner = a.binner;
      a.binner = (data: any[]): any => { return data; };
      var r = a.values(from, to, step, feedForward);
      a.binner = tmpBinner;
      return r;
    }).filter((l) => l.length > 0);

    var r = [];
    if (a.length === 0) {
      return r;
    }
    for (var i = 0; i < ori[0].length; ++i) {
      var o = {};
      ori.forEach((ti, idx) => {
        if (typeof ti[i] === 'string') {
          o[a[idx].name] = [ti[i]];
        } else {
          o[a[idx].name] = ti[i];
        }
      });
      r.push(o);
    }
    return r;
  }

  frequencies(from: number, to: number, step: IStepper): number[] {
    var a = this._attrs(), ori = a.map((a) => a.frequencies(from, to, step));
    var r: number[] = [];
    if (a.length === 0) {
      return r;
    }
    return ori[0];
  }
}

/**
 * a composite implementation where function derives the attributes to compose
 */
export class CompositeFunctionAttribute<T> extends ACompositeAttribute<T> {
  attrs: () => IAttribute<T>[] = () => [];
  attrsThis: any;

  constructor(parent: IPathElem = null, _name: string = null, alias: string = null) {
    super(parent, _name, alias);
    this.attrsThis = this;
  }

  _attrs() {
    return this.attrs.call(this.attrsThis);
  }
}


/**
 * wraps another attribute and redirects all the stuff
 */
export class AttributeRedirect<T> extends Attribute<T> {
  constructor(private wrappee: IAttribute<T>, parent: IPathElem) {
    super(wrappee.name, wrappee.alias, parent);
    this.data = null; //not needed
  }

  get valueType(): any {
    return this.wrappee.valueType;
  }

  get length() {
    return this.wrappee.length;
  }

  get isNormalizeAble(): boolean {
    return this.wrappee.isNormalizeAble;
  }

  normalize(value: T): number {
    return this.wrappee.normalize(value);
  }
  /**
   * pushes a value to this attribute
   * @param ts
   * @param value
   * @param duration
   */
  push(ts: number, value: any, duration: number = 0) {
    throw new Error('invalid cant push to adapter');
  }

  areNoValuesThere(from: number, to: number, step: IStepper, feedForward: boolean = false) {
    return this.wrappee.areNoValuesThere(from, to, step, feedForward);
  }

  list(from: number, to: number, step: IStepper): T[] {
    return this.values(from, to, step);
  }

  values(from: number, to: number, step: IStepper, feedForward: boolean = true): T[] {
    return this.wrappee.values(from, to, step, feedForward);
  }

  frequencies(from: number, to: number, step: IStepper): number[] {
    return this.wrappee.frequencies(from, to, step);
  }


  valueList(from: number, to: number, step: IStepper, r = new Array<TimedParentValue<T, IAttribute<T>>>()): TimedParentValue<T, IAttribute<T>>[] {
    return this.wrappee.valueList(from, to, step, r);
  }

  floor(ts: number): TimedIndexedValue<T> {
    return this.wrappee.floor(ts);
  }

  ceiling(ts: number): TimedIndexedValue<T> {
    return this.wrappee.ceiling(ts);
  }

  lock(ts: number) {
    return this.wrappee.lock(ts);
  }
  unlock(ts: number) {
    return this.wrappee.unlock(ts);
  }
  has(ts: number) {
    return this.wrappee.has(ts);
  }
}

/**
 * linear transformed attribute by a function, e.g. +10
 */
export class LinearTransformedAttribute<T> extends Attribute<T> {
  constructor(name: string, alias: string, parent: IPathElem, private attr: string) {
    super(name, alias, parent);
    this.data = null;
    this.invalidValue = -1;

    (<any>this.wrappee).on('add.' + this.name, (ts) => this.fire('add', ts));
  }

  get wrappee(): IAttribute<T> {
    if (this.parent instanceof AttributeContainer) {
      return (<AttributeContainer><any>this.parent).getAttr(this.attr);
    }
    return null;
  }

  f(v: T): T {
    return v;
  }

  private fobj(v): any {
    if (v === null) {
      return null;
    }
    if (v instanceof TimedParentValue) {
      return new TimedParentValue(v.parent, v.ts, this.f(v.v), v.duration);
    }
    if (v instanceof TimedIndexedValue) {
      return new TimedIndexedValue(v.ts, this.f(v.v), v.duration, v.index);
    }
    return new TimedValue(v.ts, this.f(v.v), v.duration);
  }

  get min(): number {
    if (this.wrappee.hasOwnProperty('min')) {
      return <any>(this.f.call(this.wrappee, (<any>this.wrappee).min));
    }
    return 0;
  }

  get max(): number {
    if (this.wrappee.hasOwnProperty('max')) {
      return <any>(this.f.call(this.wrappee, (<any>this.wrappee).max));
    }
    return Number.POSITIVE_INFINITY;
  }

  toString() {
    return this.fqIname;
  }

  get valueType(): any {
    return this.wrappee.valueType;
  }

  get length() {
    return this.wrappee.length;
  }

  get isNormalizeAble(): boolean {
    return false;
  }

  normalize(value: T): number {
    return NaN;
  }
  /**
   * pushes a value to this attribute
   * @param ts
   * @param value
   * @param duration
   */
  push(ts: number, value: any, duration: number = 0) {
    throw new Error('invalid cant push to adapter');
  }

  areNoValuesThere(from: number, to: number, step: IStepper, feedForward: boolean = false) {
    return this.wrappee.areNoValuesThere(from, to, step, feedForward);
  }

  list(from: number, to: number, step: IStepper): T[] {
    return this.values(from, to, step).map((d) => this.f(d));
  }

  values(from: number, to: number, step: IStepper, feedForward: boolean = true): T[] {
    return this.wrappee.values(from, to, step, feedForward).map((d) => this.f(d));
  }

  frequencies(from: number, to: number, step: IStepper): number[] {
    return this.wrappee.frequencies(from, to, step);
  }

  valueList(from: number, to: number, step: IStepper, r = new Array<TimedParentValue<T, IAttribute<T>>>()): TimedParentValue<T, IAttribute<T>>[] {
    var tmp = [];
    tmp = this.wrappee.valueList(from, to, step, tmp);
    r.push.apply(r, tmp.map(this.fobj.bind(this)));
    return r;
  }

  floor(ts: number): TimedIndexedValue<T> {
    return this.fobj(this.wrappee.floor(ts));
  }

  ceiling(ts: number): TimedIndexedValue<T> {
    return this.fobj(this.wrappee.ceiling(ts));
  }

  rawValues(from: number, to: number): TimedValue<T>[] {
    var r: any = this.wrappee.rawValues(from, to).map(this.fobj.bind(this));
    return r;
  }
  numRawValues(from: number, to: number) {
    return this.wrappee.numRawValues(from, to);
  }
  clear(from = Number.NEGATIVE_INFINITY, to = Number.POSITIVE_INFINITY) {
    this.wrappee.clear(from, to);
  }
  lock(ts: number) {
    this.wrappee.lock(ts);
  }
  unlock(ts: number) {
    this.wrappee.unlock(ts);
  }
  has(ts: number) {
    return this.wrappee.has(ts);
  }
}

export class DeltaIndexAttribute extends LinearTransformedAttribute<number> {
  private _indexTS: number = NaN;
  private _indexValue: number = NaN;
  constructor(name: string, alias: string, parent: IPathElem, attr: string, public invert: boolean = false, public range: number[] = [-1, 1]) {
    super(name, alias, parent, attr);
  }

  /**
   * set the index timestamp to use
   * @param ts
   */
  setIndexTS(ts: number) {
    this._indexTS = ts;
    this._indexValue = NaN;
    this.computeIndex();
  }

  invertValue(value) {
    return (this.invert) ? (value * -1) : value;
  }

  private computeIndex() {
    if (isNaN(this._indexTS)) { //not yet set
      return;
    }
    var v = this.wrappee.floor(this._indexTS);
    if (v === null) {
      v = this.wrappee.ceiling(this._indexTS); //select the next best matching one
    }
    if (v != null) {
      this._indexValue = v.v;
      this.fire('reset', Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY);
    }
  }

  indexValue() {
    if (isNaN(this._indexValue)) {
      this.computeIndex();
    }
    return this._indexValue;
  }

  f(v: number): number {
    var index = this.indexValue();
    v = this.invertValue(v);
    if (isNaN(index)) {
      return v;
    }
    return v - index;
  }
}

export class DeltaIndexPercentageAttribute extends DeltaIndexAttribute {
  constructor(name: string, alias: string, parent: IPathElem, attr: string, invert: boolean = false, public range: number[] = [-1, 1]) {
    super(name, alias, parent, attr, invert, range);
  }
  f(v: number): number {
    var index = this.indexValue();
    if (isNaN(index)) {
      return v;
    }
    return (v - index) / index;
  }
}

export class ConstantAttribute<T> extends Attribute<T> {
  private value: T = null;
  constructor(name: string, alias: string, parent: IPathElem, public invert: boolean = false) {
    super(name, alias, parent);
    this.data = null;
  }

  getValue() {
    return this.value;
  }

  get isSet() {
    return this.value !== null;
  }

  get length() {
    return this.isSet ? 1 : 0;
  }

  get isNormalizeAble(): boolean {
    return true;
  }

  normalize(value: T): number {
    return 0.5;
  }

  setValue(value: T) {
    this.value = value;
    this.fire('add', value, 0, 0);
  }

  areNoValuesThere(from: number, to: number, step: IStepper, feedForward: boolean = false) {
    return !this.isSet;
  }

  list(from: number, to: number, step: IStepper): T[] {
    return this.values(from, to, step);
  }

  values(from: number, to: number, step: IStepper, feedForward: boolean = true): T[] {
    var r = [];
    for (var i = from; i < to; i = step.step(i)) {
      r.push(this.value);
    }
    return r;
  }

  rawValues(from: number, to: number): TimedValue<T>[] {
    if (this.isSet) {
      return [new TimedValue(from, this.value)];
    }
    return [];
  }

  frequencies(from: number, to: number, step: IStepper): number[] {
    var v = this.isSet ? 1 : 0;
    var r = [];
    for (var i = from; i < to; i = step.step(i)) {
      r.push(v);
    }
    return r;
  }

  push(ts: number, value: any, duration: number = 0) {
    this.setValue(value);
  }

  valueList(from: number, to: number, step: IStepper, r = new Array<TimedParentValue<T, IAttribute<T>>>()): TimedParentValue<T, IAttribute<T>>[] {
    for (var i = from; i < to; i = step.step(i)) {
      r.push(new TimedParentValue(this, i, this.value));
    }
    return r;
  }

  floor(ts: number): TimedIndexedValue<T> {
    if (!this.isSet) {
      return null;
    }
    return new TimedIndexedValue(ts, this.value, 0, 0);
  }

  ceiling(ts: number): TimedIndexedValue<T> {
    return this.floor(ts);
  }
  has(ts: number) {
    return this.isSet;
  }

}

/**
 * returns an unsorted list fo all given attributes and valueList calls
 * @param attrs
 * @param from
 * @param to
 * @param step
 * @returns {any[]}
 */
export function valueList<T>(attrs: IAttribute<T>[], from: number, to: number, step: IStepper): TimedParentValue<T, IAttribute<T>>[] {
  var r = new Array<TimedParentValue<T, IAttribute<T>>>();
  for (var i = attrs.length - 1; i >= 0; --i) {
    attrs[i].valueList(from, to, step, r);
  }
  return r;
}

/**
 * produces all intermediate routes for the given list of complex ones
 * @param list the list to expand
 * @returns {aTimedParentValue<T,IAttribute<T>>}
 */
export function intermediateRoutes<T>(list: TimedParentValue<T, IAttribute<T>>[]): TimedParentValue<T, IAttribute<T>>[] {
  var m = d3.map();
  //create the chain entries
  function createChain(chain: Node[], v: TimedParentValue<T, IAttribute<T>>) {
    for (var i = 0; i < chain.length - 1; ++i) {
      var act = chain[i],
        next = chain[i + 1],
        edge = act.getOutgoingEdge(next),
        attr = edge ? edge.getAttr(v.parent.name) : null;
      if (!attr) {
        continue;
      }
      var key = attr.fqIname + '@' + v.ts;
      if (m.has(key)) {
        m.get(key).v += v.v; //TODO hard coded sum
      } else {
        m.set(key, new TimedParentValue<T, IAttribute<T>>(attr, v.ts, v.v, v.duration));
      }
    }
  }
  //for each entry
  list.forEach((v) => {
    if (!(v.parent.parent instanceof Edge)) {
      return;
    }
    var edge: Edge = <Edge><any>v.parent.parent,
      sparents = edge.src.parents,
      dparents = edge.dst.parents,
      common = findLeastCommonAncestor(sparents, dparents);
    if (common.found) {
      sparents = sparents.slice(0, common.si + 1); //should include the root
      dparents = dparents.slice(0, common.di); //without the ancestor
    }
    createChain(sparents.concat(dparents.reverse()), v);
  });
  //combine values in the entries and create the result
  return m.values();
}

/**
 * create a redirect attribute, i.e., a attribute that returns the values of another one but has another parent
 * @param attr
 * @param parent
 * @returns {AttributeRedirect}
 */
export function redirect<T>(attr: IAttribute<T>, parent: IPathElem) {
  return new AttributeRedirect(attr, parent);
}

function parseReduce(r: ACompositeAttribute<number>, reduce = '+') {
  switch (reduce) {
    case "+":
    case "sum":
      r.reduceFrequencyInitial = r.reduceValueInitial = 0;
      r.reduceFrequency = r.reduceValue = function (p, v) {
        return isNaN(v) ? p : p + v;
      };
      break;
    case "max":
      r.reduceFrequencyInitial = r.reduceValueInitial = 0;
      r.reduceFrequency = r.reduceValue = function (p, v) {
        return isNaN(v) ? p : Math.max(p, v);
      };
      r.normalizeAbleReduce = true;
      break;
    case "min":
      r.reduceFrequencyInitial = r.reduceValueInitial = 0;
      r.reduceFrequency = r.reduceValue = function (p, v) {
        return isNaN(v) ? p : Math.min(p, v);
      };
      r.normalizeAbleReduce = true;
      break;
    case "avg":
    case "mean":
      r.reduceFrequencyInitial = r.reduceValueInitial = 0;
      r.reduceFrequency = r.reduceValue = function (p, v) {
        return isNaN(v) ? p : p + v / arguments[4].length;
      };
      r.normalizeAbleReduce = true;
      break;
  }
}

/**
 * create a combined attribute, which resolves the elements with the given callback function
 * @param attrs
 * @param reduce
 * @param parent
 * @param name
 * @param alias
 * @returns {CompositeFunctionAttribute<number>}
 */
export function composeF(attrs: () => IAttribute<number>[], reduce = '+', parent: IPathElem = null, name: string = null, alias: string = null) {
  var r = new CompositeFunctionAttribute<number>(parent, name, alias);
  r.attrs = attrs;
  parseReduce(r, reduce);
  return r;
}

/**
 * combines the given attribute to a new one, reducing all values using the given reducer
 * @param attrs
 * @param reduce
 * @param parent optional the parent
 * @param name
 * @param alias
 * @returns {CompositeAttribute<number>}
 */
export function compose(attrs: IAttribute<number>[], reduce = '+', parent: IPathElem = null, name: string = null, alias: string = null) {
  var r = new CompositeAttribute<number>(parent, name, alias);
  r.attrs.push.apply(r.attrs, attrs);
  parseReduce(r, reduce);
  return r;
}

