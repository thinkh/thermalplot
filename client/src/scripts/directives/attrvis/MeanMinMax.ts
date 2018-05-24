/**
 * Created by Samuel Gratzl on 18.09.2015.
 */
import * as angular from 'angular';
import * as d3 from 'd3';
import { IColorer, defaultColorer, INormalizer } from '../VisUtils';
import { PVDADataAttributeVis } from './AAttributeVis';
import { IAttribute } from '../../models/Models';
import { PVDHierarchyConfig } from '../HierarchyConfig';
import { PVDElementParent } from '../HierarchyNode';

'use strict';

export class PVDMeanMinMax extends PVDADataAttributeVis {
  colorer: IColorer<number> = defaultColorer;

  private static _defaultConfig = {
    'marginLeft': 5,
    'yAxis': 0, //or the width
    'indexNormalized': null, //[-1, +1],
    'marginRight': 0,
    'marginTop': 6,
    'marginBottom': 6,
  };
  private _defConfig = PVDMeanMinMax._defaultConfig;

  private scaleY = d3.scale.linear();

  private $yAxis;
  private yAxis;

  private line = d3.svg.line()
    .interpolate('step') // linear || basis
    .x((d: any) => this.scale(d.ts))
    .y((d: any) => this.scaleY(d.hist.mean));
  private $line: d3.Selection<any>;

  private area = d3.svg.area()
    .interpolate('step') // linear || basis
    .x((d: any) => this.scale(d.ts))
    .y0((d: any) => this.scaleY(d.hist.min))
    .y1((d: any) => this.scaleY(d.hist.max));
  private $area: d3.Selection<any>;

  constructor($parent: d3.Selection<any>, attr: IAttribute<number>, normalizer: INormalizer<number>, config: PVDHierarchyConfig, parent: PVDElementParent, defConfig: any) {
    super($parent, attr, normalizer, config, parent, 'streamgraph meanminmax', 'svg');
    this.defConfig = defConfig; // override default config

    this.scaleFactor[1] = 2;
    this.dataMode = 'continuous';

    this.scale.range([this._defConfig.marginLeft + this._defConfig.yAxis, this.width - this._defConfig.marginRight]);

    this.$yAxis = this.$node.append('g')
      .attr('class', 'y axis')
      .classed('hg-hidden', this.defConfig.yAxis === 0);
    this.yAxis = d3.svg.axis().scale(this.scaleY).orient('left').tickFormat((d) => d3.format('s')(d)).ticks(2);

    this.$area = this.$node.append('path').classed('range', true);
    this.$line = this.$node.append('path').classed('mean', true);
  }

  layout(dt: number, now: number): any {
    return super.layout(dt, now);
  }

  draw(dt: number, now: number, data: any[]) {
    if (data.length === 0) {
      this.$line.datum([]).attr('d', '');
      this.$area.datum([]).attr('d', '');
    }
    var def = this._defConfig;

    var h = this.$node.style('height');
    var yDomain;
    if (typeof def.indexNormalized === 'boolean' && def.indexNormalized) {
      yDomain = [(<any>this.attr).min, (<any>this.attr).max];
    } else if (Array.isArray(def.indexNormalized)) {
      yDomain = def.indexNormalized;
    } else {
      yDomain = [d3.min(data, (d) => d.hist.min), d3.max(data, (d) => d.hist.max)];
    }
    if (yDomain[0] === yDomain[1]) {
      //no real range fake it by +/- x 20%
      var tmp = yDomain[0];
      yDomain[0] = tmp * 0.8;
      yDomain[1] = tmp * 1.2;
    }

    this.scaleY
      .domain(yDomain).clamp(true)
      .range([parseInt(h) - def.marginBottom, def.marginTop]);

    this.scale
      .range([def.marginLeft + def.yAxis, this.width - def.marginRight]);

    var x1 = this.scale.range()[0];

    if (def.yAxis > 0) {
      this.$yAxis.attr('transform', 'translate(' + (x1 - def.marginLeft) + ',0)').call(this.yAxis);
    }

    this.$area.datum(data).attr('d', this.area);
    this.$line.datum(data).attr('d', this.line);
  }

