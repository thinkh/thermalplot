/**
 * Created by Holger Stitz on 18.08.2014.
 */
import * as d3 from 'd3';
import { PVDALayout, IPVDLayout, PVDLayoutBundle, PVDLayoutDimensions } from './Layout';
import { Node } from '../../models/Infrastructure';
import { PVDHierarchyAInlay } from '../HierarchyInlay';

'use strict';

/**
 * This creates a space-filling layout.
 * The width of th intermediate nodes is weighted according to the number of leaf nodes and distributed to the grid width.
 * The leaf nodes have a fixed width and positioned in a grid layout
 */
export class PVDGridLayout extends PVDALayout implements IPVDLayout {
  static ID: string = 'grid';
  static NAME: string = 'Hierarchical Grid';

  id = PVDGridLayout.ID;
  name = PVDGridLayout.NAME;

  private offsetIntermediate: number[] = [0, 0]; // [width, height]
  private offsetLeaves: number[] = [1, 1]; // [width, height]
  private weightMap: d3.Map<number> = d3.map();
  private summedChildrenMap: d3.Map<number> = d3.map();

  private maxWidth = 0;
  private maxHeight = 0;

  private positionInlayUpBelowGrid = true;

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
      offsetX = 0,
      indexOf = 0,
      sumCollapsedWidth = 0,
      parentOffsetX = 0,
      calc = 0,
      isLastChild = true,
      isFirstChild = true,
      parentDim = new PVDLayoutDimensions();

    parentDim.x = 0;
    parentDim.y = 0;
    //parentDim.width = Math.floor((gridWidth) / baseWidth) * baseWidth;
    parentDim.width = Math.floor((gridWidth - that.offsetX(this.rootNode)) / baseWidth) * baseWidth + that.offsetX(this.rootNode);
    parentDim.height = this.externalNode ? this.scaleFactor(this.externalNode)[1] * baseHeight : 0;

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

    ////////////////////////////////
    // position inlay first, to position leaves around inlay
    if (this.positionInlayUpBelowGrid === false) {
      this.positionInlayUp(nodeDimMap, baseWidth, baseHeight);
    }

    this.positionLeaves(nodeDimMap, leaves, baseWidth, baseHeight);

    // position inlay as second, to position inlay below leaves
    if (this.positionInlayUpBelowGrid === true) {
      this.positionInlayBelowGrid(this.inlayUp, nodeDimMap, gridWidth, gridHeight, baseWidth, baseHeight);
    }
    this.positionInlayBelowGrid(this.inlayDown, nodeDimMap, gridWidth, gridHeight, baseWidth, baseHeight);
    ///////////////////////////////

