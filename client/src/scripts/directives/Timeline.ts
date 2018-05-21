/**
 * Created by Holger Stitz on 18.09.2015.
 * Inspired by http://bl.ocks.org/mbostock/1667367
 */
import * as angular from '@bower_components/angular';
import * as d3 from '@bower_components/d3/d3';
import Animator, { IAnimateable, PVDAnimator } from '../services/Animator';
import { PVDHierarchyConfig } from './HierarchyConfig';
import { nextID, onDelete } from './VisUtils';
import InfrastructureLoader, { PVDInfrastructureLoader } from '../services/InfrastructureLoader';
import InfrastructureMapper, { PVDInfrastructureMapper } from '../services/InfrastructureMapper';
import LayoutManager, { PVDLayoutManager } from '../services/LayoutManager';
import TargetHierarchy, { PVDTargetHierarchy } from '../services/TargetHierarchy';
import DataService, { PVDDataService } from '../services/DataService';
import ChangeBorderService, { PVDChangeBorder } from '../services/ChangeBorderService';
import WindowResize, { PVDWindowResize } from '../services/WindowResize';
import { Infrastructure } from '../models/Infrastructure';
import DataSelection, { PVDDataSelection } from '../services/DataSelection';

/**
 * Creats a two parted timeline, containing the *context timeline* with the overall available time range
 * and the *focus timeline* that shows the selected part of the context timeline. Selecting a time range
 * in the focus timeline will request new data from the service via DataService.
 *
 * This class is listening for the "availableTime" event triggered from the DataService via DataSelection.
 */
class PVDTimeline implements IAnimateable {

  private width = 960; // initial size
  private height = 60;

  // selection configuration
  private selectionShift = 1000; // = 1 seconds (real time shift from DataService)
  private relativeSelPast = 5 * 60 * 1000; // 5 minutes

  // d3 time scales
  private contextScale = d3.time.scale.utc();
  private focusScale = d3.time.scale.utc();

  // d3 time format
  private contextTimeFormat = d3.time.format.utc.multi([
    ['%a %d.%m.', function (d) { return d.getDay() && d.getDate() != 1; }],
    ['%a %d.%m.', function (d) { return d.getDate() != 1; }],
    ['%b', function (d) { return d.getMonth(); }],
    ['%Y', function () { return true; }]
  ]);

  private focusTimeFormat = d3.time.format.utc.multi([
    ['.%L', function (d) { return d.getMilliseconds(); }],
    [':%S', function (d) { return d.getSeconds(); }],
    ['%H:%M', function (d) { return d.getMinutes(); }],
    ['%H', function (d) { return d.getHours(); }],
    ['%a %d.%m.', function (d) { return d.getDay() && d.getDate() != 1; }],
    ['%a %d.%m.', function (d) { return d.getDate() != 1; }],
    ['%b', function (d) { return d.getMonth(); }],
    ['%Y', function () { return true; }]
  ]);

  // d3 axis
  private contextAxis = d3.svg.axis().scale(this.contextScale).orient('top').ticks(10).tickFormat(this.contextTimeFormat);
  private focusAxis = d3.svg.axis().scale(this.focusScale).orient('bottom').ticks(20).tickFormat(this.focusTimeFormat);

  // d3 brushes
  private contextBrush = d3.svg.brush();
  private focusBrush = d3.svg.brush();

  // caching the brushed extent and now
  private contextExtCache = [0, 0];
  private focusExtCache = [0, 0];
  private cachedNow = 0;

  // flags to change behavior
  private initAvailableTimeRange = false;
  private selectedNowInContext = false;

  // d3 DOM selections
  private $svg;
  private $context;
  private $contextNowMarker;
  private $focus;
  private $focusNowMarker;

  /**
   * Constructor
   * @param $root D3 Selection as root element
   * @param config PVD configuration
   * @param dataSerivce Data Service object
   * @param enableDoiBuffer Activate a shift for the `from` timestamp more to the past do load data for the DoI calcuation
   */
  constructor(private $root, private config: PVDHierarchyConfig, private dataSerivce, private enableDoiBuffer) {
    this.attachListener();
    this.initLayout();
    this.rescale();
  }

