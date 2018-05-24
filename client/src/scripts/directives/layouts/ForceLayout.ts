/**
 * Created by Holger Stitz on 18.08.2014.
 */
import * as d3 from 'd3';
import { PVDANodeLinkLayout } from './NodeLinkLayouts';
import { IPVDLayout, PVDLayoutBundle } from './Layout';
import { DiagonalPVDLayoutEdge } from '../HierarchyEdgeOverlay';

'use strict';

/**
 * Creates a force directed layout using the D3 implementation
 */
export class PVDForceLayout extends PVDANodeLinkLayout implements IPVDLayout {
  static ID: string = 'force';
  static NAME: string = 'Force Directed';

  id = PVDForceLayout.ID;
  name = PVDForceLayout.NAME;

  private initLocations: d3.Map<number[]> = d3.map();

  constructor(private createMappingLinks = false, private d3Options?: any) {
    super();
  }

  get edgesBelowNodes() {
    return true;
  }

  layout(graph: any, flat: any[], shifty: number, bundle: PVDLayoutBundle, gridWidth: number) {
    var that = this;
    var nodes = flat;
    var links = [];
    flat.forEach((node) => {
      var loc = this.initLocations.get(node.fqIname);
      //reset to generate a random init layout
      if (loc) {
        node.x = loc[0];
        node.y = loc[1];
      } else {
        node.x = Number.NaN;
        node.y = Number.NaN;
      }
      if (node.parent) {
        links.push({
          source: node,
          target: node.parent,
          distance: node.radius + node.parent.radius
        });
      }
    });
    if (this.createMappingLinks) {
      var lookup = d3.map<any>();
      nodes.forEach((node) => { lookup.set(node.node.fqIname, node); });
      nodes.forEach((node) => {
        var next = that.targetHierarchy.next(node.node.infrastructure.id);
        if (next) {
          node.node.getMappings(next).forEach((n) => {
            var target = lookup.get(n.fqIname);
            if (target) {
              links.push({
                source: node,
                target: target,
                distance: (node.radius + target.radius) * 2,
                css: 'hg-edge-cross-hierarchy'
              });
            }
          });
        }
      });
    }

    var f = d3.layout.force()
      .nodes(nodes)
      .links(links)
      //.charge(-750)
      //.linkDistance((link) => link.distance*3.5)
      .size([gridWidth / 8, (800) / 8]);

    if (this.d3Options !== undefined) {
      if (this.d3Options.size !== undefined) {
        f.size(this.d3Options.size);
      }
      if (this.d3Options.linkStrength !== undefined) {
        f.linkStrength(this.d3Options.linkStrength);
      }
      if (this.d3Options.friction !== undefined) {
        f.friction(this.d3Options.friction);
      }
      if (this.d3Options.linkDistance !== undefined) {
        f.linkDistance(this.d3Options.linkDistance);
      }
      if (this.d3Options.charge !== undefined) {
        f.charge(this.d3Options.charge);
      }
      if (this.d3Options.gravity !== undefined) {
        f.gravity(this.d3Options.gravity);
      }
    }

    f.start();
    //backup init locations for the next iteration, to avoid random init next time
    nodes.forEach((node) => {
      this.initLocations.set(node.fqIname, [node.x, node.y]);
    });
    for (var i = 0; i < 1000; ++i) {
      f.tick();
      if (f.alpha() <= 0) {
        break;
      }
    }
    //console.log(f.alpha());
    f.stop();
    var minx = Number.MAX_VALUE, miny = Number.MAX_VALUE, maxy = 0;
    nodes.forEach((node) => {
      node.x = node.x * 6 - node.width / 2;
      node.y = node.y * 6 - node.height / 2;

      if (node.x < minx) {
        minx = node.x;
      }
      if (node.y < miny) {
        miny = node.y;
      }
      if (node.y2 > maxy) {
        maxy = node.y2;
      }
    });
    miny -= shifty;
    maxy -= miny;
    nodes.forEach((node) => {
      node.x -= minx;
      node.y -= miny;
    });
    links.forEach((link) => {
      var r = new DiagonalPVDLayoutEdge(link.source.dim, link.target.dim);
      r.sourceAnchor = [DiagonalPVDLayoutEdge.CENTER, DiagonalPVDLayoutEdge.CENTER];
      r.targetAnchor = [DiagonalPVDLayoutEdge.CENTER, DiagonalPVDLayoutEdge.CENTER];
      if (link.css) {
        r.cssClass = link.css;
      }
      bundle.edges.push(r);
    });
    return maxy;
  }
}
