/**
 * Created by Samuel Gratzl on 02.09.2014.
 */

import * as angular from '@bower_components/angular';
import * as d3 from '@bower_components/d3/d3';
import { PVDElementParent, PVDElement, PVDHierarchyNode } from './HierarchyNode';
import { nextID, onDelete, modifyConfig } from './VisUtils';
import { PVDHierarchyEdgeOverlay, PVDLayoutEdge } from './HierarchyEdgeOverlay';
import { PVDHierarchyConfig } from './HierarchyConfig';
import { Node, graphRoute, findLeastCommonAncestor, Infrastructure } from '../models/Infrastructure';
import { IPVDLayout, PVDLayoutDimensions } from './layouts/Layout';
import { PVDStackLayout } from './layouts/StackLayout';
import { PVDHorizontalNodeLinkLayout, PVDNodeLinkLayout } from './layouts/NodeLinkLayouts';

'use strict';

/**
 * an element which is an hierarchy inlay given a route to show
 */
export class PVDHierarchyAInlay implements PVDElementParent, PVDElement {
  fqname: string = 'inlay.' + nextID();
  fqIname: string = this.fqname;
  infra: Infrastructure = null;

  protected layout: IPVDLayout = null;
  private overlay: PVDHierarchyEdgeOverlay = null;

  protected nodesMap: d3.Map<PVDHierarchyNode> = d3.map();
  nodesPositionMap: d3.Map<PVDLayoutDimensions> = d3.map();
  $node: d3.Selection;

  // selected nodes
  selectedSrc: Node = null;
  selectedDst: Node = null; // dst node only used in inlayUp

  // nearest nodes to the selection
  innerSrc: Node = null;
  innerDst: Node = null;

  _scaleFactor: number[];
  _width = 0;
  _height = 0;
  _x = 0;
  _y = 0;

  isVisible = true;
  padding = 0;

  hierarchy = {
    parent: (node) => this.parentCb(node),
    parents: (node) => this.parentsCb(node),
    hasChildren: (node) => this.hasChildrenCb(node),
    children: (node) => this.childrenCb(node)
  };

  constructor($parent: d3.Selection, public config: PVDHierarchyConfig, private parent: PVDElementParent) {
    this.$node = $parent.append('div').attr('class', 'hg-inlay hg-grid');

    //set default scale factors
    // disable autoShrink and triggerActivity in inlay
    this.config.autoShrink = false;
    this.config.triggerActivity = false;
    this._scaleFactor = [this.config.effectiveNodeWidth(true) * 2, 6];

    var updateWidths = () => {
      var nodeWidth = this.config.nodeWidth < 0 ? this.config.selection.nodeWidth : this.config.nodeWidth;
      this.config.act2width.rangeRound([this.config.act2width.range()[0], nodeWidth]);
      this.nodesMap.values().forEach((node) => {
        node.setScaleFactor(0, this.config.act2width(this.config.autoShrink ? node.activity : 1));
      });
      this.dirtyLayout();
    };
    var id = 'inlay' + nextID();
    this.config.selection.on('nodeWidth.' + id, updateWidths);
    onDelete(this.$node, () => {
      this.config.selection.on('nodeWidth.' + id, null);
    });
    this.layout = this.createLayout();
    this.layout.hasChildren = (node) => this.hasChildrenCb(node);
    this.layout.children = (node) => this.childrenCb(node);
    this.layout.scaleFactor = (node) => this.scaleFactorCb(node);
    this.layout.parent = (node) => this.parentCb(node);
    this.layout.isSelected = (node) => {
      var r = this.nodesMap.get(node.fqIname);
      if (r === undefined) { return false; }
      return r.selected || r.highlighted;
    };
    this.overlay = new PVDHierarchyEdgeOverlay(this.$node, this.config);
  }

  createLayout(): IPVDLayout {
    var r = new PVDNodeLinkLayout(false, false);
    r.drawEdges = true;
    return r;
  }

  updateSelection(all: Node[], position: (node) => { x: number; y: number }) {

  }

  get x() {
    return this._x;
  }

  get y() {
    return this._y;
  }

  get width() {
    return this._width;
  }

  get height() {
    return this._height;
  }

  hide() {
    if (!this.isVisible) {
      return
    }
    this.isVisible = false;
    this.nodesMap.forEach((_, c) => {
      c.hide();
    });

    this.$node.style('display', 'none');
  }

  show() {
    if (this.isVisible) {
      return
    }
    this.isVisible = true;
    this.nodesMap.forEach((_, c) => {
      c.show();
    });

    this.$node.style('display', null);
  }

