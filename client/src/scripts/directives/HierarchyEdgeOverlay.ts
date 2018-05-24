/**
 * Created by Holger Stitz on 05.09.2014.
 */

import * as angular from 'angular';
import * as d3 from 'd3';
import { nextID } from './VisUtils';
import { PVDLayoutDimensions } from './layouts/Layout';
import { PVDElement } from './HierarchyNode';
import { PVDHierarchyConfig } from './HierarchyConfig';

'use strict';

export interface PVDLayoutEdge {
  fqname: string;
  path(): string;
  cssClass: string;
}

class PVDPoint {
  constructor(public x: number = 0, public y: number = 0) {

  }
}

export class DiagonalPVDLayoutEdge implements PVDLayoutEdge {

  // horizontal
  static LEFT: string = 'left';
  static CENTER: string = 'center';
  static RIGHT: string = 'right';

  // vertical
  static TOP: string = 'left';
  // center defined above
  static BOTTOM: string = 'right';

  public sourceAnchor: string[] = [DiagonalPVDLayoutEdge.CENTER, DiagonalPVDLayoutEdge.BOTTOM];
  public targetAnchor: string[] = [DiagonalPVDLayoutEdge.CENTER, DiagonalPVDLayoutEdge.TOP];

  public fqname: string = 'edge' + nextID();
  public fqIname: string = this.fqname;

  constructor(public source: PVDLayoutDimensions = new PVDLayoutDimensions(), public target: PVDLayoutDimensions = new PVDLayoutDimensions(), public cssClass: string = '') {

  }

  private sourceAnchorPoint(): PVDPoint {
    return this.anchorPoint(this.source, this.sourceAnchor[0], this.sourceAnchor[1]);
  }

  private targetAnchorPoint(): PVDPoint {
    return this.anchorPoint(this.target, this.targetAnchor[0], this.targetAnchor[1]);
  }

  private anchorPoint(dim: PVDLayoutDimensions, horizontalAnchor: string, verticalAnchor: string): PVDPoint {
    var point = new PVDPoint(dim.x, dim.y);

    if (horizontalAnchor === DiagonalPVDLayoutEdge.CENTER) {
      point.x += Math.round(0.5 * dim.width);

    } else if (horizontalAnchor === DiagonalPVDLayoutEdge.RIGHT) {
      point.x += dim.width;
    }

    if (verticalAnchor === DiagonalPVDLayoutEdge.CENTER) {
      point.y += Math.round(0.5 * dim.height);

    } else if (verticalAnchor === DiagonalPVDLayoutEdge.BOTTOM) {
      point.y += dim.height;
    }

    return point;
  }

  private shift(s: any, t: any, hAnchor: string, vAnchor: string) {
    var r = {
      x: hAnchor === DiagonalPVDLayoutEdge.CENTER ? s.x : Math.round((s.x + t.x) * 0.5),
      y: vAnchor === DiagonalPVDLayoutEdge.CENTER ? s.y : Math.round((s.y + t.y) * 0.5)
    };
    return r;
  }

  path(): string {
    var s = this.sourceAnchorPoint();
    var t = this.targetAnchorPoint();
    var sn = this.shift(s, t, this.sourceAnchor[0], this.sourceAnchor[1]);
    var tn = this.shift(t, s, this.targetAnchor[0], this.targetAnchor[1]);
    if (isNaN(s.x)) {
      debugger;
    }
    var p = 'M' + s.x + ',' + s.y + ' C' + sn.x + ',' + sn.y + ' ' + tn.x + ',' + tn.y + ' ' + t.x + ',' + t.y;
    return p;
  }
}

export function edgeBetween(source: PVDLayoutDimensions, target: PVDLayoutDimensions, fqIname?: string): PVDLayoutEdge {
  var r = new DiagonalPVDLayoutEdge(source, target);
  r.sourceAnchor = [DiagonalPVDLayoutEdge.CENTER, DiagonalPVDLayoutEdge.BOTTOM];
  r.targetAnchor = [DiagonalPVDLayoutEdge.CENTER, DiagonalPVDLayoutEdge.TOP];
  if (fqIname) {
    r.fqIname = fqIname;
  }
  return r;
}

export class DendrogramPVDLayoutEdge implements PVDLayoutEdge {

  public fqname: string = 'dg-edge' + nextID();
  public fqIname: string = this.fqname;

  constructor(public source: PVDLayoutDimensions = new PVDLayoutDimensions(), public target: PVDLayoutDimensions = new PVDLayoutDimensions(), public cssClass: string = '', public shift: number[] = [0, 0]) {

  }

  path(): string {
    var s = this.source,
      t = this.target,
      p = 'M ' + (s.x) + ' ' + (s.y + this.shift[1]) + ' ' +
        'L ' + (s.x + this.shift[0]) + ' ' + (s.y + this.shift[1]) + ' ' +
        'L ' + (t.x + this.shift[0]) + ' ' + (t.y + this.shift[1]) + ' ' +
        'L ' + (t.x) + ' ' + (t.y + this.shift[1]);
    return p;
  }
}

/**
 * SVG overlay to show the edges between nodes
 */
export class PVDHierarchyEdgeOverlay implements PVDElement {
  $node: d3.Selection<any>;
  _scaleFactor: number[];
  isVisible = true;

  constructor($parent: d3.Selection<any>, private config: PVDHierarchyConfig) {
    this.$node = $parent.append('svg').attr('class', 'hg-edge-overlay');
  }

  draw(edges: PVDLayoutEdge[]): void {
    var $edges = this.$node.selectAll('path').data(edges, (d: any) => d.fqIname);

    $edges.enter().insert('path')
      .attr('class', (d) => 'hg-edge ' + d.cssClass)
      .attr('data-fqname', (d: any) => d.fqIname)
      //.attr('d', (d) => { return d.path(); })
      .style('opacity', 0);

    $edges
      .transition().duration(this.config.transitionDuration)
      .attr('d', (d) => d.path())
      .style('opacity', 1);

    $edges.exit().remove()
      .style('opacity', 0);
  }

  hide() {
    if (!this.isVisible) { return; }
    this.isVisible = false;
    this.$node.style('display', 'none');
  }

  show() {
    if (this.isVisible) { return; }
    this.isVisible = true;
    this.$node.style('display', null);
  }

  fadeIn() {
    if (this.isVisible) { return; }
    this.isVisible = true;
    this.$node
      .style('display', null)
      .transition().duration(this.config.transitionDuration)
      .style('opactiy', 1);
  }

  fadeOut() {
    if (!this.isVisible) { return; }
    this.isVisible = false;
    this.$node
      .transition().duration(this.config.transitionDuration)
      .style('opactiy', 0)
      .each('end', () => {
        this.$node.style('display', 'none');
      });
  }

  get scaleFactor() {
    return this._scaleFactor;
  }

  setScaleFactor(dim: number, val: number) {
    this._scaleFactor[dim] = val;
  }

  pos(x: number, y: number) {
    this.$node.style({
      top: y + 'px',
      left: x + 'px'
    });
  }

  relayout(width: number, height: number): void {
    this.$node.style({
      'width': width + 'px',
      'height': height + 'px'
    });
  }

}
