/**
 * Created by Samuel Gratzl on 17.04.2014.
 */
import * as angular from 'angular';
import * as d3 from 'd3';
import { getDimension, nextID, onDelete, IColorer, defaultColorer, createNormalizer, tsNormalizer, INormalizer } from '../VisUtils';
import { IAnimateable, createStepper, PVDAnimator } from '../../services/Animator';
import { IAttribute, CompositeAttribute } from '../../models/Models';
import { PVDInfrastructureLoader } from '../../services/InfrastructureLoader';
import { Infrastructure } from '../../models/Infrastructure';
import { PVDDataSelection, PVDSelection } from '../../services/DataSelection';

export enum ETimeLineMode {
  HEATMAP = 30, BARPLOT = 150, HORIZONPLOT = 100
}

/**
 * brush used within a timeline, which renders a brush and interacts with the PVDDataSelection service
 */
export class PVDBrush {
  private $root: d3.Selection<any>;
  private brush: d3.svg.Brush<any>;
  /**
   * currently manipulating the brush?
   * @type {boolean}
   */
  private interacting: boolean = false;

  constructor($parent: d3.Selection<any>, private pvdDataSelection: PVDDataSelection) {
    var brushScale = d3.scale.linear().range([0, getDimension($parent).width]);
    this.brush = d3.svg.brush().x(brushScale)
      .on("brush", () => this.onBrushed())
      .on("brushstart", () => {
        this.pvdDataSelection.interacting = true;
      })
      .on("brushend", () => {
        this.pvdDataSelection.interacting = false;
      });

    this.$root = $parent.append("g").attr("class", "brush");
    this.$root.call(this.brush);
    this.$root.selectAll("rect").attr("height", "100%");

    var id = nextID();
    pvdDataSelection.on("change.brush" + id, () => {
      this.onSelectionUpdate(pvdDataSelection.getSelection(this.now));
    });
    pvdDataSelection.on("interacting.brush" + id, (interacting: boolean) => {
      this.interacting = interacting;
    });
    onDelete(this.$root, () => {
      pvdDataSelection.on("change.brush" + id, null);
      pvdDataSelection.on("interacting.brush" + id, null);
    });
  }

  get timeRange() {
    return this.brush.x().domain();
  }

  get now() {
    return this.timeRange[1];
  }

  update(from: number, now: number) {
    if (this.interacting) {
      return;
    }
    this.brush.x().domain([from, now]);
    this.onSelectionUpdate(this.pvdDataSelection.getSelection(now));
  }

  private onSelectionUpdate(s: PVDSelection) {
    if (!s.hasDefinedStart) {
      this.brush.clear();
    } else {
      this.brush.extent([s.start, s.end]);
    }
    this.$root.call(this.brush);
  }

  private onBrushed() {
    var b = this.brush;
    if (b.empty()) {
      this.pvdDataSelection.resetSelection();
    } else {
      var r: any[] = b.extent();
      if (this.pvdDataSelection.isPinned) {
        this.pvdDataSelection.setPinnedSelection(r[1], r[1] - r[0]);
      } else {
        this.pvdDataSelection.setRelativeSelection(r[1] - this.now, r[1] - r[0]);
      }
    }
  }
}
/**
 * support a standard bar plot with animated time
 * time in encoding in x position
 */
export class PVDDeprecatedAttrTimeline<T> implements IAnimateable {
  private _attr: IAttribute<T>;
  private _showFrequencies: boolean;
  public mode = ETimeLineMode.BARPLOT;
  colorer: IColorer<T> = defaultColorer;
  private normalizer: INormalizer<T>;

  private $parent: d3.Selection<any>;
  private brush: PVDBrush;

