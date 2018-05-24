/**
 * Created by Holger Stitz on 18.08.2014.
 */
import * as d3 from 'd3';
import { PVDALayout, PVDLayoutBundle, PVDLayoutNode, PVDLayoutDimensions, IPVDLayout, DiagonalPVDLayoutEdge } from './Layout';
import { PVDLayoutEdge, edgeBetween } from '../HierarchyEdgeOverlay';

'use strict';

/**
 * Creates a node-link layout with edges between the nodes
 */
export class PVDANodeLinkLayout extends PVDALayout {
  padding = 5;

  constructor() {
    super();
  }

  apply(gridWidth: number, gridHeight: number, baseWidth: number, baseHeight: number): PVDLayoutBundle {
    var bundle: PVDLayoutBundle = new PVDLayoutBundle();
    var r = bundle.positions;
    var graph = this.createGraph(this.rootNode, baseWidth, baseHeight, r);
    var external = this.externalNode ? this.createGraph(this.externalNode, baseWidth, baseHeight, r) : null;

    var flat = [];
    graph.accept((f) => flat.push(f));
    this.moveMasters(graph);

    if (external) {
      external.width = gridWidth;
    }
    var shifty = (external ? external.height + this.padding : 0);

    shifty = this.layout(graph, flat, shifty, bundle, gridWidth);

    this.setInlayUp(flat, bundle, shifty, baseWidth, baseHeight, gridWidth);
    this.setInlayDown(flat, bundle, shifty, baseWidth, baseHeight, gridWidth);
    return bundle;
  }

  layout(graph: any, flat: any[], shifty: number, bundle: PVDLayoutBundle, gridWidth: number) {
    return shifty;
  }

  byLevel(flat: any[]) {
    var bylevel = d3.nest().key((f: any) => f.level).entries(flat.filter((f) => !f.node.master));
    var bybetterlevel = bylevel.map((entry) => {
      var r = {
        level: +entry.key,
        children: entry.values,
        height: 0,
        width: 0,
        shift: function (x: number, y: number, children = this.children) {
          var shift = (c) => {
            c.x += x;
            c.y += y;
            c.masters.forEach((m) => m.shift(x, y));
          };
          children.forEach(shift);
        }
      };
      entry.values.forEach((node) => {
        var hi = node.height + (node.masters.length > 0 ? d3.max(node.masters.map((n) => n.height)) : 0);
        if (hi > r.height) {
          r.height = hi;
        }
        node.width = Math.max(node.width, (node.masters.length > 0 ? d3.sum(node.masters, (n: any) => n.width) : 0));
        r.width += node.width;
      });
      r.width += (entry.values.length - 1) * this.padding;
      return r;
    });
    return bybetterlevel;
  }

  private moveMasters(graph: PVDLayoutNode) {
    graph.accept((node: any) => {
      //a master and a master of the parent
      node.masters = node.children.filter((c) => (c.node.master && node.node === c.node.parent));
      if (node.masters.length > 0) {
        node.children = node.children.filter((c) => !(c.node.master && node.node === c.node.parent));
        //increase level of the other children
        //node.children.forEach((c) => c.accept((d) => d.level++));
      }
    });
  }

  edges(positions: d3.Map<PVDLayoutDimensions>, edges: PVDLayoutEdge[]): PVDLayoutEdge[] {
    this.positionInlayUpEdges(edges, positions);
    this.positionInlayDownEdges(edges, positions);
    return edges;
  }

  private setInlayUp(flat: PVDLayoutNode[], bundle: PVDLayoutBundle, shifty: number, baseWidth: number, baseHeight: number, gridWidth: number) {
    if (!this.inlayUp || !this.inlayUp.isFilled) {
      return;
    }
    var dim = this.inlayDim(this.inlayUp, baseWidth, baseHeight);
    var i = this.inlayUp;

    var src = flat.filter((n) => n.node === i.selectedSrc)[0];
    var dst = flat.filter((n) => n.node === i.selectedDst)[0];
    if (!src || !dst) {
      return;
    }
    if (src.x < dst.x) {
      dim.x = Math.max((src.x + dst.x + dst.width) / 2 - dim.width / 2, 0);
    } else {
      dim.x = Math.max((dst.x + src.x + src.width) / 2 - dim.width / 2, 0);
    }
    dim.x = Math.min(dim.x, gridWidth - dim.width);
    dim.y = shifty + this.padding;

    bundle.positions.set(i.fqIname, dim);
    /*
    var p = 'M'+(target.dim.x+target.dim.width/2)+','+(target.dim.y+target.dim.height)+' L'+(dim.x+dim.width/2)+','+dim.y;
    bundle.edges.push({
      fqname : target.fqIname+'-inlaydown',
      path : () => p
    });
    */
  }

