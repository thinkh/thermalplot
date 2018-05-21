/**
 * Created by Samuel Gratzl on 28.08.2014.
 */
import * as angular from '@bower_components/angular';
import * as d3 from '@bower_components/d3/d3';
import Animator, { PVDAnimator } from '../services/Animator';
import { nextID, onDelete } from './VisUtils';
import DataSelection, { PVDDataSelection, PVDSelection } from '../services/DataSelection';

/**
 * a simple animation control directive for pausing / resuming the animator and showing the current time
 */

function createIncDec($svg: d3.Selection, shift: number, label: string, labelWidth: number, f: (delta) => any) {
  var $binedit = $svg.append('g').attr('class', 'binui').attr('transform', 'translate(' + shift + ',10)');
  $binedit.append('text').text('\uf068').data([-1]).attr({
    x: -labelWidth, 'class': 'fat'
  }).on('click', f);
  var $text = $binedit.append('text').text(label).attr({
    x: 0
  });
  $binedit.append('text').text('\uf067').data([+1]).attr({
    x: labelWidth + 2, 'class': 'fat'
  }).on('click', f);
  return $text;
}

function utc(utc: number) {
  var r = new Date();
  r.setTime(utc);
  return r;
}

var timescales = [
  { //every month
    summary: d3.time.format.utc('%Y'),
    tick: d3.time.format.utc('%Y-%m'),
    scale: 15 * 1000 * 60 * 60 * 24 * 30,
    ticks: 15
  },
  { //every 2 weeks
    summary: d3.time.format.utc('%Y-%m'),
    tick: d3.time.format.utc('%m-%d'),
    scale: 15 * 1000 * 60 * 60 * 24 * 7 * 2,
    ticks: 15
  },
  { //every week
    summary: d3.time.format.utc('%Y-%m'),
    tick: d3.time.format.utc('%m-%d'),
    scale: 15 * 1000 * 60 * 60 * 24 * 7,
    ticks: 15
  },
  { //every day
    summary: d3.time.format.utc('%Y-%m-%d'),
    tick: d3.time.format.utc('%d'),
    scale: 15 * 1000 * 60 * 60 * 24,
    ticks: 15
  },
  { //every 12h
    summary: d3.time.format.utc('%Y-%m-%d'),
    tick: d3.time.format.utc('%d %H'),
    scale: 15 * 1000 * 60 * 60 * 12,
    ticks: 15
  },
  { //every 6h
    summary: d3.time.format.utc('%Y-%m-%d'),
    tick: d3.time.format.utc('%d %H'),
    scale: 15 * 1000 * 60 * 60 * 6,
    ticks: 15
  },
  { //every 3h
    summary: d3.time.format.utc('%Y-%m-%d'),
    tick: d3.time.format.utc('%H'),
    scale: 15 * 1000 * 60 * 60 * 3,
    ticks: 15
  },
  { //every hour
    summary: d3.time.format.utc('%Y-%m-%d'),
    tick: d3.time.format.utc('%H'),
    scale: 15 * 1000 * 60 * 60,
    ticks: 15
  },
  { //every 30 min
    summary: d3.time.format.utc('%Y-%m-%d'),
    tick: d3.time.format.utc('%H:%M'),
    scale: 15 * 1000 * 60 * 30,
    ticks: 15
  },
  { //every minute
    summary: d3.time.format.utc('%Y-%m-%d'),
    tick: d3.time.format.utc('%H:%M'),
    scale: 15 * 1000 * 60,
    ticks: 15
  },
  { //every 30 seconds
    summary: d3.time.format.utc('%Y-%m-%d %H:%M'),
    tick: d3.time.format.utc('%M:%s'),
    scale: 15 * 1000 * 30,
    ticks: 15
  },
  { //every 10 seconds
    summary: d3.time.format.utc('%Y-%m-%d %H:%M'),
    tick: d3.time.format.utc('%s'),
    scale: 15 * 1000 * 10,
    ticks: 15
  },
  { //every 5 seconds
    summary: d3.time.format.utc('%Y-%m-%d %H:%M'),
    tick: d3.time.format.utc('%s'),
    scale: 15 * 1000 * 5,
    ticks: 15
  },
  { //every second 15 seconds
    summary: d3.time.format.utc('%Y-%m-%d %H:%M'),
    tick: d3.time.format.utc('%s'),
    scale: 15 * 1000,
    ticks: 15
  }
];

