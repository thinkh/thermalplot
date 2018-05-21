/**
 * Created by Holger Stitz on 18.08.2014.
 */
import * as d3 from '@bower_components/d3/d3';
import { ExternalNode, Node } from "../../models/Infrastructure";
import { PVDHierarchyNode } from "../HierarchyNode";
import { PVDLayoutEdge, edgeBetween } from "../HierarchyEdgeOverlay";
import { PVDHierarchyUpInlay, PVDHierarchyDownInlay, PVDHierarchyAInlay } from "../HierarchyInlay";
import { PVDTargetHierarchy } from '../../services/TargetHierarchy';

'use strict';

export var DiagonalPVDLayoutEdge = DiagonalPVDLayoutEdge;

export class PVDLayoutDimensions {
  constructor(public x: number = 0, public y: number = 0,
    public width: number = 0, public height: number = 0) {
    // nothing :)
  }

  apply(node: PVDHierarchyNode, shiftx: number = 0, shifty: number = 0, endCb?) {
    node.fadeIn();

    var isExternal = node.node instanceof ExternalNode;
    node.$node.classed('hg-selected', node.selected);
    node.$node.classed('hg-highlighted', node.highlighted);
    node.$node.classed('hg-semitransparent', node.semiTransparent).transition().style('opacity', node.semiTransparent ? 0.4 : 1);
    node.$node.classed('hg-external', isExternal);
    node.$node.classed('hg-parent', !isExternal && node.node.has());
    node.$node.classed('hg-leaf', !isExternal && !node.node.has());

    if (endCb !== undefined) {
      node.transformTo(this.x + shiftx, this.y + shifty, this.width, this.height, endCb);

    } else {
      node.pos(this.x + shiftx, this.y + shifty);
      node.relayout(this.width, this.height);
    }
  }
}

export class PVDLayoutBundle {
  constructor(public positions: d3.Map<PVDLayoutDimensions> = d3.map(), public edges: PVDLayoutEdge[] = []) {
    // nothing :)
  }
}

export interface IPVDLayout {
  id: string;
  name: string;
  hasChildren: (node: Node) => boolean;
  children: (node: Node) => Node[];
  parent: (node: Node) => Node;
  scaleFactor: (node: Node) => number[]; // [width, height]
  isSelected: (node: Node) => boolean;
  drawEdges: boolean;

  inlayUp: PVDHierarchyUpInlay;
  inlayDown: PVDHierarchyDownInlay

  rootNode: Node;

  targetHierarchy: PVDTargetHierarchy;

  initNodes(externalNode: Node, rootNode: Node): void;
  apply(gridWidth: number, gridHeight: number, baseWidth: number, baseHeight: number): PVDLayoutBundle;
  edges(positions: d3.Map<PVDLayoutDimensions>, edges: PVDLayoutEdge[]): PVDLayoutEdge[];
  //position(nodeDimMap:d3.Map<PVDLayoutDimensions>, gridWidth:number, gridHeight:number, baseWidth:number, baseHeight:number):void;

  /**
   * indicator whether the edges should be below or above the edges
   */
  edgesBelowNodes: boolean;
}

export class PVDLayoutNode {
  selected: boolean;
  children: PVDLayoutNode[];
  dim: PVDLayoutDimensions;
  level: number;
  maxlevel: number;
  scale: number[];
  accscale: number[];
  accchildren: PVDLayoutNode[];
  radius: number;
  previous: PVDLayoutNode;
  next: PVDLayoutNode;


  constructor(public node: Node, public parent: PVDLayoutNode, that: PVDALayout, baseWidth: number, baseHeight: number) {
    this.scale = that.scaleFactor(node);
    this.selected = that.isSelected(node);
    this.level = parent ? parent.level + 1 : 0;
    this.dim = new PVDLayoutDimensions(0, 0, baseWidth * this.scale[0], baseHeight * this.scale[1]);
    this.radius = Math.sqrt((this.dim.width * this.dim.width) + (this.dim.height * this.dim.height)) / 2;
  }

  shift(x: number, y: number, recursive: boolean) {
    this.dim.x += x;
    this.dim.y += y;
    if (recursive) {
      this.children.forEach((d) => d.shift(x, y, recursive));
    }
  }