  fadeIn() {
    this.show();
  }

  fadeOut() {
    this.hide();
  }

  get scaleFactor() {
    return this._scaleFactor;
  }

  setScaleFactor(dim: number, val: number) {
    this._scaleFactor[dim] = val;
    //if (dim === 0) {
    //  this.nodesMap.forEach((_, c) => c.setScaleFactor(0,val));
    //}
  }

  parentCb(node: Node): Node {
    if (node === this.layout.rootNode) {
      return null;
    }
    return null;
  }

  parentsCb(node: Node): Node[] {
    if (node === this.layout.rootNode) {
      return [node];
    }
    return null;
  }

  hasChildrenCb(node: Node): boolean {
    var n = this.nodesMap.get(node.fqIname);
    if (n.collapsed) {
      return false;
    }
    return false;
  }

  childrenCb(node: Node): Node[] {
    var n = this.nodesMap.get(node.fqIname);
    if (n === undefined) { return []; }
    if (n.collapsed) {
      return [];
    }
    return [];
  }

  scaleFactorCb(node: Node): number[] {
    var n = this.nodesMap.get(node.fqIname);
    if (n === undefined) { return [0, 0]; }
    return n.scaleFactor;
  }

  pos(x: number, y: number) {
    this._x = x;
    this._y = y;

    this.$node.style({
      top: y + 'px',
      left: x + 'px'
    });
  }

  static fromPx(val: string) {
    val = val.substring(0, val.length - 2);
    return +val;
  }

  get isFilled() {
    return false;
  }

  dirtyLayout() {
    this.parent.dirtyLayout();
  }

  relayout(width?: number, height?: number): void {
    this._width = (isNaN(width)) ? PVDHierarchyUpInlay.fromPx(this.$node.style('width')) : width;
    this._height = (isNaN(height)) ? PVDHierarchyUpInlay.fromPx(this.$node.style('height')) : height;

    if (this.isFilled && this._width && this._height) {
      if (this.config.autoShrink) {
        this.nodesMap.forEach((fqname, node) => node.autoShrink());
      }

      var bundle = this.layout.apply(this._width - this.padding * 2, 0, 1, this.config.sliceHeight);
      var wh = this._calculateDim(bundle.positions),
        padding = [this.padding - wh[2], this.padding - wh[3]];
      this._updateNodePosition(bundle.positions, padding);
      this._width = wh[0] - wh[2] + this.padding * 2;
      this._height = wh[1] - wh[3] + this.padding * 2;
      var edges = this.layout.edges(bundle.positions, bundle.edges);
      this._updateEdgeOverlay(edges, this._width, this._height, padding);
    }

    this.$node.style({
      'width': this._width + 'px',
      'height': this._height + 'px'
    });
  }

  collapsedChanged(node: PVDHierarchyNode) {
    node.children(this.config.showInNode(!node.collapsed, node.node));
    this.relayout();
  }

  createNode(node: Node, index: number = 0): PVDHierarchyNode {
    modifyConfig(this.config, node.infrastructure);

    var nodeEl = new PVDHierarchyNode(node, this.$node, this.config, this);
    nodeEl.addTimelineHighlight();
    this.nodesMap.set(node.fqIname, nodeEl);

    // decrease the width about one slice
    //nodeEl.setScaleFactor(0, Math.round(nodeEl.scaleFactor[0]*0.75));
    nodeEl.setScaleFactor(0, Math.round(nodeEl.scaleFactor[0]));

    var hasChildren = index < 0 || nodeEl.hasNodeChildren();
    nodeEl.children(this.config.showInNode(hasChildren, node));

    if (this.selectedSrc === node) {
      nodeEl.selected = true;
      nodeEl.highlighted = true;
    }

    return nodeEl;
  }

  protected _updateNodePosition(positions: d3.Map<PVDLayoutDimensions>, shift: number[]) {
    this.nodesPositionMap = positions;

    this.nodesMap.forEach((fqname, node) => {
      if (node === null) {
        return;
      }
      var pos = positions.get(fqname);
      if (pos === undefined || pos === null) {
        node.fadeOut();
        return;
      }
      pos.apply(node, shift[0], shift[1]);
    });
  }

  protected _updateEdgeOverlay(edges: PVDLayoutEdge[], width: number, height: number, shift: number[]) {
    if (this.overlay === null) {
      return;
    }
    this.overlay.relayout(width, height);
    this.overlay.pos(0 + shift[0], 0 + shift[1]);
    this.overlay.draw(edges);
  }