  private setInlayDown(flat: PVDLayoutNode[], bundle: PVDLayoutBundle, shifty: number, baseWidth: number, baseHeight: number, gridWidth: number) {
    if (!this.inlayDown || !this.inlayDown.isFilled) {
      return;
    }
    var dim = this.inlayDim(this.inlayDown, baseWidth, baseHeight);
    var i = this.inlayDown;

    var search = i.selectedSrc;
    var target = flat.filter((n) => n.node === search)[0];
    if (!target) {
      return;
    }
    dim.x = Math.min(Math.max(target.x + target.width / 2 - dim.width / 2, 0), gridWidth - dim.width);
    dim.y = shifty + this.padding + 5;//inner padding

    bundle.positions.set(i.fqIname, dim);
    /*var p = 'M'+(target.dim.x+target.width/2)+','+(target.y+target.height)+' L'+(dim.x+dim.width/2)+','+dim.y;
    bundle.edges.push({
      fqname : target.node.fqIname+'-inlaydown',
      path : () => p,
      cssClass : 'hg-edge-duplicate'
    });*/
  }
}

export class PVDAbacusLayout extends PVDANodeLinkLayout implements IPVDLayout {
  static ID: string = 'abacus';
  static NAME: string = 'Abacus';

  id = PVDAbacusLayout.ID;
  name = PVDAbacusLayout.NAME;

  constructor() {
    super();
  }

  get edgesBelowNodes() {
    return true;
  }

  layout(graph: any, flat: any[], shifty: number, bundle: PVDLayoutBundle, gridWidth: number) {
    var bylevel = this.byLevel(flat);
    function hline(y, name) {
      var baseheight = graph.height / graph.scale[1];
      var line = {
        fqname: name,
        path: () => 'M0,' + (y + baseheight) + ' L' + gridWidth + ',' + (y + baseheight),
        cssClass: 'thicker'
      };
      bundle.edges.push(line);
    }
    bylevel.forEach((entry) => {
      var skip = this.padding; //(gridWidth - wacc) / (entry.values.length - 1);
      var wacc = 0;
      var prev = null;
      entry.children.forEach((node) => {
        node.x = wacc;
        node.y = shifty;
        var waccm = node.x;
        node.masters.forEach((m) => {
          m.x = waccm;
          m.y = node.y + node.height;
          waccm += m.width;
        });
        wacc += node.width + skip;
        prev = node;
      });
      hline(shifty, entry.level + ' ');
      shifty += entry.height + this.padding;
    });
    this.highlightSelection(flat, bylevel, bundle, gridWidth);
    return shifty;
  }

