/**
 * Created by Holger Stitz on 09.03.2015.
 * @see http://arnauddri.github.io/d3-stock/
 */
import * as angular from 'angular';
import * as d3 from 'd3';
import * as $ from 'jquery';
import Animator, { IAnimateable, PVDAnimator } from '../services/Animator';
import { PVDHierarchyConfig } from './HierarchyConfig';
import { nextID, onDelete } from './VisUtils';
import InfrastructureLoader, { PVDInfrastructureLoader } from '../services/InfrastructureLoader';
import InfrastructureMapper, { PVDInfrastructureMapper } from '../services/InfrastructureMapper';
import { Infrastructure } from '../models/Infrastructure';
import WindowResize, { PVDWindowResize } from '../services/WindowResize';
import DataSelection, { PVDDataSelection } from '../services/DataSelection';
import LayoutManager, { PVDLayoutManager } from '../services/LayoutManager';
import TargetHierarchy, { PVDTargetHierarchy } from '../services/TargetHierarchy';
import ChangeBorder, { PVDChangeBorder } from '../services/ChangeBorderService';
import DataService, { PVDDataService } from '../services/DataService';
import { ApplicationConfiguration } from '../services/ApplicationConfiguration';


class StockTimeline implements IAnimateable {

  private margin = { top: 20 * ApplicationConfiguration.zoomFactor, right: 0, bottom: 10 * ApplicationConfiguration.zoomFactor, left: 0 };
  private axisMarginLeft = 40 * ApplicationConfiguration.zoomFactor;
  //private width    = 764 - this.margin.left - this.margin.right;
  //private height   = 60 - this.margin.top - this.margin.bottom;
  private height = 40 * ApplicationConfiguration.zoomFactor;

  private data;
  private indexPoint = {
    date: null,
    value: 0
  }; // data row object

  // caching the brushed extent and now
  private extCache = [0, 0];
  private cachedNow = 0;

  private dateRange = ['1w', '1m', '3m', '6m', '1y'];
  private defaultDateRange = '6m';

  private parseDate = d3.time.format.utc('%Y-%m-%d').parse;
  private legendFormat = d3.time.format.utc('%b %d, %Y');
  private customTimeFormat = d3.time.format.utc.multi([
    ['.%L', function (d) { return d.getMilliseconds(); }],
    [':%S', function (d) { return d.getSeconds(); }],
    ['%I:%M', function (d) { return d.getMinutes(); }],
    ['%I %p', function (d) { return d.getHours(); }],
    ['%a %d', function (d) { return d.getDay() && d.getDate() != 1; }],
    ['%b %d', function (d) { return d.getDate() != 1; }],
    ['%b', function (d) { return d.getMonth(); }],
    ['%Y', function () { return true; }]
  ]);


  private x = d3.time.scale();
  private x2 = d3.time.scale();
  private y = d3.scale.linear();
  private y2 = d3.scale.linear();

  private xAxis = d3.svg.axis().scale(this.x).orient('bottom').ticks(25).tickFormat(this.customTimeFormat);
  private yAxis = d3.svg.axis().scale(this.y).orient('left').ticks(4);
  private area;
  private line = d3.svg.line(); // linear || basis
  private brush;
  private rangeText;
  private gradientStops = [
    { offset: 0, color: '#259b24' },
    { offset: 0.5, color: '#259b24' },
    { offset: 0.5, color: '#e51c23' },
    { offset: 1.0, color: '#e51c23' }
  ];
  private noIndexPointColor = '#999';
  private whiteColor = '#fff';
  private loadGradientStops = [
    { offset: 0, color: '#333' },
    { offset: 0, color: '#333' },
    { offset: 0, color: '#ccc' },
    { offset: 1.0, color: '#ccc' }
  ];

  private $svg;
  private $context;
  private $area;
  private $legend;
  private $rangeSelection;
  private $range;
  private $xAxis;
  private $yAxis;
  private $brush;
  private $extentLoadGradient;
  private $indexHandler;
  private $indexPoint;
  private $indexLine;
  private $fillGradientStops;
  private $strokeGradientStops;

  private isBrushing;