  protected _calculateDim(positions: d3.Map<PVDLayoutDimensions>): number[] {
    var wh = [0, 0, Number.MAX_VALUE, Number.MAX_VALUE];

    positions.forEach((fqname, pos) => {
      wh[0] = Math.max(wh[0], pos.x + pos.width);
      wh[1] = Math.max(wh[1], pos.y + pos.height);
      wh[2] = Math.min(wh[2], pos.x);
      wh[3] = Math.min(wh[3], pos.y);
    });

    return wh;
  }

  focusOn(newroot: Node) {

  }

  nodeDimension(node: Node): PVDLayoutDimensions {
    if (this.nodesPositionMap.has(node.fqIname)) {
      return this.nodesPositionMap.get(node.fqIname);
    }

    return null;
  }

  anchorPoint(position?: number[]) {

  }
}

export class PVDHierarchyUpInlay extends PVDHierarchyAInlay {
  fqname: string = 'inlay.up.' + nextID();
  fqIname: string = this.fqname;

  private roots: Node[];
  private srcs: Node[] = [];
  private dsts: Node[] = [];

  includeOriginals = true;

  constructor($parent: d3.Selection, config: PVDHierarchyConfig, parent: PVDElementParent) {
    super($parent, config, parent);
  }

  createLayout(): IPVDLayout {
    var r = new PVDHorizontalNodeLinkLayout();
    r.targetHierarchy = this.config.targetHierarchy;
    r.drawEdges = true;
    return r;
  }

  updateSelection(all: Node[], position: (node) => { x: number; y: number }) {
    this.selectedSrc = (all[0] === undefined) ? null : all[0];
    this.selectedDst = (all[1] === undefined) ? null : all[1];

    if (all.length < 2 || this.selectedSrc.infrastructure !== this.selectedDst.infrastructure) {
      this.updateRoute(null);
      return;
    }
    var target = this.config.targetHierarchy.targetFromInfra(true, this.selectedSrc.infrastructure);
    if (target.length === 0) {
      this.updateRoute(null);
      return;
    }
    var srcs = [];
    var dsts = [];
    var a = this.selectedSrc, b = this.selectedDst;

    //swap if a is right of b
    if (position && position(a).x > position(b).x) {
      var t = a;
      this.selectedSrc = a = this.selectedDst;
      this.selectedDst = b = t;
    }

    if (this.includeOriginals) {
      srcs.push(a);
      dsts.push(b);
    }
    for (var i = 0; i < target.length; ++i) {
      a = this.config.mapper.mapToUnchecked(a, target[i], [null])[0];
      b = this.config.mapper.mapToUnchecked(b, target[i], [null])[0];
      if (!a || !b) {
        this.updateRoute(null);
        return;
      }
      srcs.push(a);
      dsts.push(b);
    }

    this.innerSrc = srcs[0];
    this.innerDst = dsts[0];

    var lce = findLeastCommonAncestor(srcs, dsts);
    if (lce.found) { //the hierarchies merges somehow

      this.updateRoute(srcs.slice(lce.si).reverse(), srcs.slice(0, lce.si).reverse(), dsts.slice(0, lce.di).reverse());
      return;
    }

    //separate branches in the target hierarchy
    srcs.pop(); //remove the one part of the route
    dsts.pop();
    var r = graphRoute(a, b);
    function combine(src, inter) {
      src = src.slice();
      src.reverse();
      src.shift();
      src.push.apply(src, inter.reverse());
      return src;
    }
    if (r.lcancestor) {
      srcs = combine(r.srcPath, srcs);
      dsts = combine(r.dstPath, dsts);
      this.updateRoute([r.lcancestor], srcs, dsts);
    } else {
      this.updateRoute(null);
    }
  }

  updateRoute(roots: Node[], srcs: Node[] = [], dsts: Node[] = []) {
    this.nodesMap = d3.map(); //clear
    this.$node.selectAll('div').remove();

    this.roots = roots;
    this.srcs = srcs;
    this.dsts = dsts;

    if (!roots || roots.length === 0) {
      this.relayout();
      return;
    }

    this.infra = roots[0].infrastructure;
    this.$node
      .classed('hg-inlay', true)
      .classed('hg-grid', true)
      .classed('infra-' + this.infra.id, true)
      .classed('color-' + this.infra.color, true);

    this.layout.initNodes(null, roots[0]);

    //this.createNode(this.infra.external, -1);
    //from top to bottom
    this.roots.forEach(this.createNode, this);
    this.srcs.forEach(this.createNode, this);
    this.dsts.forEach(this.createNode, this);

    this.setScaleFactor(0, this.isLinearRoute ? 5 : 10);
    //this.setScaleFactor(1,)

    this.relayout();
  }

