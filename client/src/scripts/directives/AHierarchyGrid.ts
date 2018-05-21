/**
 * Created by Holger Stitz on 18.08.2014.
 */

import * as angular from '@bower_components/angular';
import * as d3 from '@bower_components/d3/d3';
import { IAnimateable } from '../services/Animator';
import { PVDHierarchyUpInlay, PVDHierarchyDownInlay, PVDHierarchyAInlay } from './HierarchyInlay';
import { PVDElementParent, PVDHierarchyNode } from './HierarchyNode';
import { PVDHierarchyEdgeOverlay, PVDLayoutEdge } from './HierarchyEdgeOverlay';
import { PVDHierarchyConfig } from './HierarchyConfig';
import { Node } from '../models/Infrastructure';
import { IPVDLayout, PVDLayoutBundle, PVDLayoutDimensions } from './layouts/Layout';

'use strict';


// render the nodes according to computed layout
export class PVDAHierarchyGrid implements PVDElementParent, IAnimateable {
  private isLayoutDirty: boolean = false;

  // last event that causes a relayout -> important for inlay calucation
  private lastRelayoutEvent: string = '';
  private layouter_: IPVDLayout;
  private inlayUp_: PVDHierarchyUpInlay = null;
  private inlayDown_: PVDHierarchyDownInlay = null;

  private _gridWidth = 0;
  private _gridHeight = 0;

  private overlay: PVDHierarchyEdgeOverlay = null;

  nodesMap: d3.Map<PVDHierarchyNode> = d3.map();

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

  constructor(public $root: d3.Selection, public config: PVDHierarchyConfig, useOverlay = true) {
    if (useOverlay) {
      this.overlay = new PVDHierarchyEdgeOverlay(this.$root, this.config);
    }
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
    layout.inlayUp = this.inlayUp_;
    layout.inlayDown = this.inlayDown_;
    this.layouter_ = layout;
  }

  get inlayUp() {
    return this.inlayUp_;
  }

  set inlayUp(inlay: PVDHierarchyUpInlay) {
    this.inlayUp_ = inlay;
    if (this.layouter_) {
      this.layouter_.inlayUp = inlay;
    }
  }

  get inlayDown() {
    return this.inlayDown_;
  }

