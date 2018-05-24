/**
 * Created by Holger Stitz on 18.08.2014.
 */
import * as d3 from 'd3';
import { PVDALayout, IPVDLayout, PVDLayoutBundle, PVDLayoutDimensions } from './Layout';
import { PVDGridLayout } from './GridLayout';
import { Node } from '../../models/Infrastructure';

'use strict';


/**
 * This creates a vertical space-filling layout.
 * The width of th intermediate nodes is weighted according to the number of leaf nodes and distributed to the grid width.
 * The leaf nodes have a fixed width and positioned in a grid layout
 */
export class PVDVerticalGridLayout extends PVDALayout implements IPVDLayout {
  static ID: string = 'vgrid';
  static NAME: string = 'Vertical Hierarchical Grid';

  id = PVDGridLayout.ID;
  name = PVDGridLayout.NAME;

  private offsetIntermediate: number[] = [0, 0]; // [width, height]
  private offsetLeaves: number[] = [1, 1]; // [width, height]
  private weightMap: d3.Map<number> = d3.map();
  private summedChildrenMap: d3.Map<number> = d3.map();

  private maxWidth = 0;
  private maxHeight = 0;

  constructor() {
    super();

    this.drawEdges = false;
  }

  apply(gridWidth: number, gridHeight: number, baseWidth: number, baseHeight: number): PVDLayoutBundle {
    this.maxWidth = this.maxHeight = 0;
    var bundle: PVDLayoutBundle = new PVDLayoutBundle();

    this.offsetIntermediate[0] = baseWidth * 2;
    this.offsetIntermediate[1] = 2;

    this.weightMap = d3.map();
    this.summedChildrenMap = d3.map();

    this.calculateWeightMap();
    this.calculateSummedChildrenMap();
    this.positionNodes(bundle, gridWidth, gridHeight, baseWidth, baseHeight);
    this.groupMasterNodes(bundle);

    //console.log(bundle);
    return bundle;
  }

  private calculateWeightMap(): void {
    var that = this,
      numChildrenMap: d3.Map<number> = d3.map(),
      leavesOnly = 0,
      nodes: Node[] = [];

    function calculateNodeWeight(node): number {
      nodes.push(node);
      if (that.hasChildren(node)) {
        //if(that.nodesPerLevel[node.level] === undefined) { that.nodesPerLevel[node.level] = 0; }
        //++that.nodesPerLevel[node.level];

        var numChildren = 0;
        var children = that.children(node);
        for (var i = 0; i < children.length; i++) {
          numChildren += calculateNodeWeight(children[i]);
        }

        // if leaves are included in children, then substract the leaves from numChildren
        leavesOnly = children.filter((n) => { return !that.hasChildren(n); }).length;
        if (leavesOnly > 0 && children.length !== leavesOnly) {
          numChildren -= leavesOnly;
        }

        numChildrenMap.set(node.fqIname, numChildren);
        return numChildren;
      }

      //numChildrenMap.set(node.fqIname, 1);
      return 1;
    }
    if (this.externalNode) {
      nodes.push(this.externalNode);
    }

    numChildrenMap.set(this.rootNode.fqIname, calculateNodeWeight(this.rootNode));

    this.weightMap.set(this.rootNode.fqIname, 1.0);
    if (this.externalNode) {
      this.weightMap.set(this.externalNode.fqIname, 1.0);
    }

    nodes.forEach((node) => {
      if ((that.parent(node) === null) || numChildrenMap.get(node.fqIname) === undefined) { return; }

      if (numChildrenMap.get(node.fqIname) === -1 || numChildrenMap.get(that.parent(node).fqIname) === 0) {
        this.weightMap.set(node.fqIname, 0);

      } else {
        this.weightMap.set(node.fqIname, numChildrenMap.get(node.fqIname) / numChildrenMap.get(that.parent(node).fqIname));
      }
    });

    //console.log(numChildrenMap, that.weightMap);
  }

  private calculateSummedChildrenMap(): void {
    var that = this,
      node: Node = null,
      queue: Node[] = [],
      children: Node[] = null,
      numChildren = 0,
      leavesOnly = 0;

    queue.push(this.rootNode);

    while (queue.length > 0) {
      node = queue.shift();
      children = that.children(node);
      if (that.hasChildren(node)) {
        leavesOnly = children.filter((n) => { return !that.hasChildren(n); }).length;
        // if this node contains only leaves skip
        if (children.length === leavesOnly) {
          continue;
        }

        numChildren = this.summedChildrenMap.get(node.fqIname);
        if (numChildren === undefined) { numChildren = 0; }

        numChildren += children.length;

        // count only the gaps per level (gaps = nodes-1 per level)
        numChildren -= (children.length >= 1) ? 1 : 0;

        // bubble the counting result to the parent nodes
        var parents = node === this.rootNode ? [node] : node.parents;
        parents.forEach((p) => {
          if (node === p) { return; }
          var num = this.summedChildrenMap.get(p.fqIname);
          if (num === undefined) { num = 0; }
          num += numChildren;
          this.summedChildrenMap.set(p.fqIname, num);
        });

        this.summedChildrenMap.set(node.fqIname, numChildren);

      }
      queue = queue.concat(children);
    }

    //console.log(this.summedChildrenMap);
  }

