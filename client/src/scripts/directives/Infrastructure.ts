import * as angular from '@bower_components/angular';
import * as d3 from '@bower_components/d3/d3';
import { TimedParentValue } from '../models/Timed';
import Animator, { createStepper, PVDAnimator, IAnimateable } from '../services/Animator';
import { valueList, IAttribute } from '../models/Models';
import { Edge, Node, ExternalNode as ModelsExternalNode, converToCSSClass, Infrastructure } from '../models/Infrastructure';
import { tooltip } from './VisUtils';
import InfrastructureLoader, { PVDInfrastructureLoader } from '../services/InfrastructureLoader';
import DataSelection, { PVDSelection, PVDDataSelection } from '../services/DataSelection';

'use strict';

interface IVisualNode {
  /**
   * Node to visualize
   */
  node: Node;

  /**
   * Parent IVisualNode
   */
  parent: IVisualNode;

  /**
   * Attach the visual representation to this root
   */
  $root: d3.Selection;

  /**
   * The index of ordered elements per level must be set from outside
   */
  siblingsIndex: number;

  /**
   * The total number of siblings (in the same level)
   */
  siblingsTotal: number;

  /**
   * Update visual representation on value change
   */
  update();

  /**
   * Get the position for edges for a certain segement (index) according to the total number of segments
   * @param index
   * @param total
   */
  getOutgoingPoint(current: number, total: number): Point;

  /**
   * Get the position for edges for a certain segement (index) according to the total number of segments
   * @param index
   * @param total
   */
  getIncomingPoint(current: number, total: number): Point;

}


export class ExternalNode implements IVisualNode {

  public siblingsIndex: number = 0;
  public siblingsTotal: number = 0;

  public radius: number = 25;
  public halfInnerRadius: number = 0;

  private _startAngle: number = 0; // in rad
  private _endAngle: number = 2 * Math.PI; // in rad

  constructor(public node: ModelsExternalNode, public parent: IVisualNode, public $root: d3.Selection) {
    this.update();
  }

  public getOutgoingPoint(current: number, total: number): Point {
    return new Point(0, 0);
  }

  public getIncomingPoint(current: number, total: number): Point {
    return new Point(0, 0);
  }

  get startAngle(): number {
    return this._startAngle;
  }

  get endAngle(): number {
    return this._endAngle;
  }

  public update() {
    this.draw();
  }

  draw() {
    var that = this;

    var hub = this.$root.append('circle')
      .attr('class', 'infra-hub')
      .attr('r', this.radius)
      .attr('cx', 0)
      .attr('cy', 0)
      .attr('fill', '#222');

    /*
    hub.on('mouseover', function () {
      tooltip().mouseover(that.node.name);
    })
    .on('mousemove', function () {
      tooltip().mousemove();
    })
    .on('mouseout', function () {
      tooltip().mouseout();
    });
    */
    hub.call(tooltip(this.node.name));

  }
}

class RectangleNode implements IVisualNode {

  public siblingsIndex: number = 0;
  public siblingsTotal: number = 0;

  private _level = 1;

  private _rect: Rect = new Rect();
  private _d3UpdateSel: d3.UpdateSelection;

  constructor(public node: Node, public parent: IVisualNode, public $root: d3.Selection, public colors: d3.Scale.OrdinalScale) {
    this._level = node.level;
    //this.update(); // call manually on object creation
  }

  getOutgoingPoint(current: number, total: number): Point {
    var point = new Point();
    var segmentWidth = this._rect.width / total;
    // get the centered x of the segment
    point.x = this._rect.x + (segmentWidth * current) + (segmentWidth * 0.5);
    point.y = this._rect.y;
    return point;
  }

  getIncomingPoint(current: number, total: number): Point {
    var point = new Point();
    var segmentWidth = this._rect.width / total;
    // get the centered x of the segment
    point.x = this._rect.x + (segmentWidth * current) + (segmentWidth * 0.5);
    point.y = this._rect.y + this._rect.height;
    return point;
  }

  update() {
    this._rect.width = 20;
    this._rect.height = 10;
    this._rect.x = (this._rect.width + 10) * this.siblingsIndex;
    this._rect.y = (this._rect.height + 10) * this._level * -1;

    this.draw();
  }