  /**
   * Attach listeners to defered objects (e.g., selection or window)
   */
  private attachListener() {
    var that = this;

    // create unique class id for listener
    var id = '.timeline' + nextID();

    // rescale on window resize
    this.config.windowResize.on('change' + id, () => {
      that.rescale();
    });

    // set available range to context timeline scale
    this.config.selection.on('availableTime' + id, (newRange) => {
      that.setContextAxisTo(newRange);
      that.initAvailableTimeRange = true;
    });

    // start animation by adding element to animator
    this.config.animator.push(this);

    // remove listeners on DOM delete
    onDelete(this.$root, () => {
      this.config.animator.remove(this);
      this.config.windowResize.on('change' + id, null);
      this.config.selection.on('availableTime' + id, null);
    });
  }

  /**
   * Rescale the scales and DOM elements based on the parent DOM node.
   */
  private rescale() {
    var that = this;

    // get size of parent DOM element
    var parentSize = that.$root.node().parentNode.getBoundingClientRect();

    that.width = parentSize.width;

    that.$svg
      .attr('width', that.width)
      .attr('height', that.height);

    // update scale ranges
    that.focusScale.range([0, that.width]);
    that.contextScale.range([0, that.width]);

    // update brushes and axes
    that.setContextBrushTo(that.contextExtCache);
    that.$context.select('.x.axis').call(that.contextAxis);

    that.setFocusBrushTo(that.focusExtCache);
    that.$focus.select('.x.axis').call(that.focusAxis);

    // update position of now marker
    that.$contextNowMarker.attr('x', that.contextScale(that.cachedNow));
    that.$focusNowMarker.attr('x', that.focusScale(that.cachedNow));
  }

  /**
   * Initialize the basic DOM elements and variables
   */
  private initLayout() {
    var that = this;

    that.$svg = that.$root.append('svg');

    that.contextBrush
      .x(that.contextScale)
      .on('brushstart', () => {
        that.contextExtCache = that.contextBrush.extent().splice(0);
      })
      .on('brush', () => {
        that.selectedNowInContext = false;
        // update focus scale, brush and now marker with context brush extent
        that.setFocusAxisTo(that.contextBrush.empty() ? that.contextScale.domain() : that.contextBrush.extent());
        that.setFocusBrushTo(that.focusExtCache);
        that.$focusNowMarker.attr('x', that.focusScale(that.cachedNow));
      })
      .on('brushend', () => {
        // reset selection on empty brush
        if (that.contextBrush.empty()) {
          that.setContextBrushTo(that.contextExtCache);
          that.setFocusBrushTo(that.focusExtCache);
          that.setFocusAxisTo(that.contextBrush.empty() ? that.contextScale.domain() : that.contextBrush.extent());

          // brushed selection
        } else {
          console.log('context brush', that.contextBrush.extent());
          that.contextExtCache = that.contextBrush.extent().splice(0);
        }
      });

    that.focusBrush
      .x(that.focusScale)
      .on('brushstart', () => {
        that.focusExtCache = that.focusBrush.extent().splice(0);
      })
      //.on('brush', () => {})
      .on('brushend', () => {
        // reset selection on empty brush
        if (that.focusBrush.empty()) {
          that.setFocusBrushTo(that.focusExtCache);

          // load a pinned time range and stop the stream afterwards
        } else {
          console.log('focus brush', that.focusBrush.extent());
          that.focusExtCache = that.focusBrush.extent().splice(0);
          var from = that.focusBrush.extent()[0].getTime(),
            to = that.focusBrush.extent()[1].getTime();
          that.setPinnedAndStopStream(from, to);
        }
      });

    // create context axis and brush
    that.$context = that.$svg.append('g')
      .attr('class', 'context');

    that.$context.append('g')
      .attr('class', 'x axis')
      .attr('transform', 'translate(0,20)')
      .call(that.contextAxis);

    that.$context.append('g')
      .attr('class', 'x brush')
      .attr('transform', 'translate(0,-1)')
      .call(that.contextBrush)
      .selectAll('rect')
      .attr('y', 0)
      .attr('height', 20);

    // create focus axis and brush
    that.$focus = that.$svg.append('g')
      .attr('class', 'focus');

    that.$focus.append('g')
      .attr('class', 'x axis')
      .attr('transform', 'translate(0,30)')
      .call(that.focusAxis);

    that.$focus.append('g')
      .attr('class', 'x brush')
      .attr('transform', 'translate(0,31)')
      .call(that.focusBrush)
      .selectAll('rect')
      .attr('y', 0)
      .attr('height', 20);

    // create now marker
    that.$contextNowMarker = that.appendNowMarker(that.$context).attr('y', -1);
    that.$focusNowMarker = that.appendNowMarker(that.$focus).attr('y', 31);
  }

