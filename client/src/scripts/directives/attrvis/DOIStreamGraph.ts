/**
 * Created by Samuel Gratzl on 11.03.2015.
 */
import * as angular from 'angular';
import * as d3 from 'd3';
import * as $ from 'jquery';
import { PVDAAttributeVis, resolveRaw } from './AAttributeVis';
import { nextID, INormalizer } from '../VisUtils';
import { DOIAttribute } from '../../models/DOI';
import { PVDHierarchyConfig } from '../HierarchyConfig';
import { PVDElementParent } from '../HierarchyNode';
import { Node } from '../../models/Infrastructure';
import { ConstantAttribute } from '../../models/Models';
import { ApplicationConfiguration } from '../../services/ApplicationConfiguration';

'use strict';

export class PVDDOIStreamGraph extends PVDAAttributeVis {

  private _defaultConfig = {
    'heightScaleFactor': 6,
    'interpolate': 'linear',
    'selectable': true,
    'label': true,
    'labelSpace': 30,
    'labelContent': 'attrName', // nodeName || attrName,
    'doiLine': true,
    'zeroLine': true,
    'doiRange': null,
    'yAxis': false, //or the width
    'weights': true,
    'weightBrightnessShift': [-0.15, 2],
    'stackedColor': 'weight',
    'stackedWeightColor': ['#f1eef6', '#3587bc'],
    'colorMissingValue': '#E7E7E7',
    'missingValues': false,
    'marginTop': 6,
    'marginBottom': 6,
    'marginLeft': 5,
    'marginRight': 0
  };

  private _defConfig;

  private line = d3.svg.line(); // linear || basis
  private area = d3.svg.area();
  private yAxis;
  private scaleY = d3.scale.linear();

  private $missingValues;
  private $label;
  private $path;
  private $zeroLine;
  private $stream;
  private $yAxis;
  private $weightGradients;
  private gradientBaseId = nextID();
  private $stripePattern;
  private $stripeMask;

  private lastData = [];
  private lastDOIData = [];
  private brightness: d3.scale.Linear<any, any>;
  private weightShift: d3.scale.Linear<any, any>;

  constructor($parent: d3.Selection<any>, attr: DOIAttribute,
    normalizer: INormalizer<number>,
    config: PVDHierarchyConfig,
    private parent: PVDElementParent,
    defConfig: any) {
    super($parent, attr, normalizer, config, parent, 'doi streamgraph', 'svg');
    this.defConfig = defConfig; // override default config

    this.scaleFactor[1] = this.defConfig.heightScaleFactor;

    this.line
      .x((d: any) => { return this.scale(d.index); });
    this.area
      .x((d: any) => { return this.scale(d.index); });

    this.$weightGradients = this.$node.append('defs');

    this.$stream = this.$node.append('g');

    this.$label = this.$node.append('text')
      .classed('hg-hidden', !this.defConfig.label)
      .classed('label', true)
      //.style('text-anchor', 'end')
      .attr('dy', 3);

    this.$yAxis = this.$node.append('g')
      .attr('class', 'y axis')
      .classed('hg-hidden', this.defConfig.yAxis === 0);
    this.yAxis = d3.svg.axis().scale(this.scaleY).orient('left').ticks(5);

    this.$stripePattern = this.$weightGradients.append('pattern')
      .attr('id', 'pattern_' + this.gradientBaseId)
      .attr('patternUnits', 'userSpaceOnUse')
      .attr('patternTransform', 'rotate(45)')
      .attr({ width: '4', height: '4' });
    this.$stripePattern.append('rect').attr({ width: '1', height: '4', transform: 'translate(0,0)', fill: 'white' });

    this.$stripeMask = this.$weightGradients.append('mask')
      .attr('id', 'mask_' + this.gradientBaseId);
    this.$stripeMask.append('rect').attr({ width: '100%', height: '100%', x: '0', y: '0', fill: 'url(#' + this.$stripePattern.attr('id') + ')' });

    this.$missingValues = this.$node.append('g')
      .attr('class', 'missing-values')
      .classed('hg-hidden', !this.defConfig.missingValues);

    this.$path = this.$node.append('path')
      .classed('hg-hidden', !this.defConfig.doiLine)
      .classed('doi', true);

    this.$zeroLine = this.$node.append('line')
      .classed('hg-hidden', !this.defConfig.zeroLine)
      .classed('index', true);
  }

  set defConfig(value: any) {
    this._defConfig = angular.extend({}, this._defaultConfig, value);
    this.checkForChangedDefConfig();
  }

  get defConfig() {
    return this._defConfig;
  }

