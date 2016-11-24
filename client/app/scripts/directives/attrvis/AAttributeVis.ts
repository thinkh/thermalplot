/**
 * Created by AK116843 on 18.08.2014.
 */
/// <reference path='../../../../tsd.d.ts' />
/*global d3*/
'use strict';

module PVDVisualizations {
  export class PVDAAttributeVis implements IAnimateable {
    $node:D3.Selection;
    defConfig:any;
    scaleFactor = [1, 1];
    protected scale = d3.scale.linear();


    constructor(public $parent:D3.Selection, public attr:PVDModels.IAttribute<number>,
                protected normalizer:INormalizer<number>,
                protected config:PVDHierarchyConfig,
                parent:PVDElementParent,
                name:string, base = 'div') {

      this.$node = $parent.append(base);

      this.$node.classed(name, true);
      if(attr !== null) {
          this.$node.classed('attr-' + attr.name, true);
      }

      config.animator.push(this); // @see this.show()
      onDelete(this.$node, () => {
        config.animator.remove(this);
      });
    }

    setScaleFactor(dim:number, val:number) {
      this.scaleFactor[dim] = val;
    }

    hide() {
      this.$node.classed('hg-hidden', true);
      this.config.animator.remove(this);
    }

    show() {
      this.$node.classed('hg-hidden', false);
      this.config.animator.push(this);
    }

    fadeIn() {
      this.show();
    }

    fadeOut() {
      this.hide();
    }

    get isVisible() {
      return !this.$node.classed('hg-hidden'); //this.$node[0][0].className.indexOf('hg-hidden') === -1;
    }

    relayout(width:number, height:number):void {
      this.$node.style({height: height + 'px', width: width + 'px'});
      this.scale.range([0, width]);
    }

    get width() {
      return parseInt(this.$node.style('width'));
    }

    pos(x:number, y:number) {
      this.$node.style({top: y + 'px', left: x + 'px'});
    }

    normalize(value:number):number {
      var r = this.normalizer.normalize(value);
      if (isNaN(r) || r < 0) {
        r = 0;
      }
      return r;
    }

    layout(dt:number, now:number):any {
     return null;
    }

    update(dt:number, now:number, data:any) {
    }

  }

  export interface IRawValue {
      value: number;
      interpolate: boolean;
  }

  export function resolveRaw(ts: number, data: any[]): IRawValue {
    //linear interpolate the values
    var prev = data[0], l = data.length, v, value:IRawValue = {value: 0, interpolate: false};
    for (var i = 0; i < l; ++i) {
      v = data[i];
      if (v.index === ts) {
        value = {value: v.value, interpolate: false};
        break;
      }
      if (v.index > ts && prev.index < ts) {
        //linear interpolate between the last value and this one
        value = {value: d3.scale.linear().domain([prev.index, v.index]).range([prev.value, v.value])(ts), interpolate: true};
      }
      prev = v;
    }
    return value;
  }

  export class PVDADataAttributeVis extends PVDAAttributeVis implements IAnimateable, PVDInnerElement, PVDCachableElement {
    private wasAllZero = false;
    lastData = [];

    // store a finger print of the current data record and check the difference
    private dataCache = {
      length: 0,
      first: null,
      last: null
    };

    // manually invalidate the cache and allow drawing
    invalidateCache = false;

    /**
     * defines the data mode, either discrete/sampled values or the raw values
     * @type {string}
     */
    dataMode = 'discrete'; //continuous

    constructor($parent:D3.Selection, attr:PVDModels.IAttribute<number>,
                normalizer:INormalizer<number>,
                protected config:PVDHierarchyConfig,
                parent:PVDElementParent,
                name:string, base = 'div') {
      super($parent, attr, normalizer, config, parent, name, base);
    }