function timeControl($svg: d3.Selection, pvdAnimator: PVDAnimator, pvdDataSelection: PVDDataSelection) {
  var timescale = timescales[9],
    now = 0,
    interacting = false;

  var scale = (<any>d3).time.scale.utc();
  scale.range([0, +$svg.attr('width') - 45]);
  scale.nice(timescale.ticks);

  var $text = $svg.append('text').attr({
    x: 0,
    y: 8,
    'class': 'date'
  });
  var $timeline = $svg.append('g').attr('transform', 'translate(15,0)');
  var $axis = $timeline.append('g').attr('transform', 'translate(0,20)');
  var axis = d3.svg.axis().scale(scale).orient('bottom')
    .tickFormat(timescale.tick);
  var brush = d3.svg.brush().x(scale)
    .on('brush', () => {
      if (brush.empty()) {
        pvdDataSelection.resetSelection();
      } else {
        var r: number[] = brush.extent();
        if (pvdDataSelection.isPinned) {
          pvdDataSelection.setPinnedSelection(r[1], r[1] - r[0], 0);
        } else {
          pvdDataSelection.setRelativeSelection(r[1] - now, r[1] - r[0]);
        }
      }
    })
    .on('brushstart', () => {
      pvdDataSelection.interacting = true;
    })
    .on('brushend', () => {
      pvdDataSelection.interacting = false;
    });

  var $root = $timeline.append('g').attr('class', 'brush');
  $root.call(brush);
  $root.selectAll('rect').attr({
    y: 14,
    height: 12
  });
  var $bins = $timeline.append('g').attr('class', 'bins');
  var $numbins = createIncDec($svg, 130, pvdDataSelection.steps + ' bins', 24, (delta) => {
    pvdDataSelection.steps = Math.max(1, pvdDataSelection.steps + delta);
    $numbins.text(pvdDataSelection.steps + ' bins');
  });
  var changeTimeScale = (delta) => {
    var act = Math.min(timescales.length - 1, Math.max(0, timescales.indexOf(timescale) + delta));
    timescale = timescales[act];
    scale.nice(timescale.ticks);
    axis.tickFormat(timescale.tick);
  };
  createIncDec($svg, 210, 'time scale', 33, changeTimeScale);
  function updateSelection(sel: PVDSelection) {
    var d = [];
    for (var i = 1; i < sel.steps; i += 1) {
      d.push(i);
    }
    var wi = (scale(sel.point) - scale(sel.start)) / sel.steps;
    var $r = $bins.attr('transform', 'translate(' + scale(sel.start) + ',15)').selectAll('line').data(d);
    $r.enter().append('line').attr({
      y2: 10
    });
    $r.exit().remove();
    $r.attr({
      x1: (di, i) => wi * (di),
      x2: (di, i) => wi * (di)
    });

    if (interacting) {
      return;
    }
    if (!sel.hasDefinedStart) {
      brush.clear();
    } else {
      brush.extent([sel.start, sel.end]);
    }
    $root.call(brush);
  }

  var id = '.time' + nextID();
  pvdDataSelection.on('change' + id, () => {
    updateSelection(pvdDataSelection.getSelection(now));
  });
  pvdDataSelection.on('interacting' + id, (_interacting: boolean) => {
    interacting = _interacting;
  });
  pvdAnimator.on('tick' + id, (dt: number, _now: number) => {
    var s = pvdDataSelection.getSelection(_now);
    now = _now;
    scale.domain([now - timescale.scale, _now]);
    if (scale(s.start) < 0) { //out of view change to higher one
      changeTimeScale(-1);
      scale.domain([now - timescale.scale, _now]);
    }
    $axis.call(axis);
    $text.text(timescale.summary(utc(_now)));
    updateSelection(s);
  });
  onDelete($svg, () => {
    pvdDataSelection.on('change' + id, null);
    pvdDataSelection.on('interacting' + id, null);
    pvdAnimator.on('tick' + id, null);
  });
}

export default angular.module('directives.pvdTimeControl', [
  Animator,
  DataSelection
])
  .directive('pvdTimeControl', function (
    $timeout,
    pvdAnimator: PVDAnimator,
    pvdDataSelection: PVDDataSelection
  ) {
    return {
      template: '<div class="timecontrol"><svg></svg></div>',
      restrict: 'E',
      link: function postLink($scope, element) {
        var $svg = d3.select(element[0]).select('svg').attr({
          width: 630,
          height: 40,
          transform: 'translate(10,0)'
        });
        timeControl($svg, pvdAnimator, pvdDataSelection);
      }
    };
  })
  .name; // name for export default