  constructor(private $root, private config: PVDHierarchyConfig, private attrs, private dataService, private disableDrawing) {
    this.attachListener();
    this.rescale();
    this.initLayout();
    this.loadData();

    this.parseDate = d3.time.format.utc(attrs.parseDate).parse;
    this.defaultDateRange = attrs.defaultDateRange;
  }

  private attachListener(): void {
    var that = this;

    var id = '.stocktime' + nextID();

    this.config.windowResize.on('change' + id, () => {
      that.rescale();
    });

    this.config.changeBorder.on('maxsize' + id, () => {
      that.rescale();
    });

    // start animation by adding element to animator
    this.config.animator.push(this);

    // remove listeners on DOM delete
    onDelete(this.$root, () => {
      this.config.animator.remove(this);
      this.config.windowResize.on('change' + id, null);
      this.config.changeBorder.on('maxsize' + id, null);
    });
  }

  private loadData() {
    var that = this;

    // show loading overlay
    that.config.selection.loadingOverlay(true);

    d3.csv(that.attrs.csvFile,
      function (err, data) {
        that.data = data.map((d) => {
          return {
            date: that.parseDate(d.date),
            value: +d[that.attrs.show]
          }
        });
        that.draw();
        that.focusOnRange(that.defaultDateRange);

        that.dataService.when('initialized').then(() => {
          //that.dataService.stopStream(function() {
          //  console.info('stopped streaming');
          //});

          if (that.attrs.jumpToIndex !== undefined) {
            var index = that.parseDate(that.attrs.jumpToIndex);
            that.jumpTo(index);
          } else {
            that.loadIndexPointData();
          }

          if (that.attrs.jumpToRange !== undefined) {
            var range = that.attrs.jumpToRange.split('|').map((d) => that.parseDate(d));
            that.jumpTo(undefined, range);
          } else {
            that.focusOnRange(that.defaultDateRange);
            that.bulkLoadRangeData();
          }
        });

      }
    );
  }

  private jumpTo(index?: Date, range?: Date[]) {
    if (index !== undefined) {
      this.updateIndex(index);
      this.loadIndexPointData();
    }

    if (range !== undefined) {
      this.brush.extent(range);
      this.onBrush();
      this.$context.select('g.x.brush').call(this.brush);

      this.bulkLoadRangeData();
    }
  }

  /**
   * Calculates a space-filling grid rectangle and
   * sets the range for the x-axis and y-axis
   */
  private rescale() {
    var that = this;
    var elemRect = this.$root.node().parentNode.getBoundingClientRect();
    if (that.attrs.useParentWidth === 'false') {
      that.config.gridWidth = this.config.changeBorder.vertical.maxSize + this.config.changeBorder.vertical.marginStart;
    } else {
      that.config.gridWidth = parseInt(d3.select(that.$root.node().parentNode.parentNode).style('width')) - this.config.changeBorder.vertical.marginEnd - 90;
    }
    //that.config.gridHeight = this.config.changeBorder.horizontal.maxSize;

    //that.config.gridWidth = elemRect.width;
    that.config.gridHeight = that.height;

    that.x.range([0, that.config.gridWidth - this.axisMarginLeft]);
    that.x2.range(that.x.range());
    that.y.range([that.config.gridHeight, 0]);
    that.y2.range(that.y.range());

    that.$root.style({
      width: that.config.gridWidth + 'px'
      //height: that.config.gridHeight + 'px'
    });

    if (this.$svg !== undefined && this.data !== undefined) {
      that.draw();
    }
  }