  draw() {
    var that = this;

    this._d3UpdateSel = this.$root
      .selectAll('.' + converToCSSClass(this.node.fqIname))
      .data([this._rect]);

    this._d3UpdateSel
      .enter()
      .append('rect')
      .attr('class', converToCSSClass(this.node.fqIname))
      .attr('fill', function (d, i) { return that.colors(that.siblingsIndex); })
      .call(d3.behavior.drag().on('drag', function () {
        that._rect.x += d3.event.dx;
        //that._rect.y += d3.event.dy;

        d3.select(this)
          .attr('x', that._rect.x);
        //.attr('y', that._rect.y);
      }));

    // append Tooltip if given
    this._d3UpdateSel.call(tooltip(this.node.name));
    /*        .on('mouseover', function () {
              tooltip().mouseover(that.node.name);
            })
            .on('mousemove', function () {
              tooltip().mousemove();
            })
            .on('mouseout', function () {
              tooltip().mouseout();
            });
    */

    this._d3UpdateSel.transition()
      .attr('x', function (d) { return d.x; })
      .attr('y', function (d) { return d.y; })
      .attr('width', function (d) { return d.width; })
      .attr('height', function (d) { return d.height; });

    // remove the old nodes
    this._d3UpdateSel.exit().remove();
  }

}

class ArcNode implements IVisualNode {

  public siblingsIndex: number = 0; // related to parent
  public siblingsTotal: number = 0; // related to parent

  private _level: number = 1;
  private _width: number = 25;
  private _innerRadius: number = 80;
  private _outerRadius: number = 80;

  private _plainStartAngle: number = 0; // in rad
  private _plainEndAngle: number = 2 * Math.PI; // in rad

  private _rotation: number = 0; // in rad

  //private _d3arc:d3.Svg.Arc = d3.svg.arc();
  private _arc: Arc;
  private _d3UpdateSel: d3.UpdateSelection;

  constructor(public node: Node, public parent: IVisualNode, public $root: d3.Selection, public colors: d3.Scale.OrdinalScale) {
    this._level = node.level;
    this._arc = new Arc(this._level);
    //this.update(); // call manually on object creation
  }

  getOutgoingPoint(current: number, total: number): Point {
    var point: Point = new Point();
    var arcOffset: number = -(Math.PI * 0.5); // defined by d3.svg.arc
    //var radius = (this._arc.innerRadius + this._arc.outerRadius) / 2; // from d3.svg.arc.centroid
    var angle = (this._arc.endAngle - this._arc.startAngle) * ((total - current) / total) + this._arc.startAngle + arcOffset;

    point.x = Math.cos(angle) * this._arc.outerRadius;
    point.y = Math.sin(angle) * this._arc.outerRadius;

    return point;
  }

  getIncomingPoint(current: number, total: number): Point {
    var point: Point = new Point();
    var arcOffset: number = -(Math.PI * 0.5); // defined by d3.svg.arc
    //var radius = (this._arc.innerRadius + this._arc.outerRadius) / 2; // from d3.svg.arc.centroid
    var angle = (this._arc.endAngle - this._arc.startAngle) * ((total - current) / total) + this._arc.startAngle + arcOffset;

    point.x = Math.cos(angle) * this._arc.innerRadius;
    point.y = Math.sin(angle) * this._arc.innerRadius;

    return point;
  }

  get startAngle(): number {
    return this._arc.startAngle;
  }

  get endAngle(): number {
    return this._arc.endAngle;
  }

  update() {
    this._arc.innerRadius = this._innerRadius;
    this._arc.outerRadius = this._outerRadius;
    this._arc.startAngle = this._plainStartAngle;
    this._arc.endAngle = this._plainEndAngle;

    this.draw();
  }

  draw() {
    var that = this;
    var parent = <ArcNode>that.parent;

    function transformAndPath(d: any) {
      that._plainStartAngle = parent.startAngle;
      that._plainEndAngle = (parent.endAngle - parent.startAngle) / (that.siblingsTotal + 1); // + 1 because siblingsIndex === siblingsTotal, but siblingsTotal must be greater

      that._rotation = that._plainEndAngle * that.siblingsIndex;
      that._rotation = (isNaN(that._rotation) === true) ? 0 : that._rotation;

      that._arc.startAngle = that._plainStartAngle + that._rotation;
      that._arc.endAngle = that._plainStartAngle + that._plainEndAngle + that._rotation;

      d3.select(this)
        .attr('d', that._arc.d3arc(d))
        .attr('data-rot', that._rotation)
        .attr('data-rot-start', that._arc.startAngle)
        .attr('data-rot-end', that._arc.endAngle);
    }

    this._d3UpdateSel = this.$root
      .selectAll('.' + converToCSSClass(this.node.fqIname))
      .data([this.node]);

    // update the new nodes
    this._d3UpdateSel.enter().append('path')
      .attr('id', function () { return converToCSSClass(that.node.fqIname); })
      .attr('class', function () { return 'infra-node'; })
      .attr('fill', function () { return that.colors(that.siblingsIndex); })
      .each(transformAndPath)
      .call(tooltip(this.node.name))
      //.on('mouseover', function() { tooltip().mouseover(that.node.name); })
      //.on('mousemove', function() { tooltip().mousemove(); })
      //.on('mouseout', function() { tooltip().mouseout(); })
      .call(d3.behavior.drag()
        .on('drag', function (d) {
          var rotation = that.radToDeg(that._rotation);
          rotation += d3.event.dx;
          if (rotation <= -360 || rotation >= 360) { rotation = 0; }

          that._rotation = that.degToRad(rotation);

          that._arc.startAngle = that._plainStartAngle + that._rotation;
          that._arc.endAngle = that._plainEndAngle + that._plainEndAngle + that._rotation;

          d3.select(this)
            .attr('data-rot', that._rotation)
            .attr('transform', 'rotate(' + rotation + ')');
        })
      );

    // remove the old nodes
    this._d3UpdateSel.exit().remove();
  }