  /**
   * Appends a simple rectangle now marker to a $parent.
   * @param $parent D3 selection
   */
  private appendNowMarker($parent) {
    var that = this;
    return $parent.append('rect')
      .attr('class', 'now')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', 2)
      .attr('height', 20)
      .attr('fill', 'red')
      .on('click', function () {
        that.jumpToNow();

        // click in context update the focus scale and axis immediatly
        if ($parent === that.$context) {
          that.selectedNowInContext = true;
          that.setFocusAxisTo(that.focusBrush.extent());
          that.setContextBrushTo(that.focusBrush.extent()[0], that.focusBrush.extent()[1]);
        }
      });
  }

  /**
   * Set the brush extent to a certain time range.
   * `from` can be also an extent array.
   * @param $elem (d3.Selection)
   * @param brush (d3.Brush)
   * @param extCache (Date[]) Extent cache
   * @param from|extent (number|Date|number[]|Date[])
   * @param to (number|Date)
   */
  private setBrushTo($elem, brush, extCache, from, to?) {
    var that = this;

    // convert extent array
    if (to === undefined) {
      to = from[1];
      from = from[0];
    }

    // convert numbers to Date object
    from = (typeof (from) === 'number') ? new Date(from) : from;
    to = (typeof (to) === 'number') ? new Date(to) : to;

    extCache = [from, to];
    brush.extent(extCache);
    $elem.select('.x.brush').call(brush);
  }

  /**
   * Set the context brush extent to a certain time range.
   * `from` can be also an extent array.
   * @param from|extent (number|Date|number[]|Date[])
   * @param to (number|Date)
   */
  private setContextBrushTo(from, to?) {
    this.setBrushTo(this.$context, this.contextBrush, this.contextExtCache, from, to);
  }

  /**
   * Set the context brush extent to a certain time range.
   * `from` can be also an extent array.
   * @param from|extent (number|Date|number[]|Date[])
   * @param to (number|Date)
   */
  private setFocusBrushTo(from, to?) {
    this.setBrushTo(this.$focus, this.focusBrush, this.focusExtCache, from, to);
  }


  /**
   * Set the scale domain to a certain time range and updates the axis accordingly.
   * `from` can be also an extent array.
   * @param $elem
   * @param scale
   * @param axis
   * @param from|extent (number|Date|number[]|Date[])
   * @param to (number|Date)
   */
  private setAxisTo($elem, scale, axis, from, to?) {
    var that = this;

    // convert extent array
    if (to === undefined) {
      to = from[1];
      from = from[0];
    }

    // convert numbers to Date object
    from = (typeof (from) === 'number') ? new Date(from) : from;
    to = (typeof (to) === 'number') ? new Date(to) : to;

    scale.domain([from, to]);
    $elem.select('.x.axis').call(axis);
  }

  /**
   * Set the context scale domain to a certain time range and updates the axis accordingly.
   * `from` can be also an extent array.
   * @param from|extent (number|Date|number[]|Date[])
   * @param to (number|Date)
   */
  private setContextAxisTo(extent);
  private setContextAxisTo(from, to?) {
    this.setAxisTo(this.$context, this.contextScale, this.contextAxis, from, to);
  }

  /**
   * Set the context scale domain to a certain time range and updates the axis accordingly.
   * `from` can be also an extent array.
   * @param from|extent (number|Date|number[]|Date[])
   * @param to (number|Date)
   */
  private setFocusAxisTo(from, to?) {
    this.setAxisTo(this.$focus, this.focusScale, this.focusAxis, from, to);
  }

  /**
   * Jumps to the now time point and sets a relative selection.
   * The focus brush is updated respectively.
   * Note that time point `now` is the `cachedNow` from the update function.
   */
  private jumpToNow() {
    var that = this;

    if (that.selectedNowInContext === true) {
      console.log('now is already selected');
      return;
    }

    var from = that.cachedNow,
      to = that.cachedNow + that.relativeSelPast;

    that.setRelativeAndStartStream(from, to);
    that.setFocusBrushTo(from, to - that.relativeSelPast);
  }

  /**
   * Sets a pinned time selection, loads the data and stops the streaming capability afterwards.
   * @param from (number) timestamp in milliseconds
   * @param to (number) timestamp in milliseconds
   */
  private setPinnedAndStopStream(from, to) {
    var that = this;

    that.config.selection.setPinnedSelection(to, to - from);

    var loadingFrom = from;

    if (this.enableDoiBuffer) {
      loadingFrom = this.config.selection.doi.getLoadingStart(from, to - from);
    }

    that.dataSerivce.load(loadingFrom, to, function () {
      console.info('complete: load');

      that.dataSerivce.stopStream(function () {
        console.info('stop streaming');
      });
    });
  }