  private initLayout() {
    var that = this;

    // no drawing = no layout necessary
    if (that.disableDrawing === true) {
      return;
    }

    that.area = d3.svg.area()
      .interpolate('monotone')
      .x(function (d: any) { return that.x2(d.date); })
      .y0(this.config.gridHeight)
      .y1(function (d: any) { return that.y(d.value); });

    that.line.interpolate('linear')
      .x((d: any) => { return that.x2(d.date); })
      .y((d: any) => { return that.y2(d.value); });

    that.$svg = this.$root.append('svg')
      .attr('class', 'chart')
      .attr('width', '100%')
      .attr('height', that.config.gridHeight + that.margin.top + that.margin.bottom);

    that.$context = that.$svg.append('g')
      .attr('class', 'context')
      .attr('transform', 'translate(' + (that.margin.left + this.axisMarginLeft) + ',' + that.margin.top + ')');

    that.$legend = that.$svg.append('g')
      .attr('class', 'chart__legend')
      .attr('width', '100%')
      .attr('height', 30 * ApplicationConfiguration.zoomFactor)
      .attr('transform', 'translate(' + that.margin.left + ', ' + 10 * ApplicationConfiguration.zoomFactor + ')');


    that.$rangeSelection = that.$legend.append('g')
      .attr('class', 'chart__range-selection');

    that.$range = that.$legend.append('text');
    that.$range.on('dblclick', () => {
      var dates = [
        ['Dump'],
        ['Honolulu 4.july', 1364767200000, 1373148000000, 284400000],
        ['DOI', 1262908800000, 1300233600000, 5529600000],
        ['Teaser', 1417392000000, 1422748800000, 2629743000],
        ['Latvia', 1159660800000, 1288569600000, 57801600000]
      ];
      var t = $('<div style="z-index: 100">');
      console.log('index point', that.config.selection.indexPoint, 'from', that.config.selection.getSelection(0).point, 'past', that.config.selection.past);
      d3.select(t[0]).selectAll('button').data(dates).enter().append('button').text((d) => d[0]).on('click', (sel: any, i) => {
        if (i === 0) {
          console.log(['name', that.config.selection.indexPoint, that.config.selection.getSelection(0).point, that.config.selection.past]);
        } else {
          var index = new Date();
          index.setTime(sel[1]);
          var point = new Date();
          point.setTime(sel[2]);
          var from = new Date();
          from.setTime(sel[2] - sel[3]);
          that.jumpTo(index, [from, point]);
        }
      });
      (<any>t).dialog({
        position: { my: "left top", at: "left top" }
      });
      (<Event>d3.event).preventDefault();
    });

    that.$strokeGradientStops = that.$svg.append('linearGradient')
      .attr('id', 'stroke_timeline')
      .attr('gradientUnits', 'objectBoundingBox')
      .attr({ x1: '0%', y1: '0%', x2: '0%', y2: '100%' })
      .selectAll('stop')
      .data(that.gradientStops)
      .enter().append('stop')
      .attr('offset', (d) => d.offset)
      .attr('stop-color', (d) => (that.attrs.indexPoint === true) ? d.color : that.noIndexPointColor);

    that.$fillGradientStops = that.$svg.append('linearGradient')
      .attr('id', 'fill_timeline')
      .attr('gradientUnits', 'objectBoundingBox')
      .attr({ x1: '0%', y1: '0%', x2: '0%', y2: '100%' })
      .selectAll('stop')
      .data(that.gradientStops)
      .enter().append('stop')
      .attr('offset', (d) => d.offset)
      .attr('stop-color', (d) => (that.attrs.indexPoint === true) ? d.color : that.noIndexPointColor)
      .attr('stop-opacity', 0.3);

    that.$extentLoadGradient = that.$svg.append('linearGradient')
      .attr('id', 'fill_extent')
      .attr('gradientUnits', 'objectBoundingBox')
      .attr({ x1: '0%', y1: '0%', x2: '100%', y2: '0%' })
      .selectAll('stop')
      .data(that.loadGradientStops)
      .enter().append('stop')
      .attr('offset', (d) => d.offset)
      .attr('stop-color', (d) => d.color);

    that.$yAxis = that.$context.append('g')
      .attr('class', 'y axis chart__axis--context');

    that.$area = that.$context.append('path')
      .attr('class', 'chart__area area')
      .style('stroke', 'url(#stroke_timeline)')
      .style('fill', 'url(#fill_timeline)');

    that.$xAxis = that.$context.append('g')
      .attr('class', 'x axis chart__axis--context')
      .attr('y', 0);

    var cache = null;
    var drag = d3.behavior.drag()
      .on('dragstart', function () {
        cache = that.indexPoint.date.valueOf();
      })
      .on('drag', function () {
        if ((<any>d3.event).x < 0 || (<any>d3.event).x > that.config.gridWidth) { return; }
        var x0: any = that.x2.invert((<any>d3.event).x - 30);
        that.updateIndex(x0);
        that.$range.text('index point @ ' + that.legendFormat(new Date('' + that.indexPoint.date)));
      })
      .on('dragend', function () {
        if (cache !== that.indexPoint.date.valueOf()) {
          that.loadIndexPointData();
        }
      });

    that.$indexHandler = that.$root.append('div')
      .classed('hg-hidden', !that.attrs.indexPoint)
      .classed('draggable', true)
      .on('mouseover', (d) => {
        that.$range.text('index point @ ' + that.legendFormat(new Date('' + that.indexPoint.date)));
      })
      .on('mouseout', (d) => {
        that.$range.text(that.rangeText);
      })
      .call(drag);

    that.$indexHandler.append('span');

    that.$indexLine = that.$context.append('line')
      .attr('class', 'index');

    that.$indexPoint = that.$context.append('circle')
      .classed('hg-hidden', !that.attrs.indexPoint)
      .classed('index', true)
      .attr('r', 3);

    that.$brush = that.$context.append('g')
      .attr('class', 'x brush');
  }

