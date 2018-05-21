/**
 * Created by Holger Stitz on 18.08.2014.
 */
import * as angular from '@bower_components/angular';
import * as d3 from '@bower_components/d3/d3';
import { PVDASingleAttribute } from './AAttributeVis';
import { IAttribute } from '../../models/Models';
import { INormalizer } from '../VisUtils';
import { PVDHierarchyConfig } from '../HierarchyConfig';
import { PVDElementParent } from '../HierarchyNode';

'use strict';

export class PVDHorizontalBar extends PVDASingleAttribute {
  constructor($parent: d3.Selection, attr: IAttribute<number>, normalizer: INormalizer<number>, config: PVDHierarchyConfig, parent: PVDElementParent, public defConfig: any) {
    super($parent, attr, normalizer, config, parent, 'hbar');
  }

  get nMarkers() {
    return 1;
  }

  drawIt($r: d3.UpdateSelection, dt: number) {
    super.drawIt($r, dt);
    $r.style("width", (v) => (v.normalized * 100) + "%");
  }
}