    function positionIntermediate(node) {
      sumCollapsedWidth = 0;
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
          sumCollapsedWidth += that.scaleFactor(n)[0] * baseWidth;
          //if(idx > 0) {
          //sumCollapsedWidth += that.offsetIntermediate[0];
          //}
        });

        isLastChild = (children.length - 1 === indexOf);
        isFirstChild = (indexOf === 0);
      }

      offsetX = 1 * that.offsetX(node);
      scale = that.scaleFactor(node);

      var nodeDim = new PVDLayoutDimensions();

      // intermediate nodes OR collapsed intermediate node
      if (that.hasChildren(node) || that.hasIntermediateSiblings(node)) {
        //console.log(node.fqIname, 'is intermediate');

        nodeDim.x = (prevSibDim === undefined) ? 1 * parentDim.x : 1 * prevSibDim.x + 1 * prevSibDim.width;
        if (prevSibDim !== undefined && nodeDim.x > 0) {
          nodeDim.x += that.offsetIntermediate[0];
        }
        nodeDim.y = 1 * parentDim.y + 1 * parentDim.height + (node.master ? 0 : that.offsetIntermediate[1]);
        nodeDim.height = scale[1] * baseHeight;

        // collapsed intermediate node
        if (!that.hasChildren(node) && that.hasIntermediateSiblings(node)) {
          nodeDim.width = scale[0] * baseWidth;

          // all other intermediate nodes
        } else if (that.weightMap.get(node.fqIname) !== undefined) {
          parent = that.parent(node);
          parentOffsetX = (parent === null) ? 0 : that.offsetX(parent);

          if (parent === null) {
            calc = (parentDim.width - parentOffsetX - sumCollapsedWidth - offsetX - scale[0] * baseWidth);

          } else {
            calc = (parentDim.width - parentOffsetX - sumCollapsedWidth);
          }

          //console.log(parentDim.width, parentOffsetX, sumCollapsedWidth, offsetX, calc, scale[0] * baseWidth);

          nodeDim.width = scale[0] * baseWidth + calc * that.weightMap.get(node.fqIname) + offsetX;
        }

      }

      //console.log(node.fqIname, that.weightMap.get(node.fqIname), '|| parent', parentDim.x, parentDim.width, '|| node', nodeDim.x, nodeDim.width, '|| grid', baseWidth, gridWidth);

      nodeDimMap.set(node.fqIname, nodeDim);
    }
  }

  private positionInlayUp(nodeDimMap: d3.Map<PVDLayoutDimensions>, baseWidth: number, baseHeight: number) {
    var that = this,
      inlayUp = this.inlayUp;

    if (inlayUp === null) {
      return;
    }
    else if (!inlayUp.isFilled) {
      nodeDimMap.set(inlayUp.fqIname, null);
      return;
    }

    var distanceFactor = 20 * baseWidth,
      srcParentDim = nodeDimMap.get(that.parent(inlayUp.selectedSrc).fqIname),
      dstParentDim = nodeDimMap.get(that.parent(inlayUp.selectedDst).fqIname),
      srcDim = new PVDLayoutDimensions(),
      dstDim = new PVDLayoutDimensions(),
      srcScale = this.scaleFactor(inlayUp.selectedSrc),
      dstScale = this.scaleFactor(inlayUp.selectedDst);

    srcDim.width = srcScale[0] * baseWidth;
    srcDim.height = srcScale[1] * baseHeight;

    dstDim.width = dstScale[0] * baseWidth;
    dstDim.height = dstScale[1] * baseHeight;

    var inlayUpDim = this.inlayDim(inlayUp, baseWidth, baseHeight);
    inlayUpDim.x = 0;
    inlayUpDim.y = 0;

    function placeBeside(nodeDim, isLeft: boolean) {
      if (isLeft) {
        nodeDim.x = inlayUpDim.x - nodeDim.width - distanceFactor;
        nodeDim.y = inlayUpDim.y + inlayUpDim.height - nodeDim.height;
      } else {
        nodeDim.x = inlayUpDim.x + inlayUpDim.width + distanceFactor;
        nodeDim.y = inlayUpDim.y + inlayUpDim.height - nodeDim.height;
      }
    }

    function placeBelow(nodeDim, isLeft: boolean) {
      if (isLeft) {
        nodeDim.x = inlayUpDim.x;
        nodeDim.y = inlayUpDim.y + inlayUpDim.height + distanceFactor;
      } else {
        nodeDim.x = inlayUpDim.x + inlayUpDim.width - nodeDim.width;
        nodeDim.y = inlayUpDim.y + inlayUpDim.height + distanceFactor;
      }
    }

    function placeInside(childDim, parentDim, isLeft: boolean) {
      if (isLeft) {
        childDim.x = parentDim.x;
        childDim.y = parentDim.y + parentDim.height + that.offsetIntermediate[1];

      } else {
        childDim.x = parentDim.x + parentDim.width - childDim.width;
        childDim.y = parentDim.y + parentDim.height + that.offsetIntermediate[1];

      }
    }

    // same parent
    //console.log(srcParentDim, dstParentDim, srcParentDim === dstParentDim);
    if (srcParentDim === dstParentDim) {

      inlayUp.includeOriginals = false;

      // position the selected nodes below the inlayUp
      if (inlayUpDim.width + srcDim.width + 2 * distanceFactor + dstDim.width > srcParentDim.width) {
        inlayUpDim.x = srcParentDim.x;
        inlayUpDim.y = srcParentDim.y + srcParentDim.height + this.offsetIntermediate[1];

        placeBelow(srcDim, true);
        placeBelow(dstDim, false);

        // position the selected nodes left and right to the inlayUp bottom
      } else {
        inlayUpDim.x = srcParentDim.x + srcDim.width + distanceFactor;
        inlayUpDim.y = srcParentDim.y + srcParentDim.height + this.offsetIntermediate[1];

        placeBeside(srcDim, true);
        placeBeside(dstDim, false);
      }

    } else {
      var parentDistance = 0,
        leftParentDim: PVDLayoutDimensions = null,
        leftDim: PVDLayoutDimensions = null,
        rightParentDim: PVDLayoutDimensions = null,
        rightDim: PVDLayoutDimensions = null;

      if (srcParentDim.x < dstParentDim.x) {
        parentDistance = dstParentDim.x - (srcParentDim.x + srcParentDim.width + this.offsetIntermediate[0]);
        leftParentDim = srcParentDim;
        leftDim = srcDim;
        rightParentDim = dstParentDim;
        rightDim = dstDim;

      } else {
        parentDistance = srcParentDim.x - (dstParentDim.x + dstParentDim.width + this.offsetIntermediate[0]);
        leftParentDim = dstParentDim;
        leftDim = dstDim;
        rightParentDim = srcParentDim;
        rightDim = srcDim;

      }

      // position the selected nodes left and right to the inlayUp bottom
      if (parentDistance === 0) {

        inlayUp.includeOriginals = false;
        inlayUpDim.x = rightParentDim.x - 0.5 * inlayUpDim.width;
        inlayUpDim.y = leftParentDim.y + leftParentDim.height + this.offsetIntermediate[1];

        // position the selected nodes below the inlayUp
        if (0.5 * inlayUpDim.width + leftDim.width + distanceFactor > leftParentDim.width ||
          0.5 * inlayUpDim.width + rightDim.width + distanceFactor > rightParentDim.width) {
          placeBelow(leftDim, true);
          placeBelow(rightDim, false);

          // position the selected nodes left and right to the inlayUp bottom
        } else {
          placeBeside(leftDim, true);
          placeBeside(rightDim, false);
        }

      } else {

        inlayUp.includeOriginals = true;
        inlayUpDim.x = 0.5 * parentDistance + leftParentDim.x + leftParentDim.width + this.offsetIntermediate[0] - 0.5 * inlayUpDim.width;
        inlayUpDim.y = leftParentDim.y + leftParentDim.height + this.offsetIntermediate[1];

        if (leftParentDim.y > rightParentDim.y) {
          placeInside(leftDim, leftParentDim, true);
          placeInside(rightDim, rightParentDim, false);
        } else {
          placeInside(leftDim, leftParentDim, false);
          placeInside(rightDim, rightParentDim, true);
        }
      }
    }

    nodeDimMap.set(inlayUp.fqIname, inlayUpDim);
    nodeDimMap.set(inlayUp.selectedSrc.fqIname, srcDim);
    nodeDimMap.set(inlayUp.selectedDst.fqIname, dstDim);
  }

  private positionInlayBelowGrid(inlay: PVDHierarchyAInlay, nodeDimMap: d3.Map<PVDLayoutDimensions>, gridWidth: number, gridHeight: number, baseWidth: number, baseHeight: number) {
    if (inlay === null) {
      return;
    } else if (!inlay.isFilled) {
      nodeDimMap.set(inlay.fqIname, null);
      return;
    }
    var dim = this.inlayDim(inlay, baseWidth, baseHeight);

    if (isNaN(inlay.width) || isNaN(inlay.height)) {
      dim.width = this.maxWidth;
    }

    dim.x = Math.max(nodeDimMap.get(inlay.selectedSrc.fqIname).x + nodeDimMap.get(inlay.selectedSrc.fqIname).width / 2 - dim.width / 2, 0);
    dim.x = (dim.x + dim.width > gridWidth) ? gridWidth - dim.width : dim.x;
    dim.y = this.maxHeight + 3 * baseHeight;
    nodeDimMap.set(inlay.fqIname, dim);
  }

  private positionLeaves(nodeDimMap: d3.Map<PVDLayoutDimensions>, leaves: Node[], baseWidth: number, baseHeight: number): void {
    var that = this,
      inlayUp = this.inlayUp,
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

      if (parentDimCache !== parentDim) {
        parentDimCache = parentDim;

        // on new parent -> clear collision with other children
        checkCollisions = [];

        if (this.positionInlayUpBelowGrid === false &&
          inlayUp !== null && inlayUp.selectedSrc !== null && inlayUp.selectedDst !== null) {

          checkCollisions.push(
            nodeDimMap.get(inlayUp.fqIname),
            nodeDimMap.get(inlayUp.selectedSrc.fqIname),
            nodeDimMap.get(inlayUp.selectedDst.fqIname)
          );
        }
      }

      // already inserted (maybe as selected node for inlayUp)
      if (nodeDimMap.get(node.fqIname) !== undefined) {
        return;
      }

      var nodeDim = new PVDLayoutDimensions();

      scale = that.scaleFactor(node);
      nodeDim.width = scale[0] * baseWidth;
      nodeDim.height = scale[1] * baseHeight;

      nodeDim.x = parentDim.x;
      nodeDim.y = (node.master ? 0 : that.offsetIntermediate[1]) + parentDim.y + parentDim.height;

      do {
        recalculate = false;

        for (var i = checkCollisions.length - 1; i >= 0; i--) {
          if (that.isCollide(checkCollisions[i], nodeDim)) {
            recalculate = true;

            nodeDim.x = checkCollisions[i].x + checkCollisions[i].width + 1;

            if (nodeDim.x + nodeDim.width + that.offsetLeaves[0] > parentDim.x + parentDim.width) {
              nodeDim.x = parentDim.x;
              nodeDim.y += nodeDim.height + that.offsetLeaves[1];
            }
            break;
          }
        }
      } while (recalculate);

      if (nodeDim.x !== parentDim.x) {
        nodeDim.x += that.offsetLeaves[0];
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
