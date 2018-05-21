/**
 * Created by Holger Stitz on 25.02.2015.
 */
import * as angular from '@bower_components/angular';
import * as d3 from '@bower_components/d3/d3';
import { nextID, onDelete } from './VisUtils';
import { Infrastructure } from '../models/Infrastructure';
import ChangeBorderService, { PVDChangeBorder, AChangeBorder } from '../services/ChangeBorderService';
import DataSelection, { PVDDataSelection } from '../services/DataSelection';
import WindowResize, { PVDWindowResize } from '../services/WindowResize';

/**
 * Creates a vertical or horizontal ruler.
 * IMPORTANT:
 *  A HORIZONTAL RULER uses the VERTICAL change borders and vice versa!
 */
class ChangeBorderRuler {

  private color = d3.scale.ordinal().domain([0, 1]).range(['#d9d9d9', '#bdbdbd', '#969696', '#636363']);

  private $popover;
  private $popoverSelect;
  private $ruler;
  private $grid;
  private $axis;

  constructor(private $root, private config: RulerConfiguration, private changeBorder: PVDChangeBorder, private windowResize: PVDWindowResize, private selection: PVDDataSelection) {
    this.attachListener();
    this.rescale();
    this.initLayout();
  }

  /**
   * Calculates a space-filling grid rectangle and
   * sets the range for the x-axis and y-axis
   */
  private rescale() {
    var that = this;

    // wait for changeBorder.on('maxsize') event to rescale
    // triggered in ThermalLayout

    that.config.width = this.changeBorder.vertical.maxSize;
    that.config.height = this.changeBorder.horizontal.maxSize;

    that.$root
      .style('margin-' + this.config.styleSegmentStart, this.config.changeBorder.marginStart + 'px')
      .style({
        width: that.config.width + 'px',
        height: that.config.height + 'px'
      });
  }

  /**
   * Attach and removes the listener for this layout
   */
  private attachListener(): void {
    var that = this;

    var id = '.rulers' + nextID();

    this.selection.on('infra' + id, (newInfra: Infrastructure) => {
      that.updatePopover(newInfra);
    });

    // window resize
    this.windowResize.on('change' + id, () => {
      that.rescale();
      that.update();
      that.$popover.style('display', null);
    });

    this.changeBorder.on('maxsize' + id, () => {
      that.rescale();
      that.update();
      that.$popover.style('display', null);
    });

    this.changeBorder.on('drag' + id, (border, orientation) => {
      that.update();
    });

    // remove listener on delete
    onDelete(this.$root, () => {
      this.windowResize.on('change' + id, null);
      this.changeBorder.on('maxsize' + id, null);
      this.changeBorder.on('drag' + id, null);
      this.selection.on('infra' + id, null);
    });
  }

  private initLayout() {
    this.$ruler = this.$root.append('svg').classed('ruler', true);
    this.$grid = this.$root.append('svg').classed('grid', true);
    this.$axis = this.$ruler.append('g').classed('axis', true);

    if (this.config.orientation === 'horizontal') {
      this.$axis.attr('transform', 'translate(0,' + this.config.rulerHeight + ')');
    } else {
      this.$axis.attr('transform', 'translate(' + (this.config.rulerHeight + 20) + ', 0)');
    }

    this.addPopover();
  }

  private addPopover() {
    var that = this;

    this.$popover = this.$root.append('div')
      .attr('class', 'popover fade bottom in')
      .html('<div class="arrow"></div>' +
        '<h3 class="popover-title" style="text-align: center;">Segment representation</h3>' +
        '<div class="popover-content"></div>');

    this.$popoverSelect = this.$popover.select('.popover-content')
      .append('select').classed('form-control', true).on('change', change);

    function change() {
      var selectedIndex = that.$popoverSelect.node()['selectedIndex'],
        visConfigId = that.$popoverSelect.node()[selectedIndex].__data__,
        vSeg = that.$popoverSelect.attr('data-index'),
        hSeg = '*'; // TODO assume any representation for hSeg so far

      var segRep = that.changeBorder.getSegmentRepById(hSeg, vSeg);
      segRep.visConfigId = visConfigId;
      that.changeBorder.updateSegmentRep(segRep);

      that.$popover.style({
        'display': null
      });
    }
  }

  private updatePopover(infra) {
    var visConfigs = Object.keys(infra.visConfig.representation);
    var $options = this.$popoverSelect.selectAll('option').data(visConfigs);

    // Enter selection
    $options.enter().append('option').text(function (d) { return d; });
  }

  private update() {
    this.updateRulers();
    this.updateGrid();
    this.updateChangeBorders();
  }