  get isFilled() {
    return this.roots != null;
  }

  get isLinearRoute() {
    return this.srcs.length === 0 || this.dsts.length === 0;
  }

  parentCb(node: Node): Node {
    if (node === this.layout.rootNode) {
      return null;
    }
    var i = this.roots.indexOf(node);
    if (i >= 0) {
      return i === 0 ? null : this.roots[i - 1];
    }
    //intermediate chain
    i = this.srcs.indexOf(node);
    if (i >= 0) {
      return i === 0 ? this.roots[this.roots.length - 1] : this.srcs[i - 1];
    }
    i = this.dsts.indexOf(node);
    if (i >= 0) {
      return i === 0 ? this.roots[this.roots.length - 1] : this.dsts[i - 1];
    }
    //strange shouldn't happen
    console.error('shouldnt happen');
    return null;
  }

  parentsCb(node: Node): Node[] {
    if (node === this.layout.rootNode) {
      return [node];
    }
    var fix = (arr) => {
      arr.reverse();
      arr.push.apply(arr, this.roots.slice().reverse());
      return arr;
    };
    //intermediate chain
    var i = this.roots.indexOf(node);
    if (i >= 0) {
      return this.roots.slice(0, i + 1).reverse();
    }
    //intermediate chain
    i = this.srcs.indexOf(node);
    if (i >= 0) {
      return fix(this.srcs.slice(0, i + 1));
    }
    i = this.dsts.indexOf(node);
    if (i >= 0) {
      return fix(this.dsts.slice(0, i + 1));
    }
    return [node]; //simulate single
  }

  hasChildrenCb(node: Node): boolean {
    var n = this.nodesMap.get(node.fqIname);
    if (n.collapsed) {
      return false;
    }
    if (node == this.roots[this.roots.length - 1]) {
      return this.srcs.length > 0 || this.dsts.length > 0;
    }
    //part of intermediate next intermediate
    var i = this.roots.indexOf(node);
    if (i >= 0) {
      return i < this.roots.length - 1;
    }
    //part of intermediate next intermediate
    i = this.srcs.indexOf(node);
    if (i >= 0) {
      return i < this.srcs.length - 1;
    }
    i = this.dsts.indexOf(node);
    if (i >= 0) {
      return i < this.dsts.length - 1;
    }
    console.error('shouldnt happen');
    return false;
  }

  childrenCb(node: Node): Node[] {
    var n = this.nodesMap.get(node.fqIname);
    if (n === undefined) { return []; }
    if (n.collapsed) {
      return [];
    }
    if (node == this.roots[this.roots.length - 1]) {
      var r = [];
      if (this.srcs.length > 0) {
        r.push(this.srcs[0]);
      }
      if (this.dsts.length > 0) {
        r.push(this.dsts[0]);
      }
      return r;
    }
    var i = this.roots.indexOf(node);
    if (i >= 0) {
      return i < this.roots.length - 1 ? this.roots.slice(i + 1, i + 2) : [];
    }
    //part of intermediate next intermediate
    var i = this.srcs.indexOf(node);
    if (i >= 0) {
      return i < this.srcs.length - 1 ? this.srcs.slice(i + 1, i + 2) : [];
    }
    var i = this.dsts.indexOf(node);
    if (i >= 0) {
      return i < this.dsts.length - 1 ? this.dsts.slice(i + 1, i + 2) : [];
    }
    console.error('shouldnt happen');
    return [];
  }

  createNode(node: Node, index: number = 0): PVDHierarchyNode {
    var nodeEl = super.createNode(node, index);

    if (this.selectedDst === node) {
      nodeEl.selected = true;
      nodeEl.highlighted = true;
    }

    return nodeEl;
  }

  anchorPoint(position?: number[]) {

  }
}

class DownNode {
  children: DownNode[] = [];
  constructor(public node: Node, public parent: DownNode) {

  }
}

export class PVDHierarchyDownInlay extends PVDHierarchyAInlay {
  fqname: string = 'inlay.down.' + nextID();
  fqIname: string = this.fqname;

  private down: DownNode = null;
  private downMap: d3.Map<DownNode> = d3.map();

  constructor($parent: d3.Selection, config: PVDHierarchyConfig, parent: PVDElementParent) {
    super($parent, config, parent);
  }