    private rebind(now:number, dt:number) {
      var d = this.config.dataRange(now, this.scale.range()[1]);
      this.scale.domain([d.zeroTime, d.widthTime]);
      now = d.now;

      var data, start = d.start, step = d.step, visibleData;

      if(this.dataMode === 'frequencies') {
        //skip if no values are there
        if (this.attr.areNoValuesThere(start, now, step, true) && this.wasAllZero) {
          return null;
        }

        data = this.attr.frequencies(start, now, step);

        //if all data are zero there is no need to update
        var allzero = data.every((d) => d === 0);

        if (allzero && this.wasAllZero) {
          return null;
        }

        this.wasAllZero = allzero;
        visibleData = data.slice(d.skip);

        console.log(data, visibleData);

      } else if(this.dataMode === 'discrete') {
        //skip if no values are there
        if (this.attr.areNoValuesThere(start, now, step, true) && this.wasAllZero) {
          return null;
        }
        data = this.attr.values(start, now, step, true);

        //if all data are zero there is no need to update
        var allzero = data.every((d) => d === 0);

        if (allzero && this.wasAllZero) {
          return null;
        }
        this.wasAllZero = allzero;
        visibleData = data.slice(d.skip);
        this.normalizer.adapt(data, dt);

      } else { //continuous mode
        data = this.attr.rawValues(start, now);
        if (data.length === 0 && this.wasAllZero) {
          return null;
        }
        this.wasAllZero = data.length === 0;
        visibleData = data;
        this.normalizer.adapt(data.map((d) => d.v), dt);
      }

      return {
        data: visibleData,
        start: d.skipStart,
        step: step
      };
    }

    dataAt(ts:number) {
      if (this.lastData.length === 0) {
        return [];
      }
      if (this.dataMode === 'discrete' || this.dataMode === 'frequencies') {
        var li = this.lastData.filter((v) => v.index === ts);
        return [
          {
            name: this.attr.name,
            value: d3.round(li.length > 0 ? li[0].value : 0, 3).toString()
          }
        ];
      } else {
        var raw = resolveRaw(ts, this.lastData),
            rounded = d3.round(raw.value ? raw.value : 0, 3).toString(),
            value = (raw.interpolate) ? '' + rounded + ' (interpolated)' : rounded;
        return [
          {
            name: this.attr.alias || this.attr.name,
            value: value
          }
        ];
      }
    }

    private rebindRest(data:number[], start:number, step:IStepper) {
      if (!data) {
        return null;
      }
      var d2 = data.map((v: any, i) => {
        var r;
        if(this.dataMode === 'frequencies') {
          r = {
            normalized: v,
            index: step.step(start,i),
            value: v
          }

        } else if (this.dataMode === 'discrete') {
          r = {
            normalized: this.normalize(v),
            index: step.step(start,i),
            value: v
          }
        } else {
          r = v;
          r.value = r.v;
          r.index = v.ts;
          r.normalized = this.normalize(r.value);
        }
        return r;
      });
      //console.log(start,d2.map(d => d.normalized));
      //key is the normalized time
      this.lastData = d2;
      return d2;
    }


    layout(dt:number, now:number):any {
      return this.rebind(now, dt);
    }

    update(dt:number, now:number, data:any) {
      if (!data) {
        return;
      }
      if (this.scaleFactor[0] <= 0 || this.scaleFactor[1] <= 0) {
        return;
      }
      data = this.rebindRest(data.data, data.start, data.step);
      if (data && this.isCacheInvalid(data)) {
        this.updateCacheFingerPrint(data);
        this.draw(dt, now, data);
      }
    }

    draw(dt:number, now:number, data:any[]) {

    }

    private isCacheInvalid(data) {
      if(data.length <= 0) { return false; }

      return this.invalidateCache
        || this.dataCache.length !== data.length
        || this.dataCache.first !== data[0].ts
        || this.dataCache.last !== data[data.length-1].ts;
    }

    private updateCacheFingerPrint(data) {
      this.invalidateCache = false;
      this.dataCache.length = data.length;
      if(data.length > 0) {
        this.dataCache.first = data[0].ts;
        this.dataCache.last = data[data.length-1].ts;
      }
    }
  }

  export class PVDASingleAttribute extends PVDADataAttributeVis {

    constructor($parent:D3.Selection, attr:PVDModels.IAttribute<number>,
                normalizer:INormalizer<number>,
                config:PVDHierarchyConfig,
                parent:PVDElementParent,
                name:string, private type:string = 'div') {
      super($parent, attr, normalizer, config, parent, name);
    }

    draw(dt:number, now:number, data:any[]) {
      var $r = this.$node.selectAll(this.type).data(data);
      this.drawIt($r, dt);
    }

    drawIt($r:D3.UpdateSelection, dt:number) {
      var enter = $r.enter().append(this.type);
      this.onEnter(enter);
      $r.exit().remove();
      //update static content
    }

    onEnter($r:D3.Selection) {

    }
  }
}
