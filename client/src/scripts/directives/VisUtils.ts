/**
 * Created by Samuel Gratzl on 23.04.2014.
 */
import * as angular from '@bower_components/angular';
import * as d3 from '@bower_components/d3/d3';
import * as JQuery from '@bower_components/jquery';
import * as jQuery from '@bower_components/jquery';
import * as $ from '@bower_components/jquery';
import { PVDHierarchyConfig } from './HierarchyConfig';
import { IAttribute } from '../models/Models';
import { Infrastructure } from '../models/Infrastructure';


/**
 * default colorer method, which converts a given value into a color
 * @param value
 * @returns {*}
 */
export function defaultColorer(value: any): d3.Color.Color {
  if (isNaN(value)) { //invalid value
    return d3.rgb("gray");
  }
  if (typeof value === "number") { //assume normalized
    //red color changing dark to bright
    return d3.interpolateHsl('#fff', 'orange')(value);
    //return d3.hcl(0 /*red*/, .5, value);

  } else if (typeof value === "string") { //check some standard names
    switch (value) {
      case "high":
        return d3.rgb("red");
      case "medium":
        return d3.rgb("orange");
      case "low":
        return d3.rgb("green");
      default:
        break;
    }
  }
  //can't convert
  return d3.rgb("gray");
}

/**
 * convert a given value into a D3 color
 */
export interface IColorer<T> {
  (value: T): d3.Color.Color;
}


export function getRGBComponents(color) {
  var r = color.substring(1, 3);
  var g = color.substring(3, 5);
  var b = color.substring(5, 7);
  return {
    R: parseInt(r, 16),
    G: parseInt(g, 16),
    B: parseInt(b, 16)
  };
}

export function idealTextColor(bgColor) {
  var nThreshold = 105;
  var components = getRGBComponents(bgColor);
  var bgDelta = (components.R * 0.299) + (components.G * 0.587) + (components.B * 0.114);
  return ((255 - bgDelta) < nThreshold) ? '#000000' : '#ffffff';
}

/**
 * normalizes a given value into a 0..1 number
 */
export interface INormalizer<T> {
  /**
   * apply normalization
   * @param value
   */
  normalize(value: T): number;
  /**
   * in case of multiple values with no bounds, a chance to adapt the normalization, when trying to normalize all the given values
   * @param values the current data, which will be normalized
   * @param dt delta time in case of an animation
   */
  adapt(values: T[], dt: number);

  adaptEnd();
}

var DummyNormalizer = {
  normalize: function (value: any) {
    return 0;
  },
  adapt: function (values: any[]) {
  },
  adaptEnd: function () {

  }
};

class ConstantNormalizer implements INormalizer<any> {
  min = Number.NEGATIVE_INFINITY;
  delta = 0;

  normalize(value: any): number {
    var v = +value;
    if (this.delta == 0) { //no range just single values
      return 0;
    }
    //normalize
    v = (v - this.min) / this.delta;
    //clamp
    if (v < 0) {
      v = 0;
    } else if (v > 1) {
      v = 1;
    }
    return v;
  }

  adapt(values: any[], dt: number) {

  }
  adaptEnd() {

  }
}

class AdaptiveNormalizer extends ConstantNormalizer {
  _targetMin = Number.NEGATIVE_INFINITY;
  _targetDelta = 0;

  adapt(values: any[], dt: number) {
    this._targetMin = d3.min(values);
    var max = d3.max(values);
    this._targetDelta = max - this._targetMin;

    if (!isFinite(this.min)) { //first time
      this.min = this._targetMin;
      this.delta = this._targetDelta;
      return;
    } else if (this._targetMin == this.min && this._targetDelta == this.delta) {
      return; //nothing to adapt
    }

    //FIXME need transition
    this.min = this._targetMin;
    this.delta = this._targetDelta;
  }
}

/**
 * an AdaptiveNormalizer but with a fixed/known minimum
 */
class MaxAdaptiveNormalizer extends AdaptiveNormalizer {
  constructor(min: number) {
    super();
    this.min = min;
  }