  private highlightSelection(flat: any[], bylevel: any[], bundle: PVDLayoutBundle, gridWidth: number) {
    //highlight paths to all selected nodes
    var anySelected = false;
    flat.forEach((node) => {
      if (!node.selected) {
        return;
      }
      anySelected = true;
      while (node.parent) {
        node = node.parent;
        node.selected = true;
        //node.masters.forEach((m) => m.selected = true);
      }
    });

    if (!anySelected) {
      return;
    }

    function addEdge(a, b) {
      var s = {
        x: Math.round(b.x + 0.5 * b.width),
        y: Math.round(b.y)
      };
      var p = new DiagonalPVDLayoutEdge(a.dim, b.dim);
      p.fqIname = b.node.fqIname + '-' + a.node.fqIname;
      if (s.x < a.x - 20) {
        p.sourceAnchor = [DiagonalPVDLayoutEdge.LEFT, DiagonalPVDLayoutEdge.CENTER];
      } else if (s.x > a.x + 20 + a.width) {
        p.sourceAnchor = [DiagonalPVDLayoutEdge.RIGHT, DiagonalPVDLayoutEdge.CENTER];
      }
      if (a.node.infrastructure != b.node.infrastructure) {
        p.cssClass = 'hg-edge-cross-hierarchy';
      }
      bundle.edges.push(p);
    }

    //move selected to the center and shift all to others to the right
    bylevel.forEach((entry) => {
      var s = entry.children.map((n, i) => {
        return { n: n, i: i };
      }).filter((n) => n.n.selected);
      //nothing selected or in total all the space is used
      if (s.length === 0 || entry.children[entry.children.length - 1].x2 >= gridWidth) {
        return;
      }
      var right = entry.children.slice(s[s.length - 1].i + 1);
      var rightw = gridWidth - (right.length == 0 ? 0 : (entry.width - right[0].x) + this.padding);
      if (right.length > 0) {
        entry.shift(rightw - right[0].x + this.padding, 0, right);
      } //shift part to the right
      var leftw = s[0].n.x;
      //space to arrange with possible intermediates: leftw...rightw
      var center = gridWidth / 2;

      if (s.length === 1) { //just a single to center
        var x = Math.max(Math.min(center - s[0].n.width / 2, rightw - s[0].n.width), leftw);
        entry.shift(x - s[0].n.x, 0, entry.children.slice(s[0].i, s[0].i + 1));
      } else {
        //can we use a more padding between the inner blocks
        var extrapadding = (gridWidth - entry.width) / ((s.length * 2 - 2)) * 0.2;
        if (extrapadding > 0) {
          var sl = s[s.length - 1].i;
          //shift me and my inner blocks to the right
          s.forEach((si, j) => {
            entry.shift(extrapadding, 0, entry.children.slice(si.i + 1, sl + 1));
            if (j > 0) {
              entry.shift(extrapadding, 0, entry.children.slice(si.i, sl + 1));
            }
          });
        }
        var wi = s[s.length - 1].n.x2 - s[0].n.x;
        var x = Math.max(Math.min(center - wi / 2, rightw - wi), leftw);
        entry.shift(x - s[0].n.x, 0, entry.children.slice(s[0].i, s[s.length - 1].i + 1));
      }
      //var skip = (gridWidth - entry.width) / (s.length+1);
      //s.forEach((i) => {
      //  entry.shift(skip, 0, entry.children.slice(i.i,i.i+1));
      //  entry.shift(skip*2, 0, entry.children.slice(i.i+1));
      //});
    });

    flat.forEach((node) => {
      if (!node.selected || !node.parent) {
        return;
      }
      //is a child of a parent.masters node
      if (node.parent.masters.length > 0 && node.parent.children.indexOf(node) >= 0) {
        node.parent.masters.forEach((m) => addEdge(m, node));
      } else {
        addEdge(node.parent, node);
      }
    });
  }
}

export class PVDNodeLinkLayout extends PVDANodeLinkLayout implements IPVDLayout {
  static ID: string = 'node-link';
  static NAME: string = 'Node-Link';

  id = PVDNodeLinkLayout.ID;
  name = PVDNodeLinkLayout.NAME;

  constructor(public distribute = true, public stretchIntermediate = false) {
    super();
    this.drawEdges = true;
  }

  layout(graph: any, flat: any[], offset: number, bundle: PVDLayoutBundle, gridWidth: number) {
    var hoffset = this.padding,
      voffset = this.drawEdges ? this.padding * 5 : this.padding,
      leaves = 0,
      bak = offset;
    function shiftWithMaster(node: any, x: number) {
      node.x += x;
      node.masters.forEach((m) => m.x += x);
      node.children.forEach((c) => shiftWithMaster(c, x));
    }
    var traverse = (node: any, shiftx: number, shifty: number) => {
      var acc = shiftx;
      node.x = shiftx;
      node.y = shifty;
      var hi = 0;
      if (node.children.length === 0) {
        leaves++;
      }
      node.masters.forEach((m) => {
        m.x = acc;
        m.y = node.y2;
        acc += m.width;
        hi = Math.max(hi, m.height);
      });
      if (node.masters.length > 1) {
        hi += voffset;
      }
      hi += node.y2 + voffset;
      if (hi > offset) {
        offset = hi;
      }
      var masterwidth = acc - shiftx;
      node.width = Math.max(node.width, masterwidth);
      node.children.forEach((c) => {
        shiftx = traverse(c, shiftx, hi) + hoffset;
      });
      if (node.children.length > 0) {
        shiftx -= hoffset;
      }
      var cwidth = shiftx - node.x;
      var shift = (cwidth - node.width) / 2;
      if (cwidth < node.width) { //center children if parent is wider
        node.children.forEach((c) => shiftWithMaster(c, -shift));
      } else if (this.stretchIntermediate) {
        node.width = cwidth;
      } else {
        node.x += shift;
      }
      //center masters along the node
      if (node.masters.length > 0) {
        shift = node.x + node.width / 2 - (masterwidth) / 2;
        node.masters.forEach((m) => {
          m.x = shift;
          shift += m.width;
        });
      }
      return Math.max(shiftx, node.x2);
    };
    var width = traverse(graph, 0, offset);

    if (width < gridWidth && this.distribute && leaves > 1) {
      // we should distribute the nodes, so compute a new hoffset based on the remaining space and do the fun again
      hoffset += (gridWidth - width) / (leaves - 1);
      traverse(graph, 0, bak);
    }
    if (this.drawEdges) {
      this.drawTheEdges(graph, bundle.edges, voffset);
    }
    return offset;
  }