  accept(f: (node: PVDLayoutNode) => any) {
    if (f(this) !== false) {
      this.children.forEach((c) => c.accept(f));
    }
  }

  get fqname() {
    return this.node.fqIname;
  }

  get x() {
    return this.dim.x;
  }
  set x(val: number) {
    this.dim.x = val;
  }
  get y() {
    return this.dim.y;
  }
  set y(val: number) {
    this.dim.y = val;
  }
  get x2() {
    return this.dim.x + this.dim.width;
  }
  set x2(val: number) {
    this.dim.x = val - this.dim.width;
  }
  get y2() {
    return this.dim.y + this.dim.height;
  }
  set y2(val: number) {
    this.dim.y = val - this.dim.height;
  }
  get width() {
    return this.dim.width;
  }
  set width(val: number) {
    this.dim.width = val;
  }
  get height() {
    return this.dim.height;
  }
  set height(val: number) {
    this.dim.height = val;
  }

}

export class PVDALayout {
  // callback functions
  hasChildren: (node: Node) => boolean = null;
  children: (node: Node) => Node[] = null;
  parent: (node: Node) => Node = null;
  scaleFactor: (node: Node) => number[] = null; // [width, height]
  isSelected: (node: Node) => boolean = null;

  protected externalNode: Node;
  public rootNode: Node;

  targetHierarchy: PVDTargetHierarchy = null;

  drawEdges: boolean = false;

  inlayUp: PVDHierarchyUpInlay = null;
  inlayDown: PVDHierarchyDownInlay = null;

  constructor() {
  }

  initNodes(externalNode: Node, rootNode: Node) {
    this.externalNode = externalNode;
    this.rootNode = rootNode;
  }

  get edgesBelowNodes() {
    return false;
  }

  edges(positions: d3.Map<PVDLayoutDimensions>, edges: PVDLayoutEdge[]): PVDLayoutEdge[] {
    this.positionEdges(edges, positions);
    this.positionInlayUpEdges(edges, positions);
    this.positionInlayDownEdges(edges, positions);
    return edges;
  }

  private positionEdges(edges: PVDLayoutEdge[], positions: d3.Map<PVDLayoutDimensions>): void {
    if (this.drawEdges === false) { return; }

    var that = this,
      parent: Node = null,
      node: Node = null,
      queue: Node[] = [];

    queue.push(this.rootNode);

    while (queue.length > 0) {
      node = queue.shift();

      //if(that.hasChildren(node) || that.hasIntermediateSiblings(node)) {

      //} else {
      parent = that.parent(node) ? that.parent(node) : parent;
      if (parent) {
        edges.push(edgeBetween(positions.get(parent.fqIname), positions.get(node.fqIname), parent.fqIname + '-' + node.fqIname));
      }
      //}
      queue = queue.concat(that.children(node));
    }
  }

  inlayDim(i: PVDHierarchyAInlay, baseWidth: number, baseHeight: number) {
    var dim = new PVDLayoutDimensions();
    if (isNaN(i.width) || isNaN(i.height)) {
      dim.width = i.scaleFactor[0] * baseWidth;
      dim.height = i.scaleFactor[1] * baseHeight;
    } else {
      dim.width = i.width;
      dim.height = i.height;
    }
    return dim;
  }

  createGraph(root: Node, baseWidth: number, baseHeight: number, map: d3.Map<PVDLayoutDimensions>) {
    var that = this;
    function traverse(node: Node, parent: any) {
      var r = new PVDLayoutNode(node, parent, that, baseWidth, baseHeight);
      map.set(node.fqIname, r.dim);
      //remove no width children
      r.children = that.children(node).map((child) => traverse(child, r)).filter((c) => c.accscale[0] > 0);
      var acc = r.children.map((child, i) => {
        child.previous = r.children[i - 1];
        child.next = r.children[i + 1];
        return child.accscale;
      });
      r.accscale = acc.length > 0 ? [d3.sum(acc, (a) => a[0]), d3.sum(acc, (a) => a[1])] : r.scale;
      r.accchildren = r.children.slice(0);
      r.accchildren.concat.apply(r.accchildren, r.children.map((c) => c.accchildren));
      r.maxlevel = r.children.length > 0 ? Math.max.apply(Math, r.children.map((c) => c.maxlevel)) : r.level;
      return r;
    }
    return traverse(root, null);
  }