  adapt(values: any[], dt: number) {
    var max = d3.max(values);
    this._targetDelta = max - this.min;
    if (this.delta == 0) { //first time
      this.delta = this._targetDelta;
      return;
    } else if (this._targetDelta == this.delta) {
      return; //nothing to adapt
    }

    //FIXME need transition
    this.delta = this._targetDelta;
  }
}

export function createConstantNormalizer(min: number, max: number): INormalizer<number> {
  var r = new ConstantNormalizer();
  r.min = min;
  r.delta = max - min;
  return r;
}

/**
 * utility function to create a normalizer for the given attribute
 * @param attr the attribute to normalize
 * @param showFrequencies whether the frequencies of this attribute will be shown
 * @returns {*}
 */
export function createNormalizer<T>(attr: IAttribute<T>, showFrequencies: boolean): INormalizer<T> {
  if (!showFrequencies && attr.isNormalizeAble) {
    //the attribute can normalize itself
    return {
      normalize: function (v) {
        return attr.normalize(v)
      },
      adapt: function (vs) {
      },
      adaptEnd: function () {
      }
    }
  } else if (showFrequencies) { //frequencies ... 0..unbound
    return new MaxAdaptiveNormalizer(0);
  } else if (attr.valueType === Number) { //check if defined minimum
    if (attr.hasOwnProperty("min") && isFinite(attr["min"]) && !isNaN(attr["min"])) {
      return new MaxAdaptiveNormalizer(attr["min"]);
    } else {
      return new AdaptiveNormalizer();
    }
  } else { //constant can't show
    return DummyNormalizer;
  }
}

/**
 * return the bounding box of an svg element
 * @param elem
 */
export function getBBox(elem: SVGGraphicsElement);
export function getBBox($elem: JQuery);
export function getBBox($elem: d3.Selection);
export function getBBox(elem: any) {
  if (elem instanceof jQuery) {
    elem = elem[0];
  } else if (elem.node) {
    elem = elem.node();
  }
  return (<SVGGraphicsElement>elem).getBBox();
}

export class Dimension {
  constructor(public width: number, public height: number) {

  }

  get area() {
    return this.width * this.height;
  }
}

/**
 * returns the dimension of an svg element, if it isn't layouted yet, it may return 0,0
 * @param elem
 */
export function getDimension(elem: SVGGraphicsElement);
export function getDimension($elem: JQuery);
export function getDimension($elem: d3.Selection);
export function getDimension(elem: any) {
  if (elem instanceof jQuery) {
    elem = elem[0];
  } else if (elem.node) {
    elem = elem.node();
  }
  if (elem.hasOwnProperty("width") && elem.hasOwnProperty("height")) {
    return new Dimension(elem.width.baseVal.value, elem.height.baseVal.value);
  }
  return new Dimension(0, 0);
}

var _id = 0;

/**
 * return a new unique id, e.g. used for unique listener names
 * @returns {string}
 */
export function nextID(): string {
  return '' + (++_id);
}

/**
 *
 * @param step step size in ms
 * @returns {function(number): number} (timestamp in ms) -> representable value
 */
export function tsNormalizer(start: number, step: number): (ts: number) => number {
  var bandwidth = step / 4;
  var shift = start % step;
  // range of [v-bandwidth .. v+bandwidth] should all be just v
  return (ts: number) => {
    ts = Math.round(ts - shift);
    ts = Math.round(ts / bandwidth);
    switch (ts % 4) {
      case 0:
        return (Math.round(ts / 4)) * 2;
      case 1:
        return (Math.round(ts / 4)) * 2;
      case 3:
        return (Math.round(ts / 4) + 1) * 2;
      case 2:
        return (Math.round(ts / 4)) * 2 + 1;
    }
  }
}

export function onDelete(s: d3.Selection, f: () => void) {
  var id = 'DOMNodeRemoved.ondelete' + nextID(),
    node: Node = s.node();
  function l() {
    //since this event bubbles check if it the right node
    var n = node;
    while (n) { //check if node or its parent are removed
      if (d3.event.target === n) {
        node = null;
        s.on(id, null);
        d3.select('body').on(id, null);
        f();
        return;
      }
      n = n.parentNode;
    }
  }
  s.on(id, l);
  d3.select('body').on(id, l);
}

var _tooltip = null;