  constructor(attr: IAttribute<T>, showFrequencies: boolean, $parent: d3.Selection<any>, private pvdDataSelection: PVDDataSelection, private step = createStepper(1000), public nMarkers = 20) {
    this.$parent = $parent.append("g").attr("class", "chart");
    this.setAttribute(attr, showFrequencies);

    this.brush = new PVDBrush($parent, pvdDataSelection);
    $parent.append("line").attr({
      x1: 1, y1: "100%", x2: "100%", y2: "100%"
    });
    $parent.append("line").attr({
      x1: 1, y1: 1, x2: 1, y2: "100%"
    });
  }

  setAttribute(attr: IAttribute<T>, showFrequencies: boolean) {
    this._attr = attr;
    this._showFrequencies = showFrequencies;
    this.normalizer = createNormalizer(this._attr, this._showFrequencies);
    this.redraw();
  }

  get modeLabel() {
    switch (this.mode) {
      case ETimeLineMode.BARPLOT:
        return "Bar Plot";
      case ETimeLineMode.HEATMAP:
        return "Heat Map";
      case ETimeLineMode.HORIZONPLOT:
        return "Horizon Plot";
    }
    return "";
  }

  private get markerWidth(): number {
    return 100 / this.nMarkers;
  }

  private normalize(v: T): number {
    var r = this.normalizer.normalize(v);
    if (isNaN(r) || r < 0) {
      r = 0;
    }
    return r;
  }

  private rebind(now: number, dt: number) {
    var data, start = this.step.step(now, - (this.nMarkers + 1)), d2;
    if (this._showFrequencies) {
      data = this._attr.frequencies(start, now, this.step);
    } else {
      data = this._attr.values(start, now, this.step, false);
    }
    var n = tsNormalizer(start, this.step.refStepWidth);
    this.normalizer.adapt(data, dt);
    this.normalizer.adaptEnd();
    d2 = data.map((v, i) => {
      return {
        v: v,
        p: Math.round(this.normalize(v) * 100),
        i: this.step.step(start, i),
        n: n(this.step.step(start, i))
      }
    });
    //console.log(start,d2.map(d => d.n));
    //key is the normalized time
    return this.$parent.selectAll("rect").data(d2, (d: any) => "" + d.n);
  }

  layout(dt: number, now: number): any {
    return null;
  }

  update(dt: number, now: number) {
    var $r = this.rebind(now, dt);
    this.draw($r, dt);

    this.brush.update(this.step.step(now, -this.nMarkers), now);
  }

  redraw() {
    var $r = this.$parent.selectAll("rect").data(this.$parent.selectAll("rect").data(), (d) => "" + d.n);
    this.draw($r, 0);
  }

  private drawBarplot($elem: d3.Transition<any>) {
    $elem.style("fill", null).attr("y", (v) => {
      return (100 - v.p) + "%";
    }).attr("height", (v) => {
      return v.p + "%";
    });
  }

  private drawHorizonPlot($elem: d3.Transition<any>) {
    $elem.style("fill", null).attr("y", (v) => (100 - v.p) + "%").attr("height", (v) => v.p + "%");
  }

  private drawHeatmap($elem: d3.Transition<any>) {
    $elem.style("fill", (v) => this.colorer(v.p).rgb.toString()).attr("y", "0%").attr("height", "100%");
  }

  private draw($r: d3.selection.Update<any>, dt: number) {
    var drawIt;
    switch (this.mode) {
      case ETimeLineMode.HEATMAP:
        drawIt = this.drawHeatmap;
        break;
      case ETimeLineMode.HORIZONPLOT:
        drawIt = this.drawHorizonPlot;
        break;
      default:
        drawIt = this.drawBarplot;
        break;
    }

    $r.enter()
      .append("rect")
      .attr("x", (_, i) => (i - 1) * this.markerWidth + "%")
      .attr("width", this.markerWidth + "%")
      .call((s) => drawIt.call(this, s))
      .append("title").text((v) => v.v);
    //  .each((d) => {
    //  console.log(d.n+" enter")
    //})
    $r.exit()
      //.each((d) => {
      //  console.log(d.n+" exit")
      //})
      .remove();
    //update static content
    $r.select("title").text((v) => v.v);

    //$r.each(drawValue);
    //update transition content
    /*if (dt > 0) {
      $r.transition()
        .duration(dt)
        .ease("linear")
        .attr("x", (_, i) => (i - 1) * this.markerWidth + "%")
        .call((s) => drawIt.call(this, s));
    } else*/
    {
      $r.attr("x", (_, i) => (i - 1) * this.markerWidth + "%")
        .call((s) => drawIt.call(this, s));
    }
  }
}

