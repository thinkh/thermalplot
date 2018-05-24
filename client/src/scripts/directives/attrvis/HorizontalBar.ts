/**
 * Created by Holger Stitz on 18.08.2014.
 */
import * as angular from 'angular';
import * as d3 from 'd3';
import { PVDASingleAttribute } from './AAttributeVis';
import { IAttribute } from '../../models/Models';
import { INormalizer } from '../VisUtils';
import { PVDHierarchyConfig } from '../HierarchyConfig';
import { PVDElementParent } from '../HierarchyNode';

'use strict';

export class PVDHorizontalBar extends PVDASingleAttribute {
  constructor($parent: d3.Selection<any>, attr: IAttribute<number>, normalizer: INormalizer<number>, config: PVDHierarchyConfig, parent: PVDElementParent, public defConfig: any) {
    super($parent, attr, normalizer, config, parent, 'hbar');
  }

  get nMarkers() {
    return 1;
  }

  drawIt($r: d3.selection.Update<any>, dt: number) {
    super.drawIt($r, dt);
    $r.style("width", (v) => (v.normalized * 100) + "%");
  }
}