  private positionNodes(bundle: PVDLayoutBundle, gridWidth: number, gridHeight: number, baseWidth: number, baseHeight: number): void {
    var that = this,
      nodeDimMap = bundle.positions,
      prevSibDim = undefined,
      children = [],
      scale = [], // [width, height]
      offsetY = 0,
      indexOf = 0,
      sumCollapsedHeight = 0,
      parentOffsetY = 0,
      calc = 0,
      isLastChild = true,
      isFirstChild = true,
      parentDim = new PVDLayoutDimensions();

    parentDim.x = 0;
    parentDim.y = 0;
    parentDim.width = this.externalNode ? this.scaleFactor(this.externalNode)[0] * baseWidth : 0;
    parentDim.height = Math.floor((gridHeight - that.offsetY(this.rootNode)) / baseHeight) * baseHeight + that.offsetY(this.rootNode);

    // external
    if (this.externalNode) {
      nodeDimMap.set(this.externalNode.fqIname, parentDim);
    } else {
      nodeDimMap.set('_external', parentDim);
    }

    var node: Node = null,
      queue: Node[] = [],
      leaves: Node[] = [];

    queue.push(this.rootNode);

    while (queue.length > 0) {
      node = queue.shift();
      if (that.hasChildren(node) || that.hasIntermediateSiblings(node)) {
        positionIntermediate(node);
      } else {
        leaves.push(node);
      }
      queue = queue.concat(that.children(node));
    }

    this.positionLeaves(nodeDimMap, leaves, baseWidth, baseHeight);

    function positionIntermediate(node) {
      sumCollapsedHeight = 0;
      var parent = that.parent(node);
      if (parent !== null) { //has parent and not the root
        parentDim = nodeDimMap.get(parent.fqIname);
        children = that.children(parent);
        indexOf = children.indexOf(node);
        prevSibDim = (indexOf > 0 && indexOf - 1 >= 0) ? nodeDimMap.get(children[indexOf - 1].fqIname) : undefined;

        // leaves only
        //children.filter((n) => {
        //  return !that.hasChildren(n);
        //})
        children.forEach((n, idx) => {
          sumCollapsedHeight += that.scaleFactor(n)[1] * baseHeight;
          //if(idx > 0) {
          //sumCollapsedHeight += that.offsetIntermediate[1];
          //}
        });

        isLastChild = (children.length - 1 === indexOf);
        isFirstChild = (indexOf === 0);
      }

      offsetY = 1 * that.offsetY(node);
      scale = that.scaleFactor(node);

      var nodeDim = new PVDLayoutDimensions();

      // intermediate nodes OR collapsed intermediate node
      if (that.hasChildren(node) || that.hasIntermediateSiblings(node)) {
        //console.log(node.fqIname, 'is intermediate');

        nodeDim.x = 1 * parentDim.x + 1 * parentDim.width + ((node === that.rootNode || node.master) ? 0 : that.offsetIntermediate[0]);
        nodeDim.y = (prevSibDim === undefined) ? 1 * parentDim.y : 1 * prevSibDim.y + 1 * prevSibDim.height;
        if (prevSibDim !== undefined && nodeDim.y > 0) {
          nodeDim.y += that.offsetIntermediate[1];
        }
        nodeDim.width = scale[0] * baseWidth;

        // collapsed intermediate node
        if (!that.hasChildren(node) && that.hasIntermediateSiblings(node)) {
          nodeDim.height = scale[1] * baseHeight;

          // all other intermediate nodes
        } else if (that.weightMap.get(node.fqIname) !== undefined) {
          parent = that.parent(node);
          parentOffsetY = (parent === null) ? 0 : that.offsetY(parent);

          if (parent === null) {
            calc = (parentDim.height - parentOffsetY - sumCollapsedHeight - offsetY - scale[1] * baseHeight);

          } else {
            calc = (parentDim.height - parentOffsetY - sumCollapsedHeight);
          }

          //console.log(parentDim.height, parentOffsetY, sumCollapsedHeight, offsetY, calc, scale[1] * baseHeight);

          nodeDim.height = scale[1] * baseHeight + calc * that.weightMap.get(node.fqIname) + offsetY;
        }

      }

      //console.log(node.fqIname, that.weightMap.get(node.fqIname), '|| parent', parentDim.y, parentDim.height, '|| node', nodeDim.y, nodeDim.height, '|| grid', baseHeight, gridHeight);

      nodeDimMap.set(node.fqIname, nodeDim);
    }
  }