angular.module('pipesVsDamsApp').directive('pvdDeprecatedAttrTimeline', function (pvdAnimator: PVDAnimator, pvdDataSelection: PVDDataSelection, pvdInfrastructureLoader: PVDInfrastructureLoader, $timeout) {
  return {
    templateUrl: 'views/templates/Timeline.html',
    controller: function ($scope) {
      $scope.id = nextID();
      var modeLookup = d3.map({
        "HEATMAP": ETimeLineMode.HEATMAP,
        "BARPLOT": ETimeLineMode.BARPLOT,
        "HORIZONPLOT": ETimeLineMode.HORIZONPLOT
      });
      $scope.switchMode = function (mode) {
        var m = modeLookup.get(mode);
        $scope.timelines.forEach((t, i) => {
          t.timeline.mode = m;
          if (i === 0) {
            t.$base.select(".timeline").transition().attr("height", m)
          } else { //move detail views
            t.$base.transition().attr("transform", "translate(0," + (m + (i - 1) * (m + 20)) + ")");
            t.$base.select(".timeline").transition().attr("height", m);
          }
          t.timeline.redraw();
        });
        $scope.$base.transition().attr("height", m + (m + 20) * ($scope.timelines.length - 1));
        //pvdAnimator.update.apply(pvdAnimator,$scope.timelines.map(t => t.timeline));
      };
      $scope.selectAttr = function (attr) {
        $scope.attr = attr;
        $scope.timeline.setAttribute(attr, false);
      };
      $scope.toggleCollapse = function () {
        $scope.collapsed = !$scope.collapsed;
        var h = $scope.timeline.mode;
        if (!$scope.collapsed) {
          var $svgs = $scope.$base.select("g.detail").selectAll("g").data($scope.attr.attrs);
          $svgs.enter()
            .append("g")
            .attr("transform", (_, i) => "translate(0," + (h + i * (h + 20)) + ")")
            .call(($d) => $d.append("text").attr("width", "100%").attr("height", 20).attr("y", 15).text(attr => attr.fqIname))
            .append("svg")
            .attr("width", "100%").attr("height", h).attr("y", 20)
            .classed("timeline", true)
            .each(function (attr) {
              //create detail timeline
              var $svg = d3.select(this);
              var timeline = new PVDDeprecatedAttrTimeline(attr, $scope.frequencies === true, $svg, pvdDataSelection, $scope.step, $scope.nMarkers);
              timeline.mode = $scope.timeline.mode;
              pvdAnimator.push(timeline);
              $scope.timelines.push({
                timeline: timeline,
                $base: d3.select(this.parentNode)
              });
            });
          $scope.$base.transition().attr("height", h + (h + 20) * $scope.attr.attrs.length);
        } else {
          //remove and destroy
          var toremove = this.timelines.splice(1, this.timelines.length - 1).map(t => t.timeline);
          pvdAnimator.remove(toremove);
          /*for(var i = pvdAnimator.animatables.length-1; i >= 0; i--){
            if(toremove.indexOf(pvdAnimator.animatables[i]) >= 0){
              pvdAnimator.animatables.splice(i,1);
            }
          }*/
          toremove.forEach(r => r.destroy());
          $scope.$base.select("g.detail").transition().selectAll("*").remove();
          $scope.$base.transition().attr("height", h);
        }
      }
    },
    compile: function (element, attrs: any) {
      attrs.frequencies = angular.isDefined(attrs.frequencies) ? attrs.frequencies : false;
      attrs.width = angular.isDefined(attrs.width) ? attrs.width : "100%";
      attrs.height = angular.isDefined(attrs.height) ? attrs.height : "150";
      attrs.step = angular.isDefined(attrs.step) ? attrs.step : 1000;
      attrs.nMarkers = angular.isDefined(attrs.nMarkers) ? attrs.nMarkers : 20;
      attrs.infraId = angular.isDefined(attrs.infraId) ? attrs.infraId : '';

      function findAttrs(infrastructure: Infrastructure, path: string) {
        var p = path.split("#"), attr = p[1], regex = new RegExp(p[0]);
        var nodes = infrastructure.nodes();
        var r = new Array<IAttribute<any>>();
        if (path.indexOf("-") >= 0) { //seems to be an edge
          infrastructure.edges(nodes).forEach(edge => {
            if (regex.test(edge.fqIname) && edge.getAttr(attr)) {
              r.push(edge.getAttr(attr));
            }
          });
        } else { //node regex
          nodes.forEach(node => {
            if (regex.test(node.fqIname) && node.getAttr(attr)) {
              r.push(node.getAttr(attr));
            }
          });
        }
        return r;
      };

      function createComposite(reduce: string, attrs: IAttribute<any>[]) {
        var r = new CompositeAttribute<any>();
        r.attrs.push.apply(r.attrs, attrs);
        switch (reduce) {
          case "+":
          case "sum":
            r.reduceFrequencyInitial = r.reduceValueInitial = 0;
            r.reduceFrequency = r.reduceValue = (p, v) => isNaN(v) ? p : p + v;
            break;
          case "max":
            r.reduceFrequencyInitial = r.reduceValueInitial = 0;
            r.reduceFrequency = r.reduceValue = (p, v) => isNaN(v) ? p : Math.max(p, v);
            break;
          case "mean":
            r.reduceFrequencyInitial = r.reduceValueInitial = 0;
            r.reduceFrequency = r.reduceValue = (p, v) => isNaN(v) ? p : p + v / attrs.length;
            break;
        }
        return r;
      }

      return function ($scope: any, element) {
        pvdInfrastructureLoader.get($scope.infraId).then((infrastructure: Infrastructure) => {
          $timeout(() => { //skip one time to ensure that the svg is properly layouted
            var path: string = $scope.path, attr = null, $base;
            if ($scope.reduce) { //multi case
              var attrs = findAttrs(infrastructure, path);
              if (attrs.length > 0) {
                attr = createComposite($scope.reduce, attrs);
              }
              $scope.collapsed = true;
              $base = d3.select(element[0]).select(".timeline-chart");
              $base.select(".timeline").classed("overview", true);
              $base.append("g").classed("detail", true);
            } else { //single case
              attr = infrastructure.findAttr(path);
              $base = d3.select(element[0]).select(".timeline-chart");
            }
            $scope.$base = $base;
            if (!attr) {
              element.text("Invalid attribute path: " + path);
            } else {
              $scope.attr = attr;
              var timeline = new PVDDeprecatedAttrTimeline(attr, $scope.frequencies === true, $base.select(".timeline"), pvdDataSelection, $scope.step, $scope.nMarkers);
              pvdAnimator.push(timeline);
              $scope.timeline = timeline;
              $scope.timelines = [{
                timeline: timeline,
                $base: $base
              }];
            }
          })
        });
      }
    },
    scope: {
      'infraId': '@?', //infrastructure id
      'path': '@', //path or regex to attribute
      'frequencies': '=?', //show just the frequencies
      'step': '=?', //step size
      'reduce': '@?', //reduce function in case a composite should be shown
      'nMarkers': '=?', //number of markers
      'width': '@?', //svg width
      'height': '@?' //svg individual height
    },
    restrict: 'EA'
  }
});