  set inlayDown(inlay: PVDHierarchyDownInlay) {
    this.inlayDown_ = inlay;
    if (this.layouter_) {
      this.layouter_.inlayDown = inlay;
    }
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

  updateWidths() {
    this.config.nodeWidth = this.config.selection.nodeWidth;
    this.nodesMap.values().forEach((node) => {
      node.setScaleFactor(0, this.config.act2width(this.config.autoShrink ? node.activity : 1));
    });
    this.dirtyLayout();
  }

  update(dt: number, now: number, layouted: any): void {
    // suppress relayouting, if nothing has changed
    if (this.isLayoutDirty === false) { return; }
    this.relayout('update');
    this.isLayoutDirty = false;
  }

  layout(dt: number, now: number): any {
    return null; // relayout in update() phase
  }

  dirtyLayout() {
    this.isLayoutDirty = true;
  }

  get gridWidth() {
    if (this.config.autoSize) {
      this._gridWidth = parseInt(d3.select(this.$root.node().parentNode).style('width'));
    } else {
      this._gridWidth = this.$root.node().getBoundingClientRect().width;
    }
    return this._gridWidth;
  }

  get gridHeight() {
    if (this.config.autoSize) {
      this._gridHeight = parseInt(d3.select(this.$root.node().parentNode).style('height')) || 0;
    } else {
      this._gridHeight = this.$root.node().getBoundingClientRect().height;
    }
    return this._gridHeight;
  }

  relayout(event: string): void;
  relayout(width: number, height: number): void;
  relayout(): void {
    var gridWidth = this.gridWidth,
      gridHeight = this.gridHeight,
      bundle: PVDLayoutBundle;

    if (arguments.length === 1 && typeof arguments[0] === 'string') {
      this.lastRelayoutEvent = arguments[0].toString();
    }

    if (this.config.autoShrink) {
      this.nodesMap.forEach((fqname, node) => node.autoShrink());
    }

    if (this.config.autoSize) {
      if (gridWidth <= 0 || isNaN(gridWidth)) {
        this.dirtyLayout();
        return;
      }
      bundle = this.layouter.apply(gridWidth, gridHeight, 1, this.config.sliceHeight);
      var outerDim = this.updateNodePosition(bundle.positions);

      this.$root.style({
        width: gridWidth + 'px',
        height: outerDim[1] + 'px'
      });
      gridHeight = outerDim[1];

    } else {
      bundle = this.layouter.apply(gridWidth, gridHeight, 1, this.config.sliceHeight);
      this.updateNodePosition(bundle.positions);
    }

    if (this.overlay) {
      this.overlay.$node.style('z-index', this.layouter.edgesBelowNodes ? '0' : null);
    }
    var edges = this.layouter.edges(bundle.positions, bundle.edges);
    this.updateEdgeOverlay(edges, gridWidth, gridHeight);
  }

  collapsedChanged(node: PVDHierarchyNode) {
    node.children(this.config.showInNode(!node.collapsed, node.node));
    this.relayout('update');
  }

  createNode(node: Node) {
    var nodeEl = new PVDHierarchyNode(node, this.$root, this.config, this);
    nodeEl.addTimelineHighlight();
    this.nodesMap.set(node.fqIname, nodeEl);

    var hasChildren = nodeEl.hasNodeChildren();
    nodeEl.children(this.config.showInNode(hasChildren, node));
  }

  protected updateNodePosition(positions: d3.Map<PVDLayoutDimensions>): number[] {
    var that = this,
      wh = [0, 0],
      runningTransitions = 0;

    function transition(node: Node, inlay) {
      var transNodeEl = new PVDHierarchyNode(node, that.$root, that.config, that);
      transNodeEl.selected = true;
      transNodeEl.isVisible = true;
      transNodeEl.$node.style('opacity', 1);

      positions.get(node.fqIname).apply(transNodeEl);

      inlay.nodeDimension(node).apply(
        transNodeEl, inlay.x, inlay.y,
        () => {
          transNodeEl.hide();
          transNodeEl.$node.remove();

          --runningTransitions;

          if (runningTransitions === 0) {
            inlay.show();
          }
        }
      );
    }

    [this.inlayUp_, this.inlayDown_].forEach((inlay: PVDHierarchyAInlay) => {
      if (inlay == null) {
        return;
      }
      var pos = positions.get(inlay.fqIname);

      if (pos === undefined || pos === null) {
        inlay.hide();

      } else {
        inlay.pos(pos.x, pos.y);
        inlay.relayout(pos.width, pos.height);

        if (that.lastRelayoutEvent === 'selectall') {
          inlay.hide(); // inlay.show() in transition end

          if (inlay.selectedSrc !== null && inlay.selectedDst !== null) {
            runningTransitions = 2;
            transition(inlay.selectedSrc, inlay);
            transition(inlay.selectedDst, inlay);

          } else if (inlay.selectedSrc !== null) {
            runningTransitions = 1;
            transition(inlay.selectedSrc, inlay);

          } else if (inlay.selectedDst !== null) {
            runningTransitions = 1;
            transition(inlay.selectedDst, inlay);
          }

        } else {
          inlay.show()
        }

        wh[0] = Math.max(wh[0], inlay.x + inlay.width);
        wh[1] = Math.max(wh[1], inlay.y + inlay.height);
      }
    });

    this.nodesMap.forEach((fqname, node) => {
      if (node === null) {
        return;
      }
      var pos = positions.get(fqname);
      if (pos === undefined || pos === null) {
        node.hide();
        return;
      }
      pos.apply(node);

      wh[0] = Math.max(wh[0], pos.x + pos.width);
      wh[1] = Math.max(wh[1], pos.y + pos.height);
    });

    return wh;
  }

  updateEdgeOverlay(edges: PVDLayoutEdge[], gridWidth: number, gridHeight: number) {
    if (this.overlay === null) { return; }
    this.overlay.relayout(gridWidth, gridHeight);
    this.overlay.pos(0, 0);
    this.overlay.draw(edges);
  }

  focusOn(newroot: Node) {

  }

  createInlayUp() {
    var config = this.config.clone();
    return new PVDHierarchyUpInlay(this.$root, config, this);
  }
  createInlayDown() {
    var config = this.config.clone();
    return new PVDHierarchyDownInlay(this.$root, config, this)
  }

  anchorPoint(position?: number[]) {

  }
}