  private positionLeaves(nodeDimMap: d3.Map<PVDLayoutDimensions>, leaves: Node[], baseWidth: number, baseHeight: number): void {
    var that = this,
      recalculate = false,
      scale = [],
      parentDim = nodeDimMap.get(that.externalNode ? that.externalNode.fqIname : '_external'),
      parentDimCache = null,
      checkCollisions = [];

    leaves.forEach((node) => {
      var parent = that.parent(node);
      if (parent !== null) {
        parentDim = nodeDimMap.get(parent.fqIname);

        if (parentDim === undefined || parentDim === null) {
          console.warn('no dimensions for', parent.fqIname);
          parentDim = nodeDimMap.get(that.externalNode ? that.externalNode.fqIname : '_external');
        }
      }

      //console.log(node.fqIname, parentDim, parentDimCache);

      // already inserted (maybe as selected node for inlayUp)
      if (nodeDimMap.get(node.fqIname) !== undefined) {
        return;
      }

      var nodeDim = new PVDLayoutDimensions();

      scale = that.scaleFactor(node);
      nodeDim.width = scale[0] * baseWidth;
      nodeDim.height = scale[1] * baseHeight;

      nodeDim.x = (node.master ? 0 : that.offsetIntermediate[0]) + parentDim.x + parentDim.width;
      nodeDim.y = parentDim.y;

      do {
        recalculate = false;

        for (var i = checkCollisions.length - 1; i >= 0; i--) {
          if (that.isCollide(checkCollisions[i], nodeDim)) {
            recalculate = true;

            nodeDim.y = checkCollisions[i].y + checkCollisions[i].height + 1;

            if (nodeDim.y + nodeDim.height + that.offsetLeaves[1] > parentDim.y + parentDim.height) {
              nodeDim.y = parentDim.y;
              nodeDim.x += nodeDim.width + that.offsetLeaves[0];
            }
            break;
          }
        }
      } while (recalculate);

      if (nodeDim.y !== parentDim.y) {
        nodeDim.y += that.offsetLeaves[1];
      }

      //console.log(node.fqIname, '|| parent', parentDim.x, parentDim.width, '|| node', nodeDim.x, nodeDim.width);

      this.maxWidth = Math.max(this.maxWidth, (nodeDim.x + nodeDim.width));
      this.maxHeight = Math.max(this.maxHeight, (nodeDim.y + nodeDim.height));

      nodeDimMap.set(node.fqIname, nodeDim);

      // add nodeDim to collision check
      checkCollisions.push(nodeDim);
    });
  }

  private offsetX(node: Node): number {
    var sum = this.summedChildrenMap.get(node.fqIname);
    if (sum === undefined) { sum = 0; }
    return this.offsetIntermediate[0] * sum;
  }

  private offsetY(node: Node): number {
    var sum = this.summedChildrenMap.get(node.fqIname);
    if (sum === undefined) { sum = 0; }
    return this.offsetIntermediate[1] * sum;
  }

  private getSiblings(node: Node): Node[] {
    var that = this,
      result = [];

    if (that.parent(node) === null) { return result; }

    that.children(that.parent(node)).forEach((n) => {
      if (n === node) { return; }
      result.push(n);
    });

    return result;
  }

  private hasIntermediateSiblings(node: Node): boolean {
    var that = this,
      result = false;

    that.getSiblings(node).forEach((n) => {
      if (result === false) {
        result = that.hasChildren(n);
      }
    });

    return result;
  }

  private isCollide(a: PVDLayoutDimensions, b: PVDLayoutDimensions): boolean {
    if (a === null || b === null) {
      return false;
    } else {
      return !(
        ((a.y + a.height) < (b.y + this.offsetLeaves[1])) ||
        (a.y + this.offsetLeaves[1] > (b.y + b.height)) ||
        ((a.x + a.width) < b.x + this.offsetLeaves[0]) ||
        (a.x + this.offsetLeaves[0] > (b.x + b.width))
      );
    }
  }

  private groupMasterNodes(bundle: PVDLayoutBundle) {
    var that = this;
    function bundleThem(node: Node, masters: Node[]) {
      var n = bundle.positions.get(node.fqIname);
      var m = masters.map((mi) => bundle.positions.get(mi.fqIname));
      //FIXME place a border around the master nodes
      //bundle.edges.push({
      //  fqname : node.fqIname+'-masters',
      //  path: () => path;
      //})
    }
    function t(node: Node) {
      var c = that.children(node);
      var masters = c.filter((node) => node.master);
      if (masters.length > 0) {
        bundleThem(node, masters);
      }
      c.forEach(t);
    }
    t(this.rootNode);
  }
}
