/**
 * Created by Holger Stitz on 18.08.2014.
 */
import * as angular from 'angular';
import * as d3 from 'd3';
import { PVDASingleAttribute, PVDADataAttributeVis, resolveRaw } from './AAttributeVis';
import { defaultColorer, IColorer, INormalizer, nextID } from '../VisUtils';
import { IAttribute } from '../../models/Models';
import { PVDHierarchyConfig } from '../HierarchyConfig';
import { PVDElementParent } from '../HierarchyNode';
import { TimedValue } from '../../models/Timed';
import { IStepper } from '../../services/Animator';

'use strict';

export class PVDHeatmap extends PVDASingleAttribute {
  colorer: IColorer<number> = defaultColorer;

  constructor($parent: d3.Selection<any>, attr: IAttribute<number>, normalizer: INormalizer<number>, config: PVDHierarchyConfig, parent: PVDElementParent, public defConfig: any) {
    super($parent, attr, normalizer, config, parent, 'heatmap');
  }

  drawIt($r: d3.selection.Update<any>, dt: number) {
    super.drawIt($r, dt);
    //update static content
    var binWidth = this.scale(this.scale.domain()[0] + this.config.binWidth());
    $r.style({
      left: (v) => this.scale(v.index) + 'px',
      width: binWidth + 'px'
    });
    $r.style('background-color', (v) => this.colorer(v.normalized).rgb.toString(), 'important');
    //$r.attr("title",(v) => v.value);
  }
}

export class PVDGradientHeatmap extends PVDADataAttributeVis {
  colorer: IColorer<number> = defaultColorer;

  private static _defaultConfig = {
    marginLeft: 0,
    marginRight: 0
  };
  private _defConfig = PVDGradientHeatmap._defaultConfig;

  private time: d3.scale.Linear<any, any>;

  private $gradient: d3.Selection<any>;

  constructor($parent: d3.Selection<any>, attr: IAttribute<number>, normalizer: INormalizer<number>, config: PVDHierarchyConfig, parent: PVDElementParent, defConfig: any) {
    super($parent, attr, normalizer, config, parent, 'gradientheatmap', 'svg');
    this.defConfig = defConfig; // override default config

    this.dataMode = 'continuous';
    this.time = d3.scale.linear();

    var id = 'gradientheatmap' + nextID();
    this.$gradient = this.$node.append('defs').append('linearGradient').attr({
      id: id,
      x1: "0%",
      y1: "0%",
      x2: "100%",
      y2: "0%"
    });
    this.$node.append('rect').attr('fill', 'url(#' + id + ')');
  }

  layout(dt: number, now: number): any {

    return super.layout(dt, now);
  }

  private convertToGradientData(data: any[]) {
    if (data == null) {
      return [];
    }
    var r = [];
    data.forEach((v: TimedValue<number>) => {
      var offset = this.time(v.ts),
        color = this.colorer((<any>v).normalized);
      r.push({
        offset: offset,
        color: color
      });
      var offset2 = this.time(v.ts + v.duration);
      if (offset2 > (offset + 1)) {
        r.push({
          offset: offset2,
          color: color
        });
      }
    });
    return r;
  }

  draw(dt: number, now: number, data: any[]) {
    //if (!data) {
    //  return;
    //}
    var s = this.config.selection.getSelection(now); //this.config.dataRange(now, this.config.gridWidth);

    this.time
      .domain([s.start, s.point + 1])
      .range([0, 100]);
    this.$node.select('rect').attr({
      width: this.width,
      height: this.$node.style('height')
    });
    //<stop offset="0%" style="stop-color:rgb(255,255,0);stop-opacity:1" />
    var gradientData = this.convertToGradientData(data);
    var $stops = this.$gradient.selectAll('stop').data(gradientData);
    $stops.enter().append('stop');
    $stops
      .attr('offset', (d) => d.offset + '%')
      .style('stop-color', (d) => d.color);
    $stops.exit().remove();
  }

  set defConfig(value: any) {
    this._defConfig = angular.extend({}, PVDGradientHeatmap._defaultConfig, value);
    this.checkForChangedDefConfig();
    this.invalidateCache = true;
  }

  get defConfig() {
    return this._defConfig;
  }

  private checkForChangedDefConfig() {
    //var node:Node = <Node>this.attr.parent;
  }

}

export class PVDCompositeAttributeHeatmap extends PVDADataAttributeVis {

  private _defaultConfig = {
    'tooltipText': 'configure it!',
    'groupBy': [] // {"attr":"attribute name", "dir":"asc"} // asc || desc
  };

  private _defConfig;

  constructor($parent: d3.Selection<any>, attr: IAttribute<number>,
    normalizer: INormalizer<number>,
    config: PVDHierarchyConfig,
    private parent: PVDElementParent,
    defConfig: any) {
    super($parent, attr, normalizer, config, parent, 'composite heatmap', 'div');

    this.scaleFactor = [1, 3];
    this.dataMode = 'discrete';

    this.defConfig = defConfig; // override default config
  }

  set defConfig(value: any) {
    this._defConfig = angular.extend({}, this._defaultConfig, value);
  }

