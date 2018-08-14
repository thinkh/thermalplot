/**
 * Created by Holger Stitz on 11.06.2015.
 */
import * as angular from 'angular';
import * as d3 from 'd3';
import { PVDElementParent, PVDHierarchyNode } from './HierarchyNode';
import Animator, { IAnimateable, PVDAnimator } from '../services/Animator';
import { PVDHierarchyConfig } from './HierarchyConfig';
import { nextID, onDelete, tooltip, modifyConfig } from './VisUtils';
import InfrastructureLoader, { PVDInfrastructureLoader } from '../services/InfrastructureLoader';
import InfrastructureMapper, { PVDInfrastructureMapper } from '../services/InfrastructureMapper';
import { Node, Infrastructure } from '../models/Infrastructure';
import { DeltaDOI, computeTrajectory, computeWindow, DOIFormula } from '../models/DOI';
import { IPVDLayout } from './layouts/Layout';
import WindowResize, { PVDWindowResize } from '../services/WindowResize';
import DataSelection, { PVDDataSelection, PVDSelection } from '../services/DataSelection';
import LayoutManager, { PVDLayoutManager, PVDHierarchyLayoutConfig } from '../services/LayoutManager';
import TargetHierarchy, { PVDTargetHierarchy } from '../services/TargetHierarchy';
import ChangeBorder, { PVDChangeBorder } from '../services/ChangeBorderService';

'use strict';

export class PVDThermalLineChart implements PVDElementParent, IAnimateable {

  hierarchy = {
    parent: (node) => this.parentCb(node),
    parents: (node) => this.parentsCb(node),
    hasChildren: (node) => this.hasChildrenCb(node),
    scaleFactor: (node) => this.scaleFactorCb(node),
    children: (node) => this.childrenCb(node),
    isSelected: (node) => {
      var r = this.nodesMap.get(node.fqIname);
      return r.selected || r.highlighted;
    }
  };

  private layouter_: IPVDLayout;
  private isLayoutDirty: boolean = false;

  private layoutConfig: PVDHierarchyLayoutConfig;

  private nodesMap: d3.Map<PVDHierarchyNode> = d3.map();

  private margin = { top: 20, right: 20, bottom: 30, left: 50 };

  private $svg;
  private $trajectories;
  private line;
  private time: d3.time.Scale<any, any>;
  private doi: d3.scale.Linear<any, any>;
  private items;

  private xAxis;
  private yAxis;

  // store a finger print of the current data record and check the difference
  private dataCache: d3.Map<any> = d3.map();

  constructor(private $root, private infra: Infrastructure,
    private config: PVDHierarchyConfig) {
    this.initLayout(infra);
    this.applyViewportSize();
    this.attachListener();
  }

  /**
   * Calculates a space-filling grid rectangle and
   * sets the range for the x-axis and y-axis
   */
  private applyViewportSize() {
    var that = this;

    if (that.$root !== undefined) {
      var width = that.config.gridWidth - that.config.changeBorder.vertical.marginStart;
      var height = that.config.gridHeight;

      that.$root.style({
        'width': width + 'px',
        'height': 640 + 'px'
      });

      that.time.range([0, width - that.margin.left - that.margin.right]);
      that.doi.range([610, 0]);
    }
  }

  /**
   * Attach and removes the listener for this layout
   */
  private attachListener(): void {
    var that = this;

    var id = '.thermal' + nextID();

    // window resize
    this.config.windowResize.on('change' + id, () => {
      that.config.gridWidth = parseInt(d3.select(that.$root.node().parentNode.parentNode.parentNode).style('width'));
      that.applyViewportSize();
    });

    this.config.changeBorder.on('maxsize' + id, () => {
      //that.applyViewportSize();
    });

    // select other infra
    this.config.selection.on('infra' + id,
      (newInfra: Infrastructure, oldInfra: Infrastructure) => {
        if (oldInfra !== null) {
          this.$root
            .classed('infra-' + oldInfra.id, false)
            .classed('color-' + oldInfra.color, false);
        }
        if (newInfra !== null) {
          this.$root
            .classed('infra-' + newInfra.id, true)
            .classed('color-' + newInfra.color, true);
          this.initLayout(newInfra);
        }
      }
    );

    this.config.selection.on('selectall' + id, (newNode, allNodes, oldNodes) => {
      that.$svg.classed('selection-enabled', (allNodes.length > 0));
      var items = that.$trajectories
        .selectAll('.trajectory')
        .data(that.nodesMap.values(), (d) => d.node.fqIname);
      items.classed('hg-selected', (d) => (allNodes.indexOf(d.node) > -1));
    });

    // remove listener on delete
    this.config.animator.push(this);
    onDelete(this.$root, () => {
      this.config.animator.remove(this);
      this.config.windowResize.on('change' + id, null);
      this.config.selection.on('infra' + id, null);
      this.config.changeBorder.on('maxsize' + id, null);
      this.config.selection.on('selectall' + id, null);
    });
  }