  private checkForChangedDefConfig() {
    this.defConfig.marginLeft *= ApplicationConfiguration.zoomFactor;
    this.defConfig.labelSpace *= ApplicationConfiguration.zoomFactor;
    this.defConfig.yAxis *= ApplicationConfiguration.zoomFactor;

    var node: Node = <Node>this.attr.parent;

    this.line.interpolate(this.defConfig.interpolate);
    this.area.interpolate(this.defConfig.interpolate);
    this.brightness = d3.scale.linear().domain([0, 1]).range(this.defConfig.stackedWeightColor);
    this.weightShift = d3.scale.linear().domain([0, 1]).range(this.defConfig.weightBrightnessShift);

    if (this.$path) {
      this.$path.classed('hg-hidden', !this.defConfig.doiLine);
    }
    if (this.$zeroLine) {
      this.$zeroLine.classed('hg-hidden', !this.defConfig.zeroLine);
    }

    if (this.$label) {
      this.$label.classed('hg-hidden', !this.defConfig.label);
    }
    if (this.$yAxis) {
      this.$yAxis.classed('hg-hidden', this.defConfig.yAxis === 0);
    }
    if (this.$missingValues) {
      this.$missingValues.classed('hg-hidden', !this.defConfig.missingValues);
    }

    if (this.defConfig.selectable) {
      this.$node.on('click', () => {
        (<Event>d3.event).stopPropagation();

        // exclude external and intermediate nodes
        if (node.has() || node === node.infrastructure.external) { return; }

        //multi selection
        var additive = (<any>d3.event).ctrlKey || (<any>d3.event).shiftKey;
        var is = this.config.selection.isSelected(node);
        if (is) {
          if (additive) {
            this.config.selection.removeFromSelection(node);
          } else {
            this.config.selection.clearSelection();
          }
        } else if (additive) {
          this.config.selection.addToSelection(node);
        } else {
          this.config.selection.selection = node;
        }
      });
    } else {
      this.$node.on('click', null);
    }
  }

  private get doi() {
    return <DOIAttribute>this.attr;
  }

  private get formula() {
    return this.doi.getFormula();
  }

  get colorer() {
    var c = this.defConfig.stackedColor;
    if (c === 'category') {
      return d3.scale.category10().domain(this.formula.attributes);
    } else if (c === 'weight') {
      return (d, w) => this.brightness(w);
    } else if (Array.isArray(c)) {
      return d3.scale.ordinal().range(c).domain(this.formula.attributes);
    }
    return d3.scale.category10().domain(this.formula.attributes);
  }

  private rebind(now: number, dt: number) {
    var d = this.config.dataRange(now, this.scale.range()[1]);
    this.scale.domain([d.zeroTime, d.widthTime]);
    now = d.now;

    var formula = this.formula;
    var components = this.formula.components;
    var attrs = this.doi.attrs;

    var data = [], start = d.start, step = formula.stepper;

    var that = this;
    var color: any = this.colorer;
    var pushData = (attr, i) => {
      if (!attr || attr.areNoValuesThere(start, now, step, false)) {
        return;
      }
      var c = components[i];
      data.push({
        isConstant: attr instanceof ConstantAttribute,
        attr: attr.name,
        name: (attr.alias || attr.name) + ' (' + d3.round(c.percentage, 1) + '%)',
        color: color(attr.name, c.weight),
        weight: c.weight,
        values: attr.rawValues(start, now).map((v) => {
          var t = c.f(v.v, formula.range);
          return {
            pos: t >= 0,
            v_pos: t >= 0 ? t : 0,
            v_neg: t < 0 ? t : 0,
            v: t, v0: v,
            ts: v.ts
          }
        })
      });
    };
    attrs.forEach(pushData);

    var doidata = this.attr.rawValues(start, now);

    if (data.length > 1) { //unify timestamps

      var elems = [],
        comp = data.filter((d) => !d.isConstant);
      if (comp.length > 0) {
        elems = comp[0].values.map((d) => d.ts);
      }
      var valid = d3.set();
      //find all timestamps where all the values are there
      elems.filter((ts) => data.every((di) => di.isConstant || di.values.some((dii) => dii.ts === ts))).forEach((ts) => valid.add(ts));
      //reduce to valid ts
      data.forEach((di) => {
        if (di.isConstant) {
          var ori = di.values[0];
          di.values = [];
          valid.forEach((ts) => di.values.push($.extend({}, ori, { ts: ts })));
        } else {
          di.values = di.values.filter((dii) => valid.has(dii.ts));
        }
      });
      //reduce to not empty attrs
      data = data.filter((di) => di.values.length > 0);
    }

    //update to stacked version
    //data = this.stack(data);
    //my stack
    for (var i = 1; i < data.length; ++i) {
      var prev = data[i - 1];
      var act = data[i];
      act.values.forEach((v, i) => {
        v.v_pos += prev.values[i].v_pos;
        v.v_neg += prev.values[i].v_neg;
        v.v = v.pos ? v.v_pos : v.v_neg;
      });
    }


    this.normalizer.adapt(doidata.map((v) => v.v), dt);

    return {
      start: d.skipStart,
      data: data,
      doi: doidata,
      step: step,
      time: [start, now]
    };
  }

