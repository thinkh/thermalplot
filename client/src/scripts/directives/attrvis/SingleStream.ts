/**
 * Created by Holger Stitz on 18.08.2014.
 */
import * as d3 from '@bower_components/d3/d3';
import { IAttribute } from '../../models/Models';
import { PVDHierarchyConfig } from '../HierarchyConfig';
import { PVDElementParent } from '../HierarchyNode';
import { INormalizer } from '../VisUtils';
import { PVDADataAttributeVis } from './AAttributeVis';

'use strict';

export class PVDSingleStream extends PVDADataAttributeVis {
  private line = d3.svg.line(); // linear || basis
  private incoming = false;

  constructor($parent: d3.Selection, attr: IAttribute<number>,
    normalizer: INormalizer<number>,
    config: PVDHierarchyConfig,
    parent: PVDElementParent,
    public defConfig: any) {
    super($parent, attr, normalizer, config, parent, 'single streamgraph', 'svg');
    var interpolate: string = defConfig.interpolate || 'basis';
    this.incoming = defConfig.incoming || false;

    this.scaleFactor[1] = 3;
    this.$node.append('path');

    this.line.interpolate(interpolate);
    this.line.x((d) => this.scale(d.index));
    if (this.incoming) {
      this.line.y((d) => d.normalized);
    } else {
      this.line.y((d) => -d.normalized);
    }
  }

  draw(dt: number, now: number, data: any[]) {
    var $r = this.$node.select('path').datum(data);
    var h = this.$node.style('height');
    h = h.substring(0, h.length - 2);
    $r.attr('transform', 'scale(1,' + h + ')' + (this.incoming ? '' : 'translate(0,1)'));

    var line = (d) => {
      //var r = this.line(d.values).substr(1);
      return 'M0,0 L' + this.line(d).substr(1) + ' L' + this.scale.range()[1] + ',0 Z';
    };

    $r.attr('d', line);
  }
}