  /**
   * Sets a relative time selection from with a defined past.
   * From and to are used to calculate the `past`.
   * Then starts the streaming capability and loads the data in the past range.
   * @param from (number) timestamp in milliseconds
   * @param to (number) timestamp in milliseconds
   */
  private setRelativeAndStartStream(from, to) {
    var that = this;

    that.config.selection.setRelativeSelection(0, to - from);

    var sel = that.config.selection.getSelection(to);

    that.dataSerivce.startStream(sel.end, function () {
      console.info('start streaming');

      that.dataSerivce.bulkLoadAndJump(sel.start, sel.end, true, // <-- autostart
        function () {
          console.info('complete: bulk load and jump');
        });
    });
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
    that.cachedNow = now;

    var sel = that.config.selection.getSelection(now);
    //console.log(sel, 'pinned', that.config.selection.isPinned);

    // initialize when available time range is available
    if (that.initAvailableTimeRange) {
      that.initAvailableTimeRange = false;

      var from = sel.start + that.selectionShift;
      var to = sel.end + that.selectionShift;

      that.setContextBrushTo(from, to);
      that.setFocusAxisTo(that.contextBrush.extent());

      var loadingFrom = from;

      if (this.enableDoiBuffer) {
        loadingFrom = this.config.selection.doi.getLoadingStart(from, to - from);
      }

      console.info("bulk load and jump [" + new Date(from).toUTCString() + ", " + new Date(to).toUTCString() + "]", "load with doi buffer [" + (new Date(loadingFrom)).toUTCString() + ", " + (new Date(to)).toUTCString() + "]");

      that.dataSerivce.bulkLoadAndJump(loadingFrom, to, true, // <- autostart animator
        function () {
          that.config.selection.infra.updateDynamicRangeAttr(from, to);
          console.info('complete: bulk load and jump');
          //that.config.animator.stop();

          //that.dataService.stopStream(function() {
          //  console.info('stopped streaming');
          //});

          /*
            HACKED ANIMATOR
            Set animator now and cached now to `to`,
            because dataService.bulkLoadAndJump() would set animator.now to `from`
            which does not fit with the brush extent. Instead we want to continue
            streaming from the `from` time point.
           */
          that.cachedNow = to;
          that.config.animator.now = to;

          // hide loading overlay
          setTimeout(() => {
            that.config.selection.loadingOverlay(false);
          }, 1000);
        });

      that.selectedNowInContext = (sel.end === now);
    }

    // update position of focus brush and now marker every time
    that.setFocusBrushTo(sel.start, sel.end);

    that.$contextNowMarker.attr('x', that.contextScale(now));
    that.$focusNowMarker.attr('x', that.focusScale(now));

    // assume that relative position is always at now point
    if (that.selectedNowInContext) {
      that.setFocusAxisTo((sel.start + that.selectionShift), (sel.end + that.selectionShift));
    }

  }

}

/**
 * Expose the Typescript class to an Angular directive
 */
export default angular.module('directives.pvdTimeline', [
  Animator,
  InfrastructureLoader,
  InfrastructureMapper,
  LayoutManager,
  TargetHierarchy,
  DataService,
  ChangeBorderService,
  WindowResize,
  DataSelection
])
  .directive('pvdTimeline', function (
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
        attrs.enableDoiBuffer = angular.isDefined(attrs.enableDoiBuffer) ? (attrs.enableDoiBuffer === 'true') : false;

        return function ($scope, element) {
          pvdInfrastructureLoader.get().then((infrastructure: Infrastructure) => {
            $timeout(() => { //skip one time to ensure that the svg is properly layouted
              var $base = d3.select(element[0]);

              var $root: d3.Selection = $base.append('div').classed('pvd-timeline', true);

              // create configuration
              var config = new PVDHierarchyConfig(pvdAnimator, pvdDataSelection, pvdLayoutManager, pvdInfrastructureMapper, pvdTargetHierarchy, pvdChangeBorder, pvdWindowResize);
              config.visConfigId = attrs.visConfig || '';
              //modifyConfig(config, infrastructure);

              new PVDTimeline($root, config, pvdDataService, attrs.enableDoiBuffer);
            });
          });
        }
      },
      scope: {
        'enableDoiBuffer': '@?' // {boolean} Activate a shift for the `from` timestamp more to the past do load data for the DoI calcuation
      },
      restrict: 'E'
    };
  })
  .name; // name for export default