  dataAt(ts: number) {
    var r = this.lastData.map((dist, i) => {
      var raw = resolveRaw(ts, dist.values),
        rounded = d3.round(raw.value ? raw.value : 0, 3).toString(),
        value = (raw.interpolate) ? '' + rounded + ' (interpolated)' : rounded;
      var l = dist.name;
      return {
        name: (i === this.lastData.length - 1) ? '&#9492;&nbsp;' + l : '&#9500;&nbsp;' + l, // use └ and ├
        value: value
      };
    });
    var doi = resolveRaw(ts, this.lastDOIData);
    r.unshift({ name: 'DOI', value: d3.round(doi.value, 3).toString() });
    return r;
  }

  private rebindRest(start: number, data: any[], doidata: any[], step: number) {
    var norm = (v) => {
      v.value = v.v;
      v.index = v.ts;
      v.normalized = this.normalize(v.value);
      return v;
    };
    var d2 = data.map((d) => {
      d.values = d.values.map(norm);
      return d;
    });
    var doi = doidata.map(norm);
    this.lastData = d2;
    this.lastDOIData = doidata;

    d2 = d2.reverse();
    //console.log(start,d2.map(d => d.n));
    //key is the normalized time
    return { data: d2, doi: doi };
  }

  layout(dt: number, now: number): any {
    //do everything till the normalization is needed
    return this.rebind(now, dt);
  }

  update(dt: number, now: number, layoutResult: any) {
    this.normalizer.adaptEnd();
    //do the rest
    var r = this.rebindRest(layoutResult.start, layoutResult.data, layoutResult.doi, layoutResult.step);
    this.draw(r.data, r.doi, dt, layoutResult.time, layoutResult.step);
  }

  private gradientId(weight: number) {
    return 'fill' + this.gradientBaseId + '_' + d3.round(weight, 2).toString().replace('.', '_');
  }
  private createWeightGradients(time: number[], dt: number) {
    var f = this.formula;
    //compute the number of different weights
    var s = d3.set(f.components.map((d) => d3.round(d.weight, 2).toString())).values().map((d) => +d);

    var $gradients = this.$weightGradients.selectAll('.gradient').data(s);
    $gradients.exit().remove();
    $gradients.enter().append('linearGradient').classed('gradient', true)
      .attr('gradientUnits', 'userSpaceOnUse')
      .attr({ x1: '0%', y1: '0%', x2: '100%', y2: '0%' });
    $gradients.attr('id', (w) => this.gradientId(w));

    var baseStops = (() => {
      var start = Math.max(time[0], f.windowStart(time[1]));//time[1]-f.window);
      var end = time[1];
      var alphan = 1 - f.alpha;
      var alpha = f.alpha;
      var per = 1 / (time[1] - time[0]);
      var alphas = [];
      for (var i = 0; end >= start; i++ , end = f.stepper.prev(end)) {
        alphas.push({
          offset: (end - time[0]) * per,
          shift: this.weightShift(alpha)
        });
        alpha = alpha * alphan;
      }
      if (start !== time[0]) {
        alphas.push({ offset: 0, shift: this.weightShift(0) });
      }
      //back to front
      alphas.reverse();
      return alphas;
    })();
    var toColor = (stop, w) => {
      var base = d3.hsl(this.brightness(w));
      base.l = Math.max(0, Math.min(1, base.l - stop.shift));
      return {
        offset: stop.offset,
        color: base.rgb()
      }
    };

    var $stops = $gradients.selectAll('stop').data((d) => baseStops.map((s) => toColor(s, d)));
    $stops.enter().append('stop');
    $stops.exit().remove();
    $stops
      .attr('offset', (d) => d.offset)
      .attr('stop-color', (d) => d.color);
  }

  private updateYScale(def: any, doi: any[], h: number) {
    var hmin = h - def.marginBottom;
    var hmax = def.marginTop;
    var y = this.scaleY.clamp(true).range([hmin, hmax]);
    if (def.doiRange === 'auto') {
      return y.domain(d3.extent(doi, (d) => d.value));
    } else if (def.doiRange === 'border') {
      return y.range(this.config.changeBorder.vertical.mappedPositions([hmin, hmax])).domain(this.config.changeBorder.vertical.activities);
    } else if (Array.isArray(def.doiRange)) {
      return y.domain(def.doiRange);
    } else {
      return y.domain(this.formula.range);
    }
  }