  set defConfig(value: any) {
    this._defConfig = angular.extend({}, PVDMeanMinMax._defaultConfig, value);
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

export class PVDCategoryStack extends PVDADataAttributeVis {
  colorer: IColorer<number> = defaultColorer;

  private static _defaultConfig = {
    marginLeft: 5,
    'yAxis': 0, //or the width
    'indexNormalized': null, //[-1, +1],
    marginRight: 0,
    'marginTop': 6,
    'marginBottom': 6,
  };
  private _defConfig = PVDCategoryStack._defaultConfig;

  private scaleY = d3.scale.linear();

  private $yAxis;
  private yAxis;

  private area = d3.svg.area()
    .interpolate('step') // linear || basis
    .x((d: any) => this.scale(d.ts))
    .y0((d: any) => this.scaleY(d.min))
    .y1((d: any) => this.scaleY(d.max));

  constructor($parent: d3.Selection<any>, attr: IAttribute<number>, normalizer: INormalizer<number>, config: PVDHierarchyConfig, parent: PVDElementParent, defConfig: any) {
    super($parent, attr, normalizer, config, parent, 'streamgraph categorystack', 'svg');
    this.defConfig = defConfig; // override default config

    this.scaleFactor[1] = 2;
    this.dataMode = 'continuous';

    this.scale.range([this._defConfig.marginLeft + this._defConfig.yAxis, this.width - this._defConfig.marginRight]);

    this.$yAxis = this.$node.append('g')
      .attr('class', 'y axis')
      .classed('hg-hidden', this.defConfig.yAxis === 0);
    this.yAxis = d3.svg.axis().scale(this.scaleY).orient('left').tickFormat((d) => d3.format('s')(d)).ticks(2);
    this.$node.append('g').classed('paths', true);
  }

  layout(dt: number, now: number): any {
    return super.layout(dt, now);
  }

  private createLayers(data: any[]): { key: string; value: { ts: number; min: number; max: number; }[] }[] {

    var cats = d3.set();
    data.forEach((d) => {
      Object.keys(d.hist).forEach((k) => cats.add(k));
    });
    var layers = {};
    cats.forEach((cat) => {
      layers[cat] = [];
    });

    data.forEach((d) => {
      var ts = d.ts,
        hist = d.hist,
        acc = 0;
      cats.forEach((cat) => {
        var v = (hist[cat] || 0);
        layers[cat].push({
          ts: ts,
          min: acc,
          max: acc + v
        });
        acc += v;
      });
    });
    return d3.entries(layers);
  }

  draw(dt: number, now: number, data: any[]) {
    if (data.length === 0) {
      this.$node.selectAll('path').remove();
    }
    var def = this._defConfig;

    var h = this.$node.style('height');

    var layers = this.createLayers(data);

    var yDomain;
    if (typeof def.indexNormalized === 'boolean' && def.indexNormalized) {
      yDomain = [(<any>this.attr).min, (<any>this.attr).max];
    } else if (Array.isArray(def.indexNormalized)) {
      yDomain = def.indexNormalized;
    } else {
      yDomain = [d3.min(layers[0].value, (d) => d.min), d3.max(layers[layers.length - 1].value, (d) => d.max)];
    }
    if (yDomain[0] === yDomain[1]) {
      //no real range fake it by +/- x 20%
      var tmp = yDomain[0];
      yDomain[0] = tmp * 0.8;
      yDomain[1] = tmp * 1.2;
    }

    this.scaleY
      .domain(yDomain).clamp(true)
      .range([parseInt(h) - def.marginBottom, def.marginTop]);

    this.scale
      .range([def.marginLeft + def.yAxis, this.width - def.marginRight]);

    var x1 = this.scale.range()[0];

    if (def.yAxis > 0) {
      this.$yAxis.attr('transform', 'translate(' + (x1 - def.marginLeft) + ',0)').call(this.yAxis);
    }

    var $paths = this.$node.select('g.paths').selectAll('path').data(layers);
    $paths.enter().append('path');
    $paths.attr({
      title: (d) => d.key,
      d: (d: any) => this.area(d.value),
      'class': (d, i) => 'cat' + i + ' ' + d.key
    });
    $paths.exit().remove();

  }

  set defConfig(value: any) {
    this._defConfig = angular.extend({}, PVDCategoryStack._defaultConfig, value);
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