  private draw() {
    var that = this,
      data = this.data;

    var cache = null;
    that.brush = d3.svg.brush()
      .x(<any>that.x2)
      .on('brushstart', function () {
        that.isBrushing = true;
        cache = [that.x.domain()[0].valueOf(), that.x.domain()[1].valueOf()];
      })
      .on('brush', function () {
        that.onBrush();
      })
      .on('brushend', function () {
        that.isBrushing = false;
        if (that.x.domain()[0].valueOf() !== cache[0] || that.x.domain()[1].valueOf() !== cache[1]) {
          that.bulkLoadRangeData();
        }
      });

    var xRange = d3.extent(data.map(function (d) { return d.date; }));

    that.x.domain(xRange);
    that.x2.domain(that.x.domain());
    that.y.domain(d3.extent(data.map(function (d) { return d.value; })));
    that.y2.domain(that.y.domain());

    that.draw2(xRange);

    //initialize the selection
    that.focusOnRange(that.defaultDateRange);

    var from = that.brush.extent()[0];
    var indexPointDate = from.setFullYear(from.getFullYear() - 1);
    that.updateIndex(indexPointDate);
  }

  private draw2(xRange) {
    var that = this;

    // no drawing = no layout necessary
    if (that.disableDrawing === true) {
      return;
    }

    that.rangeText = 'time range: ' + that.legendFormat(new Date('' + xRange[0])) + ' - ' + that.legendFormat(new Date('' + xRange[1]));
    that.$range
      .text(that.rangeText)
      .style('text-anchor', 'end')
      .attr('transform', 'translate(' + (that.config.gridWidth) + ', 0)');

    //that.$area
    //  .datum(data)
    //  .attr('d', that.area);


    that.$xAxis
      //.attr('transform', 'translate(0,' + (that.config.gridHeight - 22) + ')')
      .call(that.xAxis);

    that.$yAxis.call(that.yAxis);

    that.$brush
      .call(that.brush)
      .selectAll('rect')
      .attr('y', -6)
      .attr('height', that.config.gridHeight + 7)
      .on('mouseover', (d) => {
        that.rangeText = 'time range: ' + that.legendFormat(that.x.domain()[0]) + ' - ' + that.legendFormat(that.x.domain()[1]);
        that.$range.text(that.rangeText);
      });

    that.$brush.selectAll('rect.extent')
      .style('fill', 'url(#fill_extent)');

    /*that.$rangeSelection.selectAll('text.chart__range-selection')
      .data(that.dateRange)
      .enter().append('text')
      .attr('class', 'chart__range-selection')
      .text((d) => d)
      .attr('transform', (d, i) => 'translate(' + (18 * i) + ', 0)')
      .on('click', function(d) {
        that.focusOnRange(this.textContent);
        that.bulkLoadRangeData();
      });*/
  }

