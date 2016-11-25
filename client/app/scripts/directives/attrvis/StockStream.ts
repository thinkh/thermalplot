/**
 * Created by Samuel Gratzl on 11.03.2015.
 */
/// <reference path='../../../../tsd.d.ts' />
/*global d3*/
'use strict';

module PVDVisualizations {
  export class PVDStockStream extends PVDADataAttributeVis {

    private _defaultConfig = {
      'dataMode': 'continuous', // discrete, continuous, frequencies
      'interpolate': 'linear',
      'indexNormalized': null, //[-1, +1],
      'indexValue': -1, // 0 || other
      'isAnchorPoint': false,
      'indexPoint': true,
      'indexLine': true,
      'chartLine': true,
      'selectable': true,
      'colorPos': '#259b24',
      'colorNeg': '#e51c23',
      'colorMissingValue': '#E7E7E7',
      'yAxis' : 0, //or the width
      'label': true,
      'labelSpace': 30,
      'labelContent': 'nodeName', // nodeName || attrName
      'labelVertPos': 'indexLine', // indexLine || center
      'missingValues': false,
      'invertValues': undefined, // undefined (= use DOI setting) || true || false
      'marginTop': 6,
      'marginBottom': 6,
      'marginLeft': 5,
      'marginRight': 0
    };

    private _defConfig;

    private gradientStops = [
        {'offset': 0, 'color': this._defaultConfig.colorPos},
        {'offset': 0.5, 'color': this._defaultConfig.colorPos},
        {'offset': 0.5, 'color': this._defaultConfig.colorNeg},
        {'offset': 1.0, 'color': this._defaultConfig.colorNeg}
    ];

    private line = d3.svg.line(); // linear || basis
    private scaleY = d3.scale.linear();

    private $missingValues;
    private $label;
    private $labelFO; // foreignObject
    private $path;
    private $indexLine;
    private $indexPoint;
    private $yAxis;
    private yAxis;
    private $fillGradientStops;
    private $strokeGradientStops;
    private $stripePattern;
    private $stripeMask;

    constructor($parent:D3.Selection, attr:PVDModels.IAttribute<number>,
                normalizer:INormalizer<number>,
                config:PVDHierarchyConfig,
                private parent: PVDElementParent,
                defConfig:any) {
      super($parent, attr, normalizer, config, parent, 'stock streamgraph', 'svg');
      this.defConfig = defConfig; // override default config

      this.scaleFactor[1] = 2;
      this.dataMode = this.defConfig.dataMode;

      // add left offset
      this.scale.range([this.defConfig.marginLeft + this.defConfig.labelSpace + this.defConfig.yAxis, this.width - this.defConfig.marginRight]);

      var node:PVDModels.Node = <PVDModels.Node>this.attr.parent;
      var defID = nextID();

      var $defs = this.$node.append('defs');

      this.$strokeGradientStops = $defs.append('linearGradient')
        .attr('id', 'stroke_' + defID)
        .attr('gradientUnits', 'userSpaceOnUse')
        .attr({x1: '0%', y1: '0%', x2: '0%', y2: '100%'})
        .selectAll('stop')
        .data(this.gradientStops)
        .enter().append('stop')
        .attr('offset', (d) => d.offset)
        //.attr('stop-color', '#fff');
        .attr('stop-color', (d) => d.color);

      this.$fillGradientStops = $defs.append('linearGradient')
        .attr('id', 'fill_' + defID)
        .attr('gradientUnits', 'userSpaceOnUse')
        .attr({x1: '0%', y1: '0%', x2: '0%', y2: '100%'})
        .selectAll('stop')
        .data(this.gradientStops)
        .enter().append('stop')
        .attr('offset', (d) => d.offset)
        .attr('stop-color', (d) => d.color)
        .attr('stop-opacity', 0.3);

      this.$stripePattern = $defs.append('pattern')
        .attr('id', 'pattern_' + defID)
        .attr('patternUnits', 'userSpaceOnUse')
        .attr('patternTransform', 'rotate(45)')
        .attr({width: '4', height: '4'});
      this.$stripePattern.append('rect').attr({width: '1', height: '4', transform:'translate(0,0)', fill:'white'});

      this.$stripeMask = $defs.append('mask')
        .attr('id', 'mask_' + defID);
      this.$stripeMask.append('rect').attr({width: '100%', height: '100%', x:'0', y:'0', fill:'url(#' + this.$stripePattern.attr('id') + ')'});

      this.$missingValues =  this.$node.append('g')
        .attr('class','missing-values')
        .classed('hg-hidden', !this.defConfig.missingValues);

      this.$yAxis = this.$node.append('g')
        .attr('class','y axis')
        .classed('hg-hidden', this.defConfig.yAxis===0);
      this.yAxis = d3.svg.axis().scale(this.scaleY).orient('left').tickFormat((d) => d3.format('s')(d)).ticks(2);

      this.$path = this.$node.append('path')
        .classed('hg-hidden', !this.defConfig.chartLine)
        .style('stroke', 'url(#stroke_' + defID + ')')
        .style('fill', 'url(#fill_' + defID + ')');

      this.$indexLine = this.$node.append('line')
        .classed('hg-hidden', !this.defConfig.indexLine)
        .classed('index', true);

      this.$indexPoint = this.$node.append('circle')
        .classed('hg-hidden', !this.defConfig.indexPoint)
        .classed('index', true)
        .attr('r', 3 * ApplicationConfiguration.zoomFactor)
        .attr('cx', this.scale.range()[0])
        .attr('cy', 4 * ApplicationConfiguration.zoomFactor)
        .style('fill', node.color);

      this.$labelFO = this.$node.append('foreignObject')
        .attr('class', 'foreignObject')
        .attr('transform', 'translate(' + this.defConfig.labelSpace + ',' + 4 + ')')
        .classed('hg-hidden', !this.defConfig.label);
      this.$label = this.$labelFO.append('xhtml:body')
        .attr('class', 'hg-labelbody')
        //.append('div')
        //.classed('label', true)
        .html((this.defConfig.labelContent === 'nodeName') ? this.attr.parent.name : (this.attr.alias === null) ? this.attr.name : this.attr.alias);
    }