  draw(data: any[], doi: any[], dt: number, time: number[], step: number) {
    if (data.length === 0 && doi.length === 0) {
      this.$path.datum([]).attr('d', '');
      this.$stream.selectAll('.component').remove();
      return;
    }

    var def = this.defConfig;

    // add left offset
    this.scale.range([def.marginLeft + def.labelSpace + def.yAxis, this.width - def.marginRight]);

    var h = parseInt(this.$node.style('height'));

    var y = this.updateYScale(def, doi, h);
    this.line.y((d: any) => y(d.value));
    this.area.y0((d: any) => y(d.v_neg));
    this.area.y1((d: any) => y(d.v_pos));

    //console.log(this.attr.name, data);
    var zeroValue = 0;

    var x1 = this.scale.range()[0], x2 = this.scale.range()[1],
      y1 = y(zeroValue), y2 = y(zeroValue);

    if (def.weights) {
      this.createWeightGradients(time, step);
    }

    if (def.zeroLine) {
      this.$zeroLine
        .attr('x1', x1)
        .attr('y1', y1)
        .attr('x2', x2)
        .attr('y2', y2);
    }

    if (def.label) {
      this.$label.text((def.labelContent === 'nodeName') ? this.attr.parent.name : (this.attr.alias === null) ? this.attr.name : this.attr.alias);

      if (def.zeroLine) {
        this.$label.attr('transform', 'translate(' + (x1 - def.marginLeft - def.yAxis) + ',' + y1 + ')');
      } else {
        this.$label.attr('transform', 'translate(' + (x1 - def.marginLeft - def.yAxis) + ',' + 4 + ')');
      }
    }

    if (def.yAxis > 0) {
      this.$yAxis.attr('transform', 'translate(' + (x1 - def.marginLeft) + ',0)').call(this.yAxis);
    }

    if (def.missingValues) {
      var stepper = this.config.animator.stepper,
        firstTs = this.scale.domain()[0],
        lastTs = this.scale.domain()[1],
        ts = [],
        missVal = [];

      if (data[0] !== undefined) {
        ts = data[0].values.map((d) => +d.index);
      }

      //console.log(this.attr.name, 'TS', ts);

      var wasMissing = false;
      for (var i = 0; stepper.step(firstTs, i + 1) <= lastTs; i++) {
        //console.log(this.attr.name, stepper.step(firstTs, i), ts.indexOf(stepper.step(firstTs, i)));
        if (ts.indexOf(stepper.step(firstTs, i)) === -1) {
          // if the last one was not missing start the block from that point
          //if(wasMissing === false && firstTs !== stepper.step(firstTs, i)) {
          //missVal.push({'start': stepper.step(firstTs, i-1), 'end': stepper.step(firstTs, i)});
          //console.log(this.attr.name, 'missing value', i, missVal[missVal.length - 1]);
          //}
          // check if the blocks are connected, then modify the last entry
          if (missVal.length > 0 && missVal[missVal.length - 1].end === stepper.step(firstTs, i)) {
            missVal[missVal.length - 1].end = stepper.step(firstTs, i + 1);
          } else {
            missVal.push({ 'start': stepper.step(firstTs, i), 'end': stepper.step(firstTs, i + 1) });
          }
          //console.log(this.attr.name, 'missing value', i, missVal[missVal.length - 1]);
          wasMissing = true;
        } else {
          wasMissing = false;
        }
      }

      var yExtent = d3.extent(this.scaleY.range());
      var $rects = this.$missingValues.selectAll('rect').data(missVal);

      $rects.enter()
        .append('rect')
        .style('fill', def.colorMissingValue)
        .style('mask', 'url(#' + this.$stripeMask.attr('id') + ')');

      $rects.attr({
        'x': (d) => { return this.scale(d.start); },
        'y': d3.min(yExtent),
        'width': (d) => { return d3.max([(this.scale(d.end) - this.scale(d.start)), 0]); },
        'height': d3.max(yExtent) - def.marginBottom
      });

      $rects.exit().remove();
    }

    var $r = this.$stream.selectAll('.component').data(data);

    var $r_enter = $r.enter()
      .append('g').classed('component', true);
    $r_enter.append('path').classed('component-border', true);
    $r_enter.append('path').classed('component-fill', true).append('title');
    $r.exit()
      .remove();
    $r.select('path.component-border')
      .attr('d', (d) => this.area(d.values));
    //class by distance
    $r.select('path.component-fill')
      .attr('d', (d) => this.area(d.values))
      .style('stroke', (d) => d.color)
      .style('fill', (d) => def.weights ? 'url(#' + this.gradientId(d.weight) + ')' : d.color)
      .select('title').text((d) => d.name);

    if (def.doiLine) {
      this.$path.datum(doi).attr('d', this.line);
    }
  }

}