  /**
   * Init layout with current infrastructure
   * @param infra
   */
  private initLayout(infra: Infrastructure): void {
    var that = this;

    this.infra = infra;

    if (this.$root === null) {
      return;
    }

    // get first layout config, because we don't have different configs per perspective
    this.layoutConfig = this.config.layout.getFirstLayoutConfig();

    // hide tooltip after hierarchy change
    tooltip().hide();

    // delete everything
    this.$root.selectAll(':not(.hg-edge-overlay)').remove();
    this.$root
      .attr('data-infra-id', infra.id)
      .classed('infra-' + infra.id, true)
      .classed('color-' + infra.color, true)
      .on('click', function () {
        (<Event>d3.event).stopPropagation();
        that.config.selection.clearSelection();
      });

    that.nodesMap = d3.map();
    //nodes.push(that.infra.external);
    function traverse(n: Node, level) {
      if (n.children().length === 0) {
        var nodeEl = new PVDHierarchyNode(n, undefined, that.config, that);
        //nodeEl.addTimelineHighlight();
        //nodeEl.children(that.config.showInNode(nodeEl.hasNodeChildren(), node));
        //nodeEl.relayout(that.config.nodeWidth, nodeEl.scaleFactor[1] * that.config.sliceHeight);
        //nodeEl.hide();
        that.nodesMap.set(n.fqIname, nodeEl);
      } else {
        n.children().forEach((c) => traverse(c, level));
      }
    }
    traverse(that.infra.root, 0);

    that.$root = that.$root.append('svg');

    that.$svg = that.$root.append('g')
      .attr('transform', 'translate(' + that.margin.left + ',' + that.margin.top + ')');;

    that.$trajectories = that.$svg.append('g');

    that.line = d3.svg.line()
      .x((d: any /* DeltaDOI */) => this.time(d.ts))
      .y((d: any /* DeltaDOI */) => this.doi(d.doi))
      .interpolate('linear');

    that.time = d3.time.scale();

    that.xAxis = d3.svg.axis()
      .scale(this.time)
      .orient('top');

    that.$svg.append('g')
      .attr('class', 'x axis');
    //.attr('transform', 'translate(0,' + that.config.gridHeight + ')');

    //that.doi = this.config.changeBorder.vertical.d3scaleAbsPos;
    that.doi = d3.scale.linear()
      .domain(d3.extent(this.config.changeBorder.vertical.activities));

    that.yAxis = d3.svg.axis()
      .scale(that.doi)
      .orient('left');

    that.$svg.append('g')
      .attr('class', 'y axis');


    that.items = that.$trajectories
      .selectAll('.trajectory')
      .data(that.nodesMap.values(), (d) => d.node.fqIname);

    that.items.enter()
      .append('path')
      .classed('trajectory', true)
      .attr('data-fqname', (d) => d.node.fqIname)
      .on('mouseover', function (d) {
        d3.select(this).classed('hg-hover', true);
      })
      .on('mouseout', function (d) {
        d3.select(this).classed('hg-hover', false);
      })
      .on('click', function (d) {
        (<Event>d3.event).stopPropagation();
        //multi selection
        var additive = (<any>d3.event).ctrlKey || (<any>d3.event).shiftKey || (<any>d3.event).metaKey;
        var is = that.config.selection.isSelected(d.node);
        if (is) {
          if (additive) {
            that.config.selection.removeFromSelection(d.node);
          } else {
            that.config.selection.clearSelection();
          }
        } else if (additive) {
          that.config.selection.addToSelection(d.node);
        } else {
          that.config.selection.selection = d.node;
        }
      });

    that.items.exit().remove();
  }

  dirtyLayout() {
    this.isLayoutDirty = true;
  }

  relayout(width: number, height: number) {

  }

  focusOn(newroot: Node) {

  }

  collapsedChanged(node: PVDHierarchyNode) {

  }

  private computeActivity(node: Node, s: PVDSelection, f: DOIFormula) {
    var w = computeWindow(node, s, f);
    return {
      act: w.doi_t,
      prev: w.doi_prev,
      delta: w.delta_t
    };
  }

  private computeTrajectoriesActivities(node: Node, s: PVDSelection, f: DOIFormula): DeltaDOI[] {
    return computeTrajectory(node, s, f);
  }

  layout(dt: number, now: number): any {
    var that = this;
    var s = this.config.selection.getSelection(now); //this.config.dataRange(now, this.config.gridWidth);

    that.time.domain([s.start, s.point + 1]);

    var data: d3.Map<DeltaDOI[]> = d3.map(),
      activity;

    that.nodesMap.values().map((node) => {
      // compute activity is less expensive then caluclating the whole trajectory
      activity = that.computeActivity(node.node, s, that.config.selection.doi);
      // check if activity has changed and calculate activity accordingly
      if (that.dataCache.get(node.node.fqIname) !== activity.act) {
        data.set(node.node.fqIname, that.computeTrajectoriesActivities(node.node, s, that.config.selection.doi));
        that.dataCache.set(node.node.fqIname, activity.act);
      }
    });

    return data;
  }