  private focusOnRange(range) {
    var that = this;
    var today = new Date(that.data[that.data.length - 1].date); // csv order from new to old
    var ext = new Date(that.data[that.data.length - 1].date); // csv order from new to old

    //      var today = new Date(that.data[d3.round(that.data.length / 2,0)].date); // csv order from new to old
    //      var ext = new Date(that.data[d3.round(that.data.length / 2,0)].date); // csv order from new to old

    var match = range.match(/(\d+)([ymdwhs]{1}|[min])/),
      amount = (+match[1]);
    switch (match[2]) {
      case 's':
        ext.setSeconds(ext.getSeconds() - amount);
        break;
      case 'min':
        ext.setMinutes(ext.getMinutes() - amount);
        break;
      case 'h':
        ext.setHours(ext.getHours() - amount);
        break;
      case 'd':
        ext.setDate(ext.getDate() - amount);
        break;
      case 'w':
        ext.setDate(ext.getDate() - amount * 7);
        break;
      case 'm':
        ext.setMonth(ext.getMonth() - amount);
        break;
      case 'y':
        ext.setFullYear(ext.getFullYear() - amount);
        break;
    }

    that.setBrushTo(ext, today);
  }

  private onBrush() {
    var that = this;

    var ext = that.brush.extent();
    if (!that.brush.empty()) {
      var min = <number>d3.min(that.y.domain());
      var max = <number>d3.max(that.y.domain());

      that.x.domain(that.brush.empty() ? that.x2.domain() : ext);
      that.y.domain([
        d3.min(that.data.map(function (d) { return (d.date >= ext[0] && d.date <= ext[1]) ? d.value : max; })),
        d3.max(that.data.map(function (d) { return (d.date >= ext[0] && d.date <= ext[1]) ? d.value : min; }))
      ]);

      if (that.$range) {
        that.rangeText = 'time range: ' + that.legendFormat(ext[0]) + ' - ' + that.legendFormat(ext[1]);
        that.$range.text(that.rangeText);
      }
    }
  }

  /**
   * Set the brush extent to a certain time range.
   * `from` can be also an extent array.
   * @param from|extent (number|Date|number[]|Date[])
   * @param to (number|Date)
   */
  private setBrushTo(from, to?) {
    var that = this;

    // convert extent array
    if (to === undefined) {
      to = from[1];
      from = from[0];
    }

    // convert numbers to Date object
    from = (typeof (from) === 'number') ? new Date(from) : from;
    to = (typeof (to) === 'number') ? new Date(to) : to;

    that.extCache = [from, to];
    that.brush.extent(that.extCache);
    that.onBrush();

    if (that.$context) {
      that.$context.select('g.x.brush').call(that.brush);
    }
  }

  private bulkLoadRangeData() {
    var that = this;
    var from = that.x.domain()[0],
      to = that.x.domain()[1];

    var from_t = this.config.animator.stepper.round(from.valueOf()),
      to_t = this.config.animator.stepper.round(to.valueOf());

    // show loading overlay
    that.config.selection.loadingOverlay(true);

    that.loadGradientStops[1].offset = that.loadGradientStops[2].offset = 0;

    if (that.$extentLoadGradient) {
      that.$extentLoadGradient.transition().attr('offset', (d) => d.offset);
    }

    var steps = d3.round((to_t - from_t) / that.config.animator.stepper.refStepWidth, 0);
    that.config.selection.setPinnedSelection(to_t, to_t - from_t, 0, steps);
    //that.config.animator.stop();
    var id = 'bulkSent.' + nextID();

    //load the DOI offset, too
    var loadingFrom = this.config.selection.doi.getLoadingStart(from_t, to_t - from_t);
    that.dataService.on(id, (a, b) => {
      if (b >= loadingFrom && b <= to_t) {
        var p = d3.round((b - loadingFrom) / (to_t - loadingFrom), 1);
        if (p === that.loadGradientStops[1].offset) {
          return;
        }
        //console.log('bulk load complete: '+p*100+'%');
        that.loadGradientStops[1].offset = that.loadGradientStops[2].offset = p;
        if (that.$extentLoadGradient) {
          that.$extentLoadGradient.transition().attr('offset', (d) => d.offset);
        }
      }
    });

    console.info("bulk load and jump [" + from.toUTCString() + ", " + to.toUTCString() + "]", "load with doi buffer [" + (new Date(loadingFrom)).toUTCString() + ", " + (new Date(to_t)).toUTCString() + "]");

    that.dataService.bulkLoadAndJump(loadingFrom, to_t, true, // <- autostart animator
      function () {
        that.dataService.on(id, null);
        that.config.selection.infra.updateDynamicRangeAttr(loadingFrom, to_t);
        console.info('complete: bulk load and jump');
        //that.config.animator.stop();
        that.loadGradientStops[1].offset = that.loadGradientStops[2].offset = 1.0;
        if (that.$extentLoadGradient) {
          that.$extentLoadGradient.transition().attr('offset', (d) => d.offset);
        }

        //that.dataService.stopStream(function() {
        //  console.info('stopped streaming');
        //});

        /*
          HACK FOR DATA STREAMING (aka ANIMATION) [TVCG Journal Revision]
          set animator now and cached now to `to_t`,
          because dataService.bulkLoadAndJump() would set animator.now to `loadingFrom`
          which does not fit with the brush extent.
         */
        that.cachedNow = to_t;
        that.config.animator.now = to_t;

        // hide loading overlay
        setTimeout(() => {
          that.config.selection.loadingOverlay(false);
        }, 1000);
      });
  }