  private updateGrid() {
    var that = this;

    var gridAxis = d3.svg.axis()
      .scale(this.config.changeBorder.d3scaleAbsPos)
      .ticks(25)
      .tickFormat((d) => '')
      .orient(this.config.d3AxisOrient)
      .scale(this.config.changeBorder.d3scaleAbsPos);

    this.$grid
      .style({
        width: (that.config.width + 1) + 'px',
        height: (that.config.height + 1) + 'px'
      });

    if (this.config.orientation === 'horizontal') {
      this.$grid
        .style('margin-' + this.config.d3AxisOrient, this.changeBorder.horizontal.marginStart + 'px');
      //.attr('transform', 'translate(0,' + that.config.height + ')');
      gridAxis.tickSize(-that.config.height, 0);
    } else {
      this.$grid
        .style('margin-' + this.config.d3AxisOrient, this.changeBorder.vertical.marginStart + 'px');
      //.attr('transform', 'translate(' + that.config.width + ',0)');
      gridAxis.tickSize(-that.config.width, 0);
    }

    this.$grid.call(gridAxis);

    this.$grid.selectAll('.tick')
      .classed('center', (d, i) => {
        return d === that.config.changeBorder.centerAct;
      });
  }

  private updateRulers() {
    var that = this;

    var rulerAxis = d3.svg.axis()
      .scale(this.config.changeBorder.d3scaleAbsPos)
      .ticks(20)
      .tickFormat(this.config.d3AxisFormat)
      .tickSize(9, 9)
      .orient(this.config.d3AxisOrient);

    if (this.config.orientation === 'horizontal') {
      this.$ruler
        .style({
          'width': (this.config.width + 6) + 'px',
          'height': (this.config.rulerHeight + 2) + 'px'
        });

      this.$axis.call(rulerAxis);

      this.$axis.selectAll('text')
        .attr('x', 0)
        .attr('y', -12 * ApplicationConfiguration.zoomFactor)
        .style('text-anchor', 'middle');

    } else {
      this.$ruler
        .style({
          'width': (this.config.rulerHeight + 25) + 'px',
          'height': (this.config.height + 1) + 'px'
        });

      this.$axis.call(rulerAxis);

      this.$axis.selectAll('text')
        .attr('x', -13 * ApplicationConfiguration.zoomFactor)
        .attr('y', 0)
        .style('text-anchor', 'end');
    }
  }

  private updateChangeBorders() {
    this.updateSegments();
    this.updateDraggable('act');
    this.updateDraggable('pos');
  }

  private updateSegments() {
    if (this.config.interactiveSegments === false) { return; }

    var that = this,
      positions = that.config.changeBorder.absPositions,
      segments = d3.pairs(positions);

    var $segments = that.$root.selectAll('.segments')
      .data(segments);

    $segments.enter()
      .append('div')
      .classed('segments', true)
      .style('background-color', (d, i) => that.color(i))
      .on('click', function (d) {
        var index = d3.select(this).attr('data-index');

        // toggle visibility
        that.$popover.style('display', (that.$popoverSelect.attr('data-index') === index && that.$popover.style('display') === 'block') ? null : 'block');

        // set display: block first to get client rect
        var rect = that.$popover.node().getBoundingClientRect();

        that.$popover.style({
          'left': (d3.event.x - rect.width) + 'px',
          'top': that.config.rulerHeight + 'px'
        });

        var vSeg = index,
          hSeg = '*'; // TODO assume any representation for hSeg so far
        var segRep = that.changeBorder.getSegmentRepById(hSeg, vSeg);

        var $options = that.$popoverSelect.selectAll('option');
        $options.each((d, i) => {
          if (d === segRep.visConfigId) {
            that.$popoverSelect.node()['selectedIndex'] = i;
          }
        });

        that.$popoverSelect.attr('data-index', index);
      });

    $segments
      .attr('data-index', (d, i) => i)
      .style(that.config.styleSegmentSize, 20)
      .style(that.config.styleSegmentStart, (d) => d[0] + 'px')
      .style(that.config.styleSegmentEnd, (d) => d[1] - d[0] + 'px');

    $segments.exit().remove();
  }