  protected positionInlayDownEdges(edges: PVDLayoutEdge[], positions: d3.Map<PVDLayoutDimensions>): void {
    var that = this,
      inlayDown: PVDHierarchyDownInlay = this.inlayDown;

    if (inlayDown === null) {
      return;
    }
    else if (!inlayDown.isFilled) {
      positions.set(inlayDown.fqIname, null);
      return;
    }

    var srcDim = positions.get(inlayDown.selectedSrc.fqIname),
      e1 = new DiagonalPVDLayoutEdge();

    e1.cssClass = 'hg-edge-duplicate';
    e1.sourceAnchor = [DiagonalPVDLayoutEdge.CENTER, DiagonalPVDLayoutEdge.BOTTOM];
    e1.targetAnchor = [DiagonalPVDLayoutEdge.CENTER, DiagonalPVDLayoutEdge.TOP];
    e1.source = srcDim;
    e1.target = new PVDLayoutDimensions();
    e1.target.x = inlayDown.x;
    e1.target.y = inlayDown.y + inlayDown.padding;
    e1.target.width = inlayDown.width;
    e1.target.height = inlayDown.height;
    e1.fqIname = inlayDown.selectedSrc.fqIname + '-' + inlayDown.fqIname;

    edges.push(e1);
  }

  protected positionInlayUpEdges(edges: PVDLayoutEdge[], positions: d3.Map<PVDLayoutDimensions>): void {
    var that = this,
      inlayUp: PVDHierarchyUpInlay = this.inlayUp;

    if (inlayUp === null) {
      return;
    }
    else if (!inlayUp.isFilled) {
      positions.set(inlayUp.fqIname, null);
      return;
    }

    var srcDim = positions.get(inlayUp.selectedSrc.fqIname),
      dstDim = positions.get(inlayUp.selectedDst.fqIname),
      innerSrcDim = inlayUp.nodeDimension(inlayUp.innerSrc),
      innerDstDim = inlayUp.nodeDimension(inlayUp.innerDst),
      e1 = new DiagonalPVDLayoutEdge(),
      e2 = new DiagonalPVDLayoutEdge();

    if (!inlayUp.includeOriginals) { //if the originals are included, we don't have a perspective switch
      e1.cssClass = 'hg-edge-cross-hierarchy';
      e2.cssClass = 'hg-edge-cross-hierarchy';
    } else {
      e1.cssClass = e2.cssClass = 'hg-edge-duplicate';
    }

    e1.sourceAnchor = [DiagonalPVDLayoutEdge.CENTER, DiagonalPVDLayoutEdge.BOTTOM];
    e1.targetAnchor = [DiagonalPVDLayoutEdge.CENTER, DiagonalPVDLayoutEdge.TOP];

    e2.sourceAnchor = [DiagonalPVDLayoutEdge.CENTER, DiagonalPVDLayoutEdge.TOP];
    e2.targetAnchor = [DiagonalPVDLayoutEdge.CENTER, DiagonalPVDLayoutEdge.BOTTOM];

    innerSrcDim.x += inlayUp.x;
    innerSrcDim.y += inlayUp.y + inlayUp.padding;

    // add offset only once if src and dst are different
    if (innerSrcDim !== innerDstDim) {
      innerDstDim.x += inlayUp.x;
      innerDstDim.y += inlayUp.y + inlayUp.padding;
    }

    if (srcDim.x < dstDim.x) {
      e1.source = srcDim;
      e1.target = innerSrcDim;
      e1.fqIname = inlayUp.selectedSrc.fqIname + '-' + inlayUp.innerSrc.fqIname;

      e2.source = innerDstDim;
      e2.target = dstDim;
      e2.fqIname = inlayUp.innerDst.fqIname + '-' + inlayUp.selectedDst.fqIname;

    } else {
      e1.source = dstDim;
      e1.target = innerSrcDim;
      e1.fqIname = inlayUp.innerDst.fqIname + '-' + inlayUp.selectedDst.fqIname;

      e2.source = innerDstDim;
      e2.target = srcDim;
      e2.fqIname = inlayUp.selectedSrc.fqIname + '-' + inlayUp.innerSrc.fqIname;
    }

    edges.push(e1);
    edges.push(e2);
  }
}