  private reverseData; // use reversed data (means from oldest -> newest)
  private getNearestDatum(date) {
    if (this.reverseData === undefined) {
      this.reverseData = this.data.reverse();
    }
    var i = d3.bisector(function (d: any) { return d.date; }).right(this.reverseData, date, 1);
    var d0 = this.reverseData[i - 1];
    var d1 = this.reverseData[i];
    var datum: any = date - d0.date > d1.date - date ? d1 : d0;
    return datum;
  }

  private updateIndex(date) {
    var that = this;

    that.indexPoint = that.getNearestDatum(date);

    that.updateIndexDraw();
  }

  private updateIndexDraw() {
    var that = this;

    // no drawing = no layout necessary
    if (that.disableDrawing === true) {
      return;
    }

    var y;
    if (that.attrs.indexPoint === true) {
      y = that.y2(that.indexPoint.value);
    } else {
      y = d3.max(that.y2.range());
    }

    that.$indexPoint
      .attr('cx', that.x2(that.indexPoint.date))
      .attr('cy', y);

    that.$indexHandler
      .style('left', that.x2(that.indexPoint.date) + 75 + this.axisMarginLeft + 'px');

    that.$indexLine
      .attr('x1', that.x2.range()[0])
      .attr('x2', that.x2.range()[1])
      .attr('y1', y)
      .attr('y2', y);

    that.gradientStops[1].offset =
      that.gradientStops[2].offset = y / that.config.gridHeight;
    that.$fillGradientStops.attr('offset', (d) => d.offset);
    that.$strokeGradientStops.attr('offset', (d) => d.offset);

    var line = (d) => {
      return 'M' + that.$indexLine.attr('x1') + ',' + that.$indexLine.attr('y1') +
        'L' + that.line(d).substr(1) +
        'L' + that.$indexLine.attr('x2') + ',' + that.$indexLine.attr('y2') +
        'Z';
    };

    that.$xAxis.attr('transform', 'translate(0,' + (y - 22) + ')');

    this.$area.datum(that.data).attr('d', line);
  }

  private loadIndexPointData() {
    var that = this;
    that.dataService.loadIndexPointData(that.indexPoint.date.valueOf());
  }

  /**
   * Animator's layout phase given dt and now the result will be given to the update method.
   * @param dt (number)
   * @param now (number)
   */
  layout(dt: number, now: number): any {

  }

  /**
   * Animator's update phase given dt, now, and the result of the layout call.
   * Initalizes the available time range and updates the focus brush and
   * @param dt (number)
   * @param now (number)
   * @param layouted (any)
   */
  update(dt: number, now: number, layouted: any): void {
    var that = this;

    /*
      HACK FOR DATA STREAMING (aka ANIMATION) [TVCG Journal Revision]
      If selection is pinned, set the now always back to the cachedNow,
      to start from this point when data streaming is enabled
     */
    if (that.config.selection.isPinned) {
      that.config.animator.now = that.cachedNow;
    } else {
      that.cachedNow = now;
    }

    // if brushing in action don't update the brush from tick
    if (that.isBrushing) {
      return;
    }

    var sel = that.config.selection.getSelection(now);
    //console.log(sel, 'pinned', that.config.selection.isPinned, new Date(sel.start).toUTCString(), new Date(sel.end).toUTCString(), new Date(sel.point).toUTCString());

    // update position of focus brush and now marker everytime
    that.setBrushTo(sel.start, sel.end);
  }
}