  private degToRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  private radToDeg(radians: number): number {
    return radians * (180 / Math.PI);
  }

}

class Rect {
  constructor(public width: number = 0, public height: number = 0, public x: number = 0, public y: number = 0) {

  }

  toString(): string {
    return this.x + ',' + this.y + ';' + this.width + 'x' + this.height;
  }
}

class Point {
  constructor(public x: number = 0, public y: number = 0) {

  }

  toString(): string {
    return this.x + ',' + this.y;
  }
}

class Arc {
  private _level = 1;
  private _width = 25;
  private _innerRadius = 80;
  private _outerRadius = 80;
  private _startAngle = 0;
  private _endAngle = 2 * Math.PI;

  private _d3arc: d3.Svg.Arc = d3.svg.arc();

  constructor(public level: number = 1) {
    this._level = level;
    this.updateD3Arc();
  }

  get innerRadius(): number {
    //return this._innerRadius;
    return (<any>this._d3arc).innerRadius()();
  }

  set innerRadius(value: number) {
    this._innerRadius = value;
    this.updateD3Arc();
  }

  // the width from ring to ring is minus the arcWidth
  get halfInnerRadius(): number {
    return (this.innerRadius - this.width) * 0.5;
  }

  get outerRadius(): number {
    //return this._outerRadius;
    return (<any>this._d3arc).outerRadius()();
  }

  set outerRadius(value: number) {
    this._outerRadius = value;
    this.updateD3Arc();
  }

  get width(): number {
    return this._width;
  }

  set width(value: number) {
    this._width = value;
    this.updateD3Arc();
  }

  get startAngle(): number {
    //return this._startAngle;
    return (<any>this._d3arc).startAngle()();
  }

  set startAngle(value: number) {
    this._startAngle = value;
    this.updateD3Arc();
  }

  get endAngle(): number {
    //return this._endAngle;
    return (<any>this._d3arc).endAngle()();
  }

  set endAngle(value: number) {
    this._endAngle = value;
    this.updateD3Arc();
  }

  get centroid(): number[] {
    return this._d3arc.centroid(this._d3arc);
  }

  get d3arc(): d3.Svg.Arc {
    return this._d3arc;
  }

  updateD3Arc() {
    this.d3arc
      .innerRadius(this._level * this._innerRadius)
      .outerRadius(this._level * this._outerRadius + this._width)
      .startAngle(this._startAngle)
      .endAngle(this._endAngle);
  }
}


export class PVDInfrastructure implements IAnimateable {

  // custom flags
  private _debugEdgeRouting: Boolean = false;
  private _useLogicalStructureForEdges: Boolean = false;

  private _visualNodesMap: d3.Map<IVisualNode> = d3.map();
  private _attrList: IAttribute<any>[] = [];

  private _colors: d3.Scale.OrdinalScale = d3.scale.category20();
  private _edgeScale: d3.Scale.LogScale = d3.scale.log().range([1, 5]);
  private _lineFunc: d3.Svg.Line;

  private $translation: d3.Selection;
  private $links: d3.Selection;

  constructor(private $svg: d3.Selection, private nodes: Node[], private pvdDataSelection: PVDDataSelection) {
    this._lineFunc = d3.svg.line()
      .x(function (d) { return d.x; })
      .y(function (d) { return d.y; })
      .interpolate('basis'); // basis || linear

    // translate for testing RectangleNodes
    this.$translation = this.$svg;//.append('g').attr('transform', 'translate(-300,0)');

    //this.drawNodeArcs();
    this.createAttrList(); //already here to have the external node included

    this.drawBgArcs();
    this.drawVisualNodes();

    // add links on top for debugging
    if (this._debugEdgeRouting) {
      this.$links = this.$translation.append('g').attr('id', 'infra-links');
    }
  }