export function tooltip(tooltip: string): (x: d3.Selection) => void;
export function tooltip(tooltipCallback: (data?: any, index?: number) => string): (x: d3.Selection) => void;
export function tooltip(tooltip: any): (x: d3.Selection) => void;
export function tooltip(): Tooltip;
export function tooltip(tooltip?: any): any {
  if (_tooltip == null) {
    _tooltip = new Tooltip();
  }
  if (arguments.length > 0) { //if an argument is provided then directly return the adapter
    return _tooltip.adapter(tooltip);
  }
  return _tooltip;
}

export class Tooltip {
  private $tooltip: d3.Selection;
  private $tooltipInner: d3.Selection;

  constructor() {
    this.$tooltip = d3.select('body').append('div')
      .attr('class', 'tooltip')
      .style('opacity', 0);

    this.$tooltipInner = this.$tooltip.append('div')
      .attr('class', 'tooltip-inner');
  }

  mouseover(text: string): void {
    this.$tooltip
      .style('display', 'block')
      .transition().duration(200)
      .style('opacity', 0.9);
    this.$tooltipInner.html(text);
  }

  mousemove(): void {
    var tooltipDim = this.$tooltip[0][0].getBoundingClientRect(),
      left = (<any>d3.event).pageX + 10,
      top = (<any>d3.event).pageY - 40;

    // correct position if outside of document
    if (left + tooltipDim.width > document.body.clientWidth) {
      left = (<any>d3.event).pageX - tooltipDim.width - 10;
    }

    if (top < 0) {
      top = (<any>d3.event).pageY + 40;
    }

    this.$tooltip
      .style('left', left + 'px')
      .style('top', top + 'px');
  }

  mouseout(): void {
    this.$tooltip
      .transition().duration(500)
      .style('opacity', 0)
      .each('end', () => this.hide());
  }

  hide(): void {
    this.$tooltip.style('display', 'none');
  }

  update(text: string) {
    this.$tooltipInner.html(text);
  }

  /**
   * attach the tooltip to the given selection
   * @param selection
   * @param tooltip
   */
  attach(selection: d3.Selection, tooltip: string): void;
  attach(selection: d3.Selection, tooltipCallback: (data: any, index: number) => string): void;
  attach(selection: d3.Selection, tooltip: any): void {
    var that = this;
    selection.on('mouseover', function () {
      var t = $.isFunction(tooltip) ? tooltip.apply(this, Array.prototype.slice.call(arguments)) : tooltip.toString();
      that.mouseover(t);
    }).on('mousemove', function () {
      that.mousemove();
    }).on('mouseout', function () {
      that.mouseout();
    });
  }

  /**
   * creates an adapter, function which binds the label callback function
   * @param tooltipCallback
   * @returns {function(d3.Selection): undefined}
   */
  adapter(tooltip: string): (x: d3.Selection) => void;
  adapter(tooltipCallback: (data: any, index: number) => string): (x: d3.Selection) => void;
  adapter(tooltip: any): (x: d3.Selection) => void {
    var that = this;
    return function (selection: d3.Selection) {
      that.attach(selection, tooltip);
    }
  }
}

/**
 *
 * @param config Configuration to modify
 * @param infra Use infrastructure.visConfig[config.visConfig].config
 */
export function modifyConfig(config: PVDHierarchyConfig, infra: Infrastructure, visConfigId: string = undefined, key: string = undefined) {
  visConfigId = (visConfigId === undefined) ? config.visConfigId : visConfigId;
  key = (key === undefined) ? 'representation' : key;

  if (visConfigId === '') {
    console.warn('Missing visConfigId in config');
    return false;
  }
  if (infra.visConfig[key][visConfigId] === undefined) {
    console.warn('Missing "visConfig.' + key + '.' + visConfigId + '" in infrastructure');
    return false;
  }
  if (infra.visConfig[key][visConfigId].config === undefined) {
    console.warn('Missing "visConfig.' + key + '.' + visConfigId + '.config" in infrastructure');
    return false;
  }

  var values = infra.visConfig[key][visConfigId].config;

  for (var property in values) {
    if (values.hasOwnProperty(property)) {
      config[property] = values[property];
    }
  }

  return true;
}