  update(dt: number, now: number, data: d3.Map<DeltaDOI[]>): void {
    var that = this;

    // skip updating step if no new data
    if (data.size() === 0) {
      return;
    }

    that.$svg.select('g.x').call(that.xAxis);
    that.$svg.select('g.y').call(that.yAxis);

    that.items
      .attr('stroke', (d) => d.node.color)
      .attr('d', function (d) {
        // calculate lines only if new data is available
        if (data.get(d.node.fqIname) !== undefined) {
          return that.line(data.get(d.node.fqIname));
        } else {
          return d3.select(this).attr('d');
        }
      });
  }

  get layouter() {
    return this.layouter_;
  }

  set layouter(layout: IPVDLayout) {
    layout.hasChildren = this.hierarchy.hasChildren;
    layout.children = this.hierarchy.children;
    layout.scaleFactor = this.hierarchy.scaleFactor;
    layout.parent = this.hierarchy.parent;
    layout.isSelected = this.hierarchy.isSelected;
    //layout.inlayUp = this.inlayUp_;
    //layout.inlayDown = this.inlayDown_;
    this.layouter_ = layout;
  }

  hasChildrenCb(node: Node): boolean {
    var n = this.nodesMap.get(node.fqIname);
    if (n.collapsed) {
      return false;
    }
    return n.hasNodeChildren();
  }

  parentCb(node: Node): Node {
    if (node === this.layouter.rootNode) {
      return null;
    }
    return node.parent;
  }

  parentsCb(node: Node): Node[] {
    if (node === this.layouter.rootNode) {
      return [node];
    }
    return node.parents;
  }

  childrenCb(node: Node): Node[] {
    var n = this.nodesMap.get(node.fqIname);
    return n.nodeChildren();
  }

  private scaleFactorCb(node: Node): number[] {
    return this.nodesMap.get(node.fqIname).scaleFactor;
  }

  anchorPoint(position?: number[]) {

  }

}

export default angular.module('directives.pvdThermalLineChart', [
  InfrastructureLoader,
  WindowResize,
  Animator,
  DataSelection,
  InfrastructureMapper,
  LayoutManager,
  TargetHierarchy,
  ChangeBorder
])
  .directive('pvdThermalLineChart', [
    'pvdInfrastructureLoader',
    'pvdWindowResize',
    '$timeout',
    'pvdAnimator',
    'pvdDataSelection',
    'pvdInfrastructureMapper',
    'pvdLayoutManager',
    'pvdTargetHierarchy',
    'pvdChangeBorder',
    function (
    pvdInfrastructureLoader: PVDInfrastructureLoader,
    pvdWindowResize: PVDWindowResize,
    $timeout,
    pvdAnimator: PVDAnimator,
    pvdDataSelection: PVDDataSelection,
    pvdInfrastructureMapper: PVDInfrastructureMapper,
    pvdLayoutManager: PVDLayoutManager,
    pvdTargetHierarchy: PVDTargetHierarchy,
    pvdChangeBorder: PVDChangeBorder
  ) {
    return {
      compile: function (element, attrs: any) {
        attrs.datatype = angular.isDefined(attrs.datatype) ? attrs.datatype : 'stream';
        attrs.sliceWidth = angular.isDefined(attrs.sliceWidth) ? +attrs.sliceWidth : 20;
        attrs.sliceHeight = angular.isDefined(attrs.sliceHeight) ? +attrs.sliceHeight : 20;

        return function ($scope, element) {
          pvdInfrastructureLoader.get(attrs.infraId).then((infrastructure: Infrastructure) => {
            $timeout(() => { //skip one time to ensure that the svg is properly layouted

              //var path:string = $scope.path;
              //var attr = infrastructure.findAttr(path);
              var $base = d3.select(element[0]);

              pvdDataSelection.infra = infrastructure;

              var $root: d3.Selection<any> = $base.append('div')
                .classed('cg-thermal-line-chart', true)
                .attr('data-infra-id', attrs.infraId);
              //.append('div');

              var config = new PVDHierarchyConfig(pvdAnimator, pvdDataSelection, pvdLayoutManager, pvdInfrastructureMapper, pvdTargetHierarchy, pvdChangeBorder, pvdWindowResize);
              config.datatype = attrs.datatype;
              config.autoSize = attrs.autoSize;
              config.nodeWidth = attrs.sliceWidth;
              config.sliceHeight = attrs.sliceHeight;
              //config.triggerActivity = true;

              config.gridWidth = parseInt(d3.select($root.node().parentNode.parentNode.parentNode).style('width'));
              config.gridHeight = window.innerHeight;

              config.visConfigId = attrs.visConfig;

              modifyConfig(config, infrastructure);

              new PVDThermalLineChart($root, infrastructure, config);
            }, 10);
          });
        }
      },
      scope: {
        'infraId': '@?', // id of infrastructure*.json
        'datatype': '@?', // mode like 'static', 'stream' (default: 'stream')
        'sliceWidth': '@?', // slice width
        'sliceHeight': '@?', // slice height
        'visConfig': '@?' // infrastructure.visConfig[...]
      },
      restrict: 'E'
    };
  }])
  .name; // name for export default