  get defConfig() {
    return this._defConfig;
  }

  private getTemplateVars(str) {
    var results = [], re = /{([^}]+)}/g, text;
    while (text = re.exec(str)) {
      results.push(text[1]);
    }
    return results;
  }

  dataAt(ts: number) {
    if (this.lastData.length === 0) {
      return [];
    }
    if (this.dataMode === 'discrete') {
      var r = [],
        templateVars = this.getTemplateVars(this.defConfig.tooltipText),
        li: any = this.lastData.filter((v) => v.index === ts);

      if (li.length === 0 || (<any>li[0]).count === 0) {
        return r;
      }

      li = (<any>li[0]);
      //console.log(li, this.defConfig.tooltipText);

      if (this.defConfig.groupBy.length > 0) {
        // format data in d3 format to use d3.nest()
        var d3data = [], keys = Object.keys(li.value);

        if (li.value[keys[0]] === null || li.value[keys[0]].length <= 0) {
          return r;
        }

        if (typeof li.value[keys[0]] === 'string') {
          keys.forEach(key => {
            d3data[0] = d3data[0] || {};
            d3data[0][key] = li.value[key];
          });

        } else {
          for (var i = 0, len = li.value[keys[0]].length; i < len; i++) {
            keys.forEach(key => {
              if (li.value[key] !== null && li.value[key].length > 0) {
                d3data[i] = d3data[i] || {};
                d3data[i][key] = li.value[key][i];
              }
            });
          }
        }

        if (d3data.length === 0) {
          return r;
        }

        var d3nest: d3.Nest<any> = d3.nest();
        this.defConfig.groupBy.forEach(function (s) {
          d3nest = d3nest.key(function (d) { return d[s.attr]; });
          switch (s.dir.toLowerCase()) {
            case 'desc': d3nest = d3nest.sortKeys(d3.descending); break;
            case 'asc': d3nest = d3nest.sortKeys(d3.ascending); break;
          }
        });

        var data = d3nest.rollup(function (d) {
          var r = angular.extend({}, d[0]); // TODO assumes that all objects in array "d" are the same
          r.count = d.length; // add count attr to obj
          return r;
        })
          .entries(d3data);
        //console.log(JSON.stringify(data));

        this.defConfig.groupBy.forEach(function (s) {
          data = data.map((d) => { return d.values; });
          data = [].concat.apply([], data);
        });
        //console.log(JSON.stringify(data));

        for (i = 0, len = data.length; i < len; i++) {
          var v = this.defConfig.tooltipText;
          templateVars.forEach((tv) => {
            v = v.replace('{' + tv + '}', data[i][tv]);
          });
          r.push({
            name: (i == 0) ? this.attr.name : '',
            value: v
          });
        }

      } else {
        for (i = 0, len = li.count; i < len; i++) {
          var v = this.defConfig.tooltipText;
          templateVars.forEach((tv) => {
            switch (tv) {
              case 'count':
                v = v.replace('{' + tv + '}', li.count);
                break;
              default:
                v = v.replace('{' + tv + '}', ((typeof li.value[tv] === 'string') ? li.value[tv] : li.value[tv][i]));
                break;
            }
          });
          r.push({
            name: (i == 0) ? this.attr.name : '',
            value: v
          });
        }
      }

      return r;
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

  private rebind2(now: number, dt: number) {
    var d = this.config.dataRange(now, this.scale.range()[1]);
    this.scale.domain([d.zeroTime, d.widthTime]);
    now = d.now;
    return {
      data: this.attr.values(d.start, now, d.step, true),
      frequencies: this.attr.frequencies(d.start, now, d.step),
      start: d.skipStart,
      step: d.step
    };
  }

  private rebindRest2(data: any[], frequencies: number[], start: number, step: IStepper) {
    if (!data) {
      return null;
    }
    var d2 = data.map((v: any, i) => {
      var r;
      if (this.dataMode === 'discrete') {
        r = {
          normalized: this.normalize(v),
          index: step.step(start, i),
          count: frequencies[i],
          value: v
        }
      } else {
        r = v;
        r.value = r.v;
        r.count = frequencies[i];
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

  layout(dt: number, now: number): any {
    return this.rebind2(now, dt);
  }

  update(dt: number, now: number, data: any) {
    if (!data) {
      return;
    }
    if (this.scaleFactor[0] <= 0 || this.scaleFactor[1] <= 0) {
      return;
    }
    data = this.rebindRest2(data.data, data.frequencies, data.start, data.step);
    if (data) {
      this.draw(dt, now, data);
    }
  }

  draw(dt: number, now: number, data: any[]) {
    var $r = this.$node.selectAll('div').data(data);
    $r.enter().append('div');
    $r.exit().remove();
    //update static content
    var binWidth = this.scale(this.scale.domain()[0] + this.config.binWidth());
    $r.style({
      'text-align': 'center',
      'left': (v) => this.scale(v.index) + 'px',
      'width': binWidth + 'px'
    });
    //$r.style('background-color', (v) => this.colorer(v.normalized), 'important');
    $r.text((v) => v.count);
  }
}