  updateSelection(all: Node[], position: (node) => { x: number; y: number }) {
    this.selectedSrc = (all[0] === undefined) ? null : all[0];
    this.update(all.length === 1 ? all[0] : null);
    this.relayout();
  }

  get isFilled() {
    return this.down != null;
  }

  update(node: Node) {
    this.nodesMap = d3.map(); //clear
    this.downMap = d3.map();
    this.$node.selectAll('div').remove();
    if (node === null) {
      this.down = null;
      return;
    }
    this.down = new DownNode(node, null);
    var target = this.config.targetHierarchy.targetFromInfra(false, node.infrastructure);
    if (target.length === 0) {
      return;
    }
    var mapper = this.config.mapper;
    var that = this;

    this.infra = node.infrastructure;
    this.$node
      .classed('hg-inlay', true)
      .classed('hg-grid', true)
      .classed('infra-' + this.infra.id, true)
      .classed('color-' + this.infra.color, true);

    this.layout.initNodes(null, node);
    //this.createNode(this.infra.external, -1);
    this.createNode(node, -1);
    this.downMap.set(node.fqIname, this.down);

    function mapDown(n: DownNode, level: number) {
      n.children = mapper.mapToUnchecked(n.node, target[level], []).map((ni) => {
        var r = new DownNode(ni, n);
        that.createNode(ni);
        that.downMap.set(ni.fqIname, r);
        return r;
      });
      if (level < target.length) {
        if (n.children.length === 0) { //maybe a skipping link? test the next level
          mapDown(n, level + 1);
        } else {
          n.children.forEach(c => mapDown(c, level + 1));
        }
      }
    }
    mapDown(this.down, 0);
  }

  //createLayout() {
  //  var r = new PVDHierarchyGridLayout();
  //  return r;
  //}

  parentCb(node: Node): Node {
    if (node === this.layout.rootNode) {
      return null;
    }
    var down = this.downMap.get(node.fqIname);
    if (!down || !down.parent) {
      return null;
    }
    return down.parent.node;
  }

  parentsCb(node: Node): Node[] {
    if (node === this.layout.rootNode) {
      return [node];
    }
    var down = this.downMap.get(node.fqIname);
    if (!down || !down.parent) {
      return [node];
    }
    var r = [];
    while (down) {
      r.push(down.node);
      down = down.parent;
    }
    return r;
  }

  hasChildrenCb(node: Node): boolean {
    var n = this.nodesMap.get(node.fqIname);
    if (n.collapsed) {
      return false;
    }
    var down = this.downMap.get(node.fqIname);
    if (!down) {
      return false;
    }
    return down.children.length > 0;
  }

  childrenCb(node: Node): Node[] {
    var n = this.nodesMap.get(node.fqIname);
    if (n === undefined) { return []; }
    if (n.collapsed) {
      return [];
    }
    var down = this.downMap.get(node.fqIname);
    if (!down) {
      return [];
    }
    return down.children.map((d) => d.node);
  }
}

export class PVDHierarchyUpInlayStacked extends PVDHierarchyUpInlay {
  constructor($parent: d3.Selection, config: PVDHierarchyConfig, parent: PVDElementParent) {
    super($parent, config, parent);
  }

  createLayout(): IPVDLayout {
    var r = new PVDStackLayout(false);
    r.drawEdges = true;
    return r;
  }

  relayout(width?: number, height?: number): void {
    var _width = (isNaN(width)) ? PVDHierarchyUpInlay.fromPx(this.$node.style('width')) : width;

    if (this.isFilled && _width) {
      //update node according to actual width, the maximum is used to compute the effective start time
      //this.config.nodeWidth = _width - 10;
    }
    super.relayout(width, height);
  }
}

export class PVDHierarchyDownInlayStacked extends PVDHierarchyDownInlay {
  constructor($parent: d3.Selection, config: PVDHierarchyConfig, parent: PVDElementParent) {
    super($parent, config, parent);
  }

  createLayout(): IPVDLayout {
    var r = new PVDStackLayout(true);
    r.drawEdges = true;
    return r;
  }

  relayout(width?: number, height?: number): void {
    var _width = (isNaN(width)) ? PVDHierarchyUpInlay.fromPx(this.$node.style('width')) : width;

    if (this.isFilled && _width) {
      //update node according to actual width, the maximum is used to compute the effective start time
      //this.config.nodeWidth = _width - 10;
    }
    super.relayout(width, height);
  }
}