  private drawBgArcs(): void {
    var that: PVDInfrastructure = this;
    var $bgArcs: d3.Selection = this.$svg.append('g').attr('id', 'infra-bg-arcs');
    var level: boolean[] = [];

    that.nodes.forEach((node) => {
      if (level[node.level] === undefined) {
        var arc: Arc = new Arc(node.level);
        $bgArcs.append('path').attr('d', arc.d3arc);
        level[node.level] = true;
      }
    });

    // external hub
    var $root: d3.Selection = $bgArcs.append('g').attr('id', 'hub');
    var externalNode: ExternalNode = new ExternalNode(<ModelsExternalNode>this.nodes.splice(this.nodes.length - 1, 1)[0], null, $root);
    this._visualNodesMap.set(externalNode.node.fqIname, externalNode);
  }

  private drawVisualNodes(): void {
    var that: PVDInfrastructure = this;
    var $root: d3.Selection = this.$translation.append('g').attr('id', 'infra-visual-nodes');
    var currVisualNode: IVisualNode;
    var siblingsCounterByNode: Object = {};
    var fqname: any = '';

    this.nodes.forEach(function (d, i) {
      fqname = (d.parent === undefined || d.parent === null) ? 'external' : d.parent.fqIname;
      siblingsCounterByNode[fqname] = (siblingsCounterByNode[fqname] == undefined) ? 0 : siblingsCounterByNode[fqname] + 1;

      currVisualNode = new ArcNode(d, that._visualNodesMap.get(fqname), $root, that._colors);

      currVisualNode.siblingsTotal = (d.parent === null) ? 0 : d.parent.children().length - 1;
      currVisualNode.siblingsIndex = siblingsCounterByNode[fqname];

      that._visualNodesMap.set(d.fqIname, currVisualNode);
      currVisualNode.update();
    });
  }

  createAttrList(): void {
    if (!this._debugEdgeRouting) {
      this.$links = this.$translation.append('g').attr('id', 'infra-links');
    }

    var that: PVDInfrastructure = this;
    var attrName = 'numConnections';

    this.nodes.forEach(function (node) {
      node.outgoingEdges().forEach(function (edge) {
        that._attrList.push(edge.getAttr(attrName));
      });
    });

    //console.log(that._attrList);
  }


  layout(dt: number, now: number): any {
    return null;
  }