  private updateDraggable(cssClass) {
    var that = this,
      positions = that.config.changeBorder.absPositions;

    var drag = d3.behavior.drag()
      .on('dragstart', function () {
        that.changeBorder.dragStart(that.config.changeBorder, that.config.orientation);
      })
      .on('drag', function () {
        var index = d3.select(this).attr('data-index');
        if (cssClass === 'act') {
          that.config.changeBorder.updateActivityByAbsPos(index, d3.select(this).datum() + d3.event[that.config.d3MouseDeltaEvent]);
        } else {
          that.config.changeBorder.updateRelPosByAbsPos(index, d3.select(this).datum() + d3.event[that.config.d3MouseDeltaEvent]);
        }
        that.changeBorder.drag(that.config.changeBorder, that.config.orientation);
      })
      .on('dragend', function () {
        that.changeBorder.dragEnd(that.config.changeBorder, that.config.orientation);
        if (cssClass === 'pos') {
          that.config.changeBorder.calculateRelPosFactors();
        }
      });

    var $draggable = that.$root.selectAll('.' + cssClass)
      .data(positions.filter((d) => {
        return (d !== 0 &&
          that.config.changeBorder.posToAct(d) !== 1 &&
          d !== that.config[that.config.styleSegmentEnd]);
      }));

    $draggable.enter()
      .append('div')
      .classed('draggable', true)
      .classed(cssClass, true)
      .call(drag)
      .append('span');

    $draggable
      .attr('data-index', (d, i) => i + 1) // i+1 because we skipped [0] = 0
      .style(that.config.styleSegmentStart, (d) => d + 'px');

    if (cssClass === 'act') {
      if (this.config.orientation === 'horizontal') {
        $draggable.style(that.config.styleSegmentEnd2, -that.changeBorder.horizontal.marginStart + 'px');
      } else {
        $draggable.style(that.config.styleSegmentEnd2, -that.changeBorder.vertical.marginStart + 'px');
      }
    }


    $draggable.exit().remove();
  }

}

class RulerConfiguration {
  public interactiveSegments = false;
  public orientation = ''; // vertical || horizontal
  public width = 0;
  public height = 0;
  public changeBorder: AChangeBorder;

  get rulerHeight() {
    var val = 30;
    if (ApplicationConfiguration.zoomFactor > 1) {
      val = (this.orientation === 'horizontal') ? 64 : 86;
    }
    return val;//(this.orientation === 'horizontal') ? 30 : 30 * ApplicationConfiguration.zoomFactor;
  }

  get d3event() {
    return (this.orientation === 'horizontal') ? 'x' : 'y';
  }

  get d3MouseDeltaEvent() {
    return (this.orientation === 'horizontal') ? 'dx' : 'dy';
  }

  get styleSegmentStart() {
    return (this.orientation === 'horizontal') ? 'left' : 'top';
  }

  get styleSegmentEnd() {
    return (this.orientation === 'horizontal') ? 'width' : 'height';
  }

  get styleSegmentEnd2() {
    return (this.orientation === 'horizontal') ? 'bottom' : 'right';
  }

  get styleSegmentSize() {
    return (this.orientation === 'horizontal') ? 'height' : 'width';
  }

  get d3AxisOrient() {
    return (this.orientation === 'horizontal') ? 'top' : 'left';
  }

  get d3AxisFormat() {
    return (this.orientation === 'horizontal') ? d3.format('.0') : d3.format('%');
  }
}

export default angular.module('directives.pvdChangeBorderRuler', [
  WindowResize,
  ChangeBorderService,
  DataSelection
])
  .directive('pvdChangeBorderRuler', function (
    pvdWindowResize: PVDWindowResize,
    $timeout,
    pvdChangeBorder: PVDChangeBorder,
    pvdDataSelection: PVDDataSelection
  ) {
    return {
      controller: function ($scope) {
      },
      compile: function (element, attrs: any) {
        attrs.interactiveSegments = angular.isDefined(attrs.interactiveSegments) ? attrs.interactiveSegments : false;

        return function ($scope, element) {
          $timeout(() => { //skip one time to ensure that the svg is properly layouted
            var $base = d3.select(element[0]);

            var $root: d3.Selection = $base.append('div')
              .classed('change-border-ruler', true)
              .classed(attrs.orientation, true);

            var config = new RulerConfiguration();
            config.orientation = attrs.orientation;
            config.interactiveSegments = attrs.interactiveSegments;

            if (config.orientation === 'horizontal') {
              config.width = parseInt(d3.select($root.node().parentNode).style('width'));
              config.height = window.innerHeight;
              config.changeBorder = pvdChangeBorder.vertical;

            } else {
              config.width = parseInt(d3.select($root.node().parentNode).style('width'));
              config.height = window.innerHeight;
              config.changeBorder = pvdChangeBorder.horizontal;
            }

            new ChangeBorderRuler($root, config, pvdChangeBorder, pvdWindowResize, pvdDataSelection);
          });
        }
      },
      scope: {
        'interactiveSegments': '@?', // true || false (default)
        'orientation': '@?' // vertical || horizontal
      },
      restrict: 'E'
    };
  })
  .name; // name for export default