export default angular.module('directives.pvdStockTimeline', [
  InfrastructureLoader,
  WindowResize,
  Animator,
  DataSelection,
  InfrastructureMapper,
  LayoutManager,
  TargetHierarchy,
  ChangeBorder,
  DataService
])
  .directive('pvdStockTimeline', [
    'pvdInfrastructureLoader',
    'pvdWindowResize',
    '$timeout',
    'pvdAnimator',
    'pvdDataSelection',
    'pvdInfrastructureMapper',
    'pvdLayoutManager',
    'pvdTargetHierarchy',
    'pvdChangeBorder',
    'pvdDataService',
    function (
      pvdInfrastructureLoader: PVDInfrastructureLoader,
      pvdWindowResize: PVDWindowResize,
      $timeout,
      pvdAnimator: PVDAnimator,
      pvdDataSelection: PVDDataSelection,
      pvdInfrastructureMapper: PVDInfrastructureMapper,
      pvdLayoutManager: PVDLayoutManager,
      pvdTargetHierarchy: PVDTargetHierarchy,
      pvdChangeBorder: PVDChangeBorder,
      pvdDataService: PVDDataService
    ) {
      return {
        compile: function (element, attrs: any) {
          attrs.width = angular.isDefined(attrs.width) ? +attrs.width : '100%';
          attrs.height = angular.isDefined(attrs.height) ? +attrs.height : 500;
          attrs.csvFile = angular.isDefined(attrs.csvFile) ? attrs.csvFile : '';
          attrs.parseDate = angular.isDefined(attrs.parseDate) ? attrs.parseDate : '%Y-%m-%d';
          attrs.defaultDateRange = angular.isDefined(attrs.defaultDateRange) ? attrs.defaultDateRange : '1m';
          attrs.show = angular.isDefined(attrs.show) ? attrs.show : 'close';
          attrs.indexPoint = angular.isDefined(attrs.indexPoint) ? ((attrs.indexPoint == 'true') ? true : false) : true;
          attrs.disableDrawing = (angular.isDefined(attrs.disableDrawing) && attrs.disableDrawing === 'true') ? true : false;

          return function ($scope, element) {
            pvdInfrastructureLoader.get(attrs.infraId).then((infrastructure: Infrastructure) => {
              $timeout(() => { //skip one time to ensure that the svg is properly layouted
                //var path:string = $scope.path;
                //var attr = infrastructure.findAttr(path);
                var $base = d3.select(element[0]);

                var $root: d3.Selection<any> = $base.append('div')
                  .classed('pvd-stock-timeline', true)
                  .attr('data-infra-id', attrs.infraId);

                var config = new PVDHierarchyConfig(pvdAnimator, pvdDataSelection, pvdLayoutManager, pvdInfrastructureMapper, pvdTargetHierarchy, pvdChangeBorder, pvdWindowResize);
                config.visConfigId = attrs.visConfig || '';

                //modifyConfig(config, infrastructure);

                new StockTimeline($root, config, attrs, pvdDataService, attrs.disableDrawing);
              });
            });
          }
        },
        scope: {
          'csv-file': '@?',
          'parseDate': '@?',
          'show': '@?',
          'indexPoint': '@?',
          'defaultDateRange': '@?',
          'jumpToIndex': '@?', // jump to a certain index point after data is loaded; date format = parseDate attribute
          'jumpToRange': '@?', // select a certain time range after data is loaded; date format = parseDate attribute: "2012-01-01|2012-02-01"
          'infraId': '@?', // id of infrastructure*.json
          'width': '@?', // svg width
          'height': '@?', // svg individual height
          'visConfig': '@?', // modifier for infrastructure.visConfig[...]
          'useParentWidth': '@?', // use the parent DOM element for width (default: true)
          'disableDrawing': '@?' // disable drawing the timeline (but keep the loading functionality)? (default: 'false')
        },
        restrict: 'E'
      };
    }])
  .name; // name for export default