  update(dt: number, now: number): void {
    //console.log('update infrastructure', dt, now);
    var that: PVDInfrastructure = this;

    var selection: PVDSelection = this.pvdDataSelection.getSelection(now),
      back = 5000, // in ms (use this if selection.start == Infinity)
      from = (selection.hasDefinedStart == true) ? selection.start : selection.end - back, // in ms
      to = selection.end, // in ms
      step = createStepper(1000); // in ms

    var freqList: TimedParentValue<number, IAttribute<any>>[] = valueList(that._attrList, from, to, step);
    //console.log(freqList[0].ts, freqList[freqList.length-1].ts);
    //console.log(freqList);

    that.calculateEdgeScale(freqList);

    function getPosition(timedValue: any) {
      var $e = d3.select(this);

      var edge: Edge = <Edge>timedValue.parent.parent;
      var total: number = to - from;
      var current: number = to - timedValue.ts;
      var controlPoints = [];

      var srcPoint = (<IVisualNode>that._visualNodesMap.get(edge.src.fqIname)).getOutgoingPoint(current, total);
      controlPoints.push({ x: srcPoint.x, y: srcPoint.y });

      if (that._useLogicalStructureForEdges) {
        var srcFqname = edge.src.fqIname.split('.'),
          dstFqname = edge.dst.fqIname.split('.').reverse(), // reverse order to get center first
          newFqname = '',
          visualNode = null,
          midPoint = null;

        for (var i = 1; i < srcFqname.length; i++) {
          newFqname = srcFqname.slice(i, srcFqname.length).join('.');
          visualNode = (<IVisualNode>that._visualNodesMap.get(newFqname));

          // incoming
          midPoint = visualNode.getIncomingPoint(current, total);
          controlPoints.push({ x: midPoint.x, y: midPoint.y });

          // outgoing
          midPoint = visualNode.getOutgoingPoint(current, total);
          controlPoints.push({ x: midPoint.x, y: midPoint.y });
        }

        var lastFqName = newFqname;

        for (var i = 1; i < dstFqname.length; i++) {
          newFqname = dstFqname.slice(0, i).reverse().join('.');

          // skip if last src node and first dst node are equal
          if (lastFqName == newFqname) {
            continue;
          }

          visualNode = (<IVisualNode>that._visualNodesMap.get(newFqname));

          // incoming
          midPoint = visualNode.getIncomingPoint(current, total);
          controlPoints.push({ x: midPoint.x, y: midPoint.y });

          // outgoing
          midPoint = visualNode.getOutgoingPoint(current, total);
          controlPoints.push({ x: midPoint.x, y: midPoint.y });
        }


      }
      var dstPoint = (<IVisualNode>that._visualNodesMap.get(edge.dst.fqIname)).getIncomingPoint(current, total);
      controlPoints.push({ x: dstPoint.x, y: dstPoint.y });

      //console.log(edge.fqIname, controlPoints);

      $e.transition()
        .attr('d', that._lineFunc(controlPoints))
        .style('stroke-width', that._edgeScale(timedValue.v));
    }

    var $edges = this.$links.selectAll('path')
      .data(freqList, function (d) {
        // cut last 4 digits of ts off (e.g. 1365581357734.246 to 136558135773[4.246]),
        // because the last numbers might change on every update() and make the key invalid (not unique)
        // add the value of the edge to distinguish instead
        return d.parent.parent.fqIname + '_' + Math.floor(d.ts * 0.1) + '_' + d.v;
      });

    // add new elements
    $edges.enter().append('path')
      .attr('class', function () { return 'infra-link'; })
      .style('stroke-width', 0)
      .style('stroke', function () { return (that._debugEdgeRouting) ? 'red' : null; })
      .call(tooltip((d: any) => { return d.parent.parent.fqIname + '<br>numConnections = ' + d.v; }))
      //.on('mouseover', function(d) { tooltip().mouseover(d.parent.parent.fqIname + '<br>numConnections = ' + d.v); })
      //.on('mousemove', function() { tooltip().mousemove(); })
      //.on('mouseout', function() { tooltip().mouseout(); })
      .each(getPosition);

    // update existing elements
    $edges
      .attr('data-ts', function (d) { return d.ts; })
      .attr('data-fqname', function (d) { return d.parent.fqIname; })
      .each(getPosition);

    // remove the old elements
    $edges.exit()
      .transition()
      .style('stroke-width', 0)
      .remove();

    //console.log('===============');
  }

  calculateEdgeScale(freqList: TimedParentValue<number, IAttribute<any>>[]): void {
    var highest = Number.NEGATIVE_INFINITY;
    var lowest = Number.POSITIVE_INFINITY;

    for (var i = freqList.length - 1; i >= 0; i--) {
      highest = Math.max(highest, freqList[i].v);
      lowest = Math.min(lowest, freqList[i].v);
    }

    this._edgeScale.domain([lowest, highest]);
  }
}

export default angular.module('directives.pvdInfrastructure2', [
  Animator,
  DataSelection,
  InfrastructureLoader
])
  .directive('pvdInfrastructure2', function (
    pvdAnimator: PVDAnimator,
    pvdDataSelection: PVDDataSelection,
    pvdInfrastructureLoader: PVDInfrastructureLoader,
    $timeout
  ) {
    function initVis($base: d3.Selection, nodes: Node[]) {
      // size of the svg element
      var margin = { top: 10, right: 10, bottom: 10, left: 10 },
        width = angular.element('.container').width() - margin.left - margin.right,
        height = 800 - margin.top - margin.bottom;

      var $root = $base.append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')')
        .append('g')
        // the scale sets the svg behavior to a cartesian coordinate system
        .attr('transform', 'translate(' + width * 0.5 + ',' + height * 0.5 + ') scale(1,-1)');

      pvdAnimator.push(new PVDInfrastructure($root, nodes, pvdDataSelection));
    }

    return {
      controller: function ($scope) {
      },
      compile: function (element, attrs) {
        return function ($scope, element) {
          pvdInfrastructureLoader.get().then((infrastructure: Infrastructure) => {
            $timeout(() => { //skip one time to ensure that the svg is properly layouted
              //var path:string = $scope.path;
              //var attr = infrastructure.findAttr(path);
              var $base = d3.select(element[0]);
              $scope.$base = $base;
              initVis($base, infrastructure.nodes());
            })
          });
        }
      },
      scope: {
      },
      restrict: 'E'
    };
  })
  .name; // name for export default

