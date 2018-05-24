/**
 * Created by Holger Stitz on 24.10.2014.
 */
import * as d3 from 'd3';
import { PVDALayout, IPVDLayout, PVDLayoutBundle, PVDLayoutDimensions } from './Layout';
import { DendrogramPVDLayoutEdge, PVDLayoutEdge } from '../HierarchyEdgeOverlay';

'use strict';


/**
 * This creates a stacked layout.
 * Beginning at the top the nodes are iterated by depth first search and stacked below.
 */
export class PVDStackLayout extends PVDALayout implements IPVDLayout {
  static ID: string = 'stack';
  static NAME: string = 'Stack';

  id = PVDStackLayout.ID;
  name = PVDStackLayout.NAME;

  padding = 0;

  constructor(public isDown: boolean = false) {
    super();
    this.drawEdges = true;
  }

  apply(gridWidth: number, gridHeight: number, baseWidth: number, baseHeight: number): PVDLayoutBundle {
    var bundle: PVDLayoutBundle = new PVDLayoutBundle();
    var r = bundle.positions;
    var graph = this.createGraph(this.rootNode, baseWidth, baseHeight, r);
    var flat = [];
    var shifty = 5;
    graph.accept((f) => flat.push(f));
    this.layout(graph, flat, shifty, bundle, gridWidth);
    return bundle;
  }

  layout(graph: any, flat: any[], offset: number, bundle: PVDLayoutBundle, gridWidth: number) {
    var that = this;
    var pos = null;
    var lastY = 0;
    var shiftEdges = [-10, 10];

    function position(node) {
      pos = bundle.positions.get(node.fqIname);
      pos.x = shiftEdges[0] * -1;
      pos.y = lastY;
      pos.width = gridWidth - pos.x;
      lastY += pos.height + offset;

      if (that.drawEdges && node.parent !== null) {
        var l = new DendrogramPVDLayoutEdge(node.parent.dim, node.dim, null);
        l.shift = shiftEdges;
        bundle.edges.push(l);
      }
    }

    if (this.isDown) {
      flat.forEach(position);
    } else {
      var top = flat.slice(flat.indexOf(graph.children[0]), flat.indexOf(graph.children[1])).reverse(),
        bottom = flat.slice(flat.indexOf(graph.children[1]), flat.length),
        concat = top.concat(graph, bottom);
      concat.forEach(position);
    }
  }

  edges(positions: d3.Map<PVDLayoutDimensions>, edges: PVDLayoutEdge[]): PVDLayoutEdge[] {
    return edges;
  }
}