    set defConfig(value:any) {
      this._defConfig = angular.extend({}, this._defaultConfig, value);
      this.checkForChangedDefConfig();
      this.invalidateCache = true;
    }

    get defConfig() {
      return this._defConfig;
    }

    private checkForChangedDefConfig() {
      this.defConfig.marginLeft *= ApplicationConfiguration.zoomFactor;
      this.defConfig.labelSpace *= ApplicationConfiguration.zoomFactor;
      this.defConfig.yAxis *= ApplicationConfiguration.zoomFactor;

      var node:PVDModels.Node = <PVDModels.Node>this.attr.parent;
      this.line.interpolate(this.defConfig.interpolate)
        .x((d) => { return this.scale(d.index); })
        .y((d) => { return this.scaleY(d.value); });

      this.gradientStops[0].color = this.gradientStops[1].color = this.defConfig.colorPos;
      this.gradientStops[2].color = this.gradientStops[3].color = this.defConfig.colorNeg;

      if(this.$path) {
        this.$path.classed('hg-hidden', !this.defConfig.chartLine);
      }
      if(this.$indexLine) {
        this.$indexLine.classed('hg-hidden', !this.defConfig.indexLine);
      }
      if(this.$indexPoint) {
        this.$indexPoint.classed('hg-hidden', !this.defConfig.indexPoint);
      }
      if(this.$label) {
        this.$labelFO.classed('hg-hidden', !this.defConfig.label);
      }
      if(this.$yAxis) {
        this.$yAxis.classed('hg-hidden', this.defConfig.yAxis===0 );
      }
      if(this.$missingValues) {
        this.$missingValues.classed('hg-hidden', !this.defConfig.missingValues);
      }

      if(this.defConfig.selectable) {
        this.$node.on('click', () => {
          d3.event.stopPropagation();

          // exclude external and intermediate nodes
          if(node.has() || node === node.infrastructure.external) { return; }

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

    draw(dt:number, now:number, data: any[]) {
      if (data.length === 0) {
        this.$path.datum([]).attr('d', '');
        return;
      }
      var def = this.defConfig;

      var h = this.$node.style('height');
      var indexValue, yDomain;
      var d = this.attr.floor(this.config.selection.indexPoint);
      if(def.indexValue === 0) {
        indexValue = 0;
      } else {
        indexValue = (d) ? d.v : data[0].value;
      }

      if (typeof def.indexNormalized === 'boolean' && def.indexNormalized) {
        yDomain = [(<any>this.attr).min, (<any>this.attr).max];
      } else if (Array.isArray(def.indexNormalized)) {
        yDomain = def.indexNormalized;
      } else {
        yDomain = d3.extent(data, (d) => d.value);
      }
      if (yDomain[0] === yDomain[1]) {
        //no real range fake it by +/- x 20%
        var tmp = yDomain[0];
        yDomain[0] = tmp * 0.8;
        yDomain[1] = tmp * 1.2;
      }
      yDomain = [Math.min(indexValue,yDomain[0]),Math.max(indexValue,yDomain[1])];

      // invert domain (scale) according to attribute (and DoI configuration in editor)
      if(def.invert !== undefined && def.invert === true &&
         (<any>this.attr).invert !== undefined && (<any>this.attr).invert === true) {
        var tmp = yDomain[1];
        yDomain[1] = yDomain[0];
        yDomain[0] = tmp;
      }

      this.scaleY
        .domain(yDomain).clamp(true)
        .range([parseInt(h) - def.marginBottom, def.marginTop]);

      // add left offset
      this.scale.range([def.marginLeft + def.labelSpace + def.yAxis, this.width - def.marginRight]);

      //console.log(this.attr.name, data);

      var x1 = this.scale.range()[0], x2 = this.scale.range()[1],
          y1 = this.scaleY(indexValue), y2 = this.scaleY(indexValue);

      if(this.defConfig.indexLine) {
        this.$indexLine
          .attr('x1', x1)
          .attr('y1', y1)
          .attr('x2', x2)
          .attr('y2', y2);
      }

      // reset anchor point
      this.parent.anchorPoint([]);

      if(def.indexPoint) {
        var xIP = x1, yIP = 4 * ApplicationConfiguration.zoomFactor;
        if(def.indexLine) {
          yIP = y1;
        }
        this.$indexPoint
          .style('fill', (<PVDModels.Node>this.attr.parent).color)
          .attr('cx', xIP)
          .attr('cy', yIP);

        if(def.isAnchorPoint) {
          this.parent.anchorPoint([xIP, yIP]);
        }
      }

      if(def.label) {
        this.$label.html((def.labelContent === 'nodeName') ? this.attr.parent.name : (this.attr.alias === null) ? this.attr.name : this.attr.alias);

        this.$labelFO.attr('width', (x1 - def.marginLeft - def.yAxis)); // set width first to determain height

        var lh = parseInt(this.$label.style('height'));
        if(isNaN(lh)) { lh = 15; }

        this.$labelFO.attr('height', lh);

        // center at node height
        if(def.labelVertPos === 'center') {
          if(def.indexLine) {
            this.$labelFO.attr('transform', 'translate(0,' + ((0.5*parseInt(h)) - (0.5*lh)) + ')');
          } else {
            this.$labelFO.attr('transform', 'translate(0,' + (-4 * ApplicationConfiguration.zoomFactor) + ')');
          }
        } else {
          if(def.indexLine) {
            this.$labelFO.attr('transform', 'translate(0,' + (y1 - (0.5*lh)) + ')');
          } else {
            this.$labelFO.attr('transform', 'translate(0,' + (-4 * ApplicationConfiguration.zoomFactor) + ')');
          }
        }
      }

      if (def.yAxis > 0) {
        this.$yAxis.attr('transform','translate('+(x1 - def.marginLeft)+',0)').call(this.yAxis);
      }

      if(def.chartLine) {
        //bug but now active in chrome 44
        /*this.$node.selectAll('linearGradient')
          .attr('x1', x1)
          .attr('y1', this.scaleY.range()[0])
          .attr('x2', x2)
          .attr('y2', this.scaleY.range()[1]);
        */

        this.gradientStops[1].offset =
          this.gradientStops[2].offset = this.scaleY(indexValue) / parseFloat(h);
        this.$fillGradientStops
          .attr('offset', (d) => d.offset)
          .attr('stop-color', (d) => d.color);
        this.$strokeGradientStops
          .attr('offset', (d) => d.offset)
          //.attr('stop-color', '#fff');
          .attr('stop-color', (d) => d.color);

        var line = (d) => {
          return 'M' + this.scale(data[0].index) + ',' + y1 +
            'L' + this.line(d).substr(1) +
            'L' + this.scale(data[data.length - 1].index) + ',' + y2 +
            'Z';
        };

        this.$path.datum(data).attr('d', line);
      }

      if(def.missingValues) {
        var stepper = this.config.animator.stepper,
            firstTs = this.scale.domain()[0],
            lastTs = this.scale.domain()[1],
            ts = data.map((d) => +d.index),
            missVal = [];

        //console.log(this.attr.name, 'TS', ts);

        var wasMissing = false;
        for (var i = 0; stepper.step(firstTs, i+1) <= lastTs; i++) {
          //console.log(this.attr.name, stepper.step(firstTs, i), ts.indexOf(stepper.step(firstTs, i)));
          if(ts.indexOf(stepper.step(firstTs, i)) === -1) {
            // if the last one was not missing start the block from that point
            //if(wasMissing === false && firstTs !== stepper.step(firstTs, i)) {
              //missVal.push({'start': stepper.step(firstTs, i-1), 'end': stepper.step(firstTs, i)});
              //console.log(this.attr.name, 'missing value', i, missVal[missVal.length - 1]);
            //}
            // check if the blocks are connected, then modify the last entry
            if(missVal.length > 0 && missVal[missVal.length - 1].end === stepper.step(firstTs, i)) {
              missVal[missVal.length - 1].end = stepper.step(firstTs, i+1);
            } else {
              missVal.push({'start': stepper.step(firstTs, i), 'end': stepper.step(firstTs, i+1)});
            }
            //console.log(this.attr.name, 'missing value', i, missVal[missVal.length - 1]);
            wasMissing = true;
          } else {
            wasMissing = false;
          }
        }

        var $rects = this.$missingValues.selectAll('rect').data(missVal);

        $rects.enter()
          .append('rect')
          .style('fill', def.colorMissingValue)
          .style('mask','url(#' + this.$stripeMask.attr('id') + ')');

        $rects.attr({
          'x': (d) => { return this.scale(d.start); },
          'y': this.scaleY.range()[1],
          'width': (d) => { return d3.max([(this.scale(d.end) - this.scale(d.start)), 0]); },
          'height': d3.max([this.scaleY.range()[0]-this.scaleY.range()[1], 0])
        });

        $rects.exit().remove();
      }
    }

    dataAt(ts:number) {
      return super.dataAt(ts);
    }
  }

}