  private drawTheEdges(graph: any, edges: PVDLayoutEdge[], voffset: number) {
    var t = (node: any) => {
      var p = node.parent;
      if (node.masters.length > 1) {
        node.masters.forEach((m) => edges.push(edgeBetween(m.dim, new PVDLayoutDimensions(node.x, m.y2 + voffset, node.width, 0), m.node.fqIname + '-master')));
      }
      if (!p) {
        return;
      }
      var edge = null;
      switch (p.masters.length) {
        case 0:
          edge = edgeBetween(p.dim, node.dim, node.node.fqIname + '-' + p.node.fqIname);
          break;
        case 1:
          edge = edgeBetween(p.masters[0].dim, node.dim, node.node.fqIname + '-' + p.node.fqIname);
          break;
        default:
          edge = edgeBetween(new PVDLayoutDimensions(p.x, node.y - voffset, p.width, 0), node.dim, node.node.fqIname + '-' + p.node.fqIname);
          break;
      }
      if (edge) {
        edges.push(edge);
        if (node.node.infrastructure != p.node.infrastructure) {
          edge.cssClass = 'hg-edge-cross-hierarchy';
        }
      }

    };
    graph.accept(t);
  }
}

export class PVDIciclePlotLayout extends PVDNodeLinkLayout implements IPVDLayout {
  static ID: string = 'icicle';
  static NAME: string = 'Icicle Plot';

  id = PVDIciclePlotLayout.ID;
  name = PVDIciclePlotLayout.NAME;

  constructor() {
    super(false, true);
    this.drawEdges = false;
  }
}

export class PVDHorizontalNodeLinkLayout extends PVDANodeLinkLayout implements IPVDLayout {
  static ID: string = 'horizontal-node-link';
  static NAME: string = 'Horizontal Node-Link';

  id = PVDNodeLinkLayout.ID;
  name = PVDNodeLinkLayout.NAME;

  constructor() {
    super();
    this.drawEdges = true;
  }

  layout(graph: any, flat: any[], offset: number, bundle: PVDLayoutBundle, gridWidth: number) {
    //assume graph.children.length === 1 or 2
    var act = graph,
      p = this.drawEdges ? this.padding * 2 : this.padding,
      right = act.x2 + p,
      baseHeight = graph.height / graph.scale[1],
      hi = act.height;
    act.y = offset;
    function hline(a, b, name, swi) {
      var l = new DiagonalPVDLayoutEdge(a, b, swi ? 'hg-edge-cross-hierarchy' : null);
      l.sourceAnchor = [DiagonalPVDLayoutEdge.RIGHT, DiagonalPVDLayoutEdge.CENTER];
      l.targetAnchor = [DiagonalPVDLayoutEdge.LEFT, DiagonalPVDLayoutEdge.CENTER];
      bundle.edges.push(l);
    }

    while (act.children.length === 1) {
      act = act.children[0];
      act.x = right;
      act.y = offset;
      right = act.x2 + p;
      if (act.height > hi) {
        hi = act.height;
      }
      if (this.drawEdges) {
        hline(act.parent.dim, act.dim, act.parent.node.fqIname + '-' + act.node.fqIname, act.parent.node.infrastructure !== act.node.infrastructure);
      }
    }
    //assume act.children.length === 2
    offset += hi * 0.5 + p;
    if (act !== graph) { //we have two levels to switch
      act.y = offset;
    }
    var left = act.children[0], shift = offset;
    act = act.children[1];
    while (act != null) {
      act.x = right;
      right = act.x2 + p;
      act.y = shift;
      if (act.y2 > offset) {
        offset = act.y2;
      }
      if (this.drawEdges) {
        hline(act.parent.dim, act.dim, act.parent.node.fqIname + '-' + act.node.fqIname, act.parent.node.infrastructure !== act.node.infrastructure);
      }
      act = act.children[0];
    }
    act = left;
    var bak = right;
    right = 0;
    while (act != null) {
      right -= act.width + p;
      act.x = right;
      act.y = shift;
      if (act.y2 > offset) {
        offset = act.y2;
      }
      if (this.drawEdges) {
        hline(act.dim, act.parent.dim, act.parent.node.fqIname + '-' + act.node.fqIname, act.parent.node.infrastructure !== act.node.infrastructure);
      }
      act = act.children[0];
    }
    graph.shift(-right, 0, true);

    if (this.externalNode) { //set the external node to the actual width
      bundle.positions.get(this.externalNode.fqIname).width = -right + bak;
    }
    return offset;
  }
}
