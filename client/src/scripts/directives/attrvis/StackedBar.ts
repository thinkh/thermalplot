/**
 * Created by Holger Stitz on 23.09.2014.
 */
import * as angular from '@bower_components/angular';
import * as d3 from '@bower_components/d3/d3';
import { IColorer, defaultColorer, INormalizer, nextID, onDelete, tooltip } from '../VisUtils';
import { PVDADataAttributeVis } from './AAttributeVis';
import { IAttribute, NumberAttribute } from '../../models/Models';
import { PVDHierarchyConfig } from '../HierarchyConfig';
import { PVDElementParent, PVDElement, PVDInnerElement, PVDHierarchyNode } from '../HierarchyNode';
import { Node } from '../../models/Infrastructure';

'use strict';

export class PVDStackedBar implements PVDElement, PVDInnerElement {

  $node: d3.Selection;
  scaleFactor = [1, 1];

  scale = d3.scale.linear();

  private valuesByLevel: number[] = [];
  private format = d3.format(".1f");

  constructor($parent: d3.Selection, public attr: IAttribute<number>, private type: string, private config: PVDHierarchyConfig, private parent: PVDElementParent, public defConfig: any) {
    this.$node = $parent.append('div').attr('class', name + ' stackedbar');

    this.calculateValuesByLevel();

    var id = 'dragEnd.stackedbar_' + nextID();

    this.config.selection.on(id,
      (node: Node) => {
        this.calculateValuesByLevel();
        this.draw(0, 0);
      });

    //when my node is removed from the dom unregister the service
    onDelete(this.$node, () => {
      config.selection.on(id, null);
    });
  }

  private calculateValuesByLevel() {
    var select;
    switch (this.type) {
      case 'min':
        select = (a) => a.min;
        break;
      case 'max':
        select = (a) => a.max;
        break;
      case 'value':
        select = (a) => a.value;
        break;
    }

    var that = this;
    //var downNodes:Node[] = [];
    var hnode = <PVDHierarchyNode>this.parent;

    this.valuesByLevel = [];

    // FIXME maximum capacity per perspective and attribute
    switch (hnode.node.infrastructure.id) {
      case 'b':
        switch (that.attr.name) {
          case 'diskSpace': this.valuesByLevel[0] = 0.8; break;
          case 'memory': this.valuesByLevel[0] = 20.45; break;
        }
        break;
      case 'vm':
        switch (that.attr.name) {
          case 'diskSpace': this.valuesByLevel[0] = 1.5; break;
          case 'memory': this.valuesByLevel[0] = 32; break;
        }
        break;
      case 's':
        switch (that.attr.name) {
          case 'diskSpace': this.valuesByLevel[0] = 40; break;
          case 'memory': this.valuesByLevel[0] = 128; break;
        }
        break;
    }

    this.valuesByLevel[1] = select(this.attr); // full capacity

    var target = this.config.targetHierarchy.targetFromInfra(false, hnode.node.infrastructure);
    //if (target.length === 0) {
    // return;
    //}

    function mapDown(n: Node, level: number) {
      var children = that.config.mapper.mapToUnchecked(n, target[level], []).map((ni) => {
        //downNodes.push(ni);

        var attr: IAttribute<number> = <IAttribute<number>>(ni.getAttr(that.attr.name));
        if (attr !== undefined) {
          that.valuesByLevel[level + 2] = that.valuesByLevel[level + 2] || 0;
          that.valuesByLevel[level + 2] += select(attr); // used capacity
        }

        return ni;
      });
      if (level < 0) {
        children.forEach(c => mapDown(c, level + 1));
      }
    }

    mapDown(hnode.node, 0);
    //console.log(hnode.node.fqIname, this.valuesByLevel, hnode.node.parent.children());

    this.scale.domain([0, Math.max.apply(Math, this.valuesByLevel)]);
  }

  dataAt(ts: number): { name: string; value: string }[] {
    return [];
  }

  setScaleFactor(dim: number, val: number) {
    this.scaleFactor[dim] = val;
  }

  hide() {
  }

  show() {
  }

  fadeIn() {
    this.show();
  }

  fadeOut() {
    this.hide();
  }

  get isVisible() {
    return true;
  }

  relayout(width: number, height: number): void {
    this.$node.style({ height: height + 'px', width: width + 'px' });
    this.scale.range([0, width]);
    this.draw(width, height);
  }

  pos(x: number, y: number) {
    this.$node.style({ top: y + 'px', left: x + 'px' });
  }

  private draw(width: number, height: number): void {
    this.$node.call(tooltip(this.toTooltip()));

    var sorted = this.valuesByLevel.slice().sort((a, b) => d3.descending(a, b));

    var $bars = this.$node.selectAll('.bar')
      .data(this.valuesByLevel);

    $bars.enter().append('div')
      .style('height', height - 1 + 'px') // -1 === border
      .attr('class', (d, i) => 'bar dist-' + i);

    $bars
      .style('z-index', (d, i) => sorted.indexOf(d) + 1)
      .transition().duration(500)
      .style('width', (d) => this.scale(d) + 'px');

    $bars.exit().remove();
  }

  private toTooltip() {
    var r = ["<table class='statusinfo'><thead><tr><th>Perspective&nbsp;</th><th>", this.attr.name, "</th></tr></thead><tbody>"];
    this.valuesByLevel.forEach((d, i) => {
      r.push("<tr><th>");
      r.push('dist-' + i);
      r.push("</th><td style='text-align:right;'>");
      r.push('' + this.format(d) + ' ' + (<NumberAttribute>this.attr).unit);
      r.push("</td></tr>\n");
    });
    r.push("</tbody></table>");
    return r.join('');
  }

}
