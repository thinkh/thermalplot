/**
 * Created by AK116843 on 18.08.2014.
 */
/// <reference path='../../../../tsd.d.ts' />
/*global d3*/
'use strict';

module PVDVisualizations {
  export class PVDHorizontalBar extends PVDASingleAttribute {
    constructor($parent:D3.Selection, attr:PVDModels.IAttribute<number>, normalizer:INormalizer<number>, config:PVDHierarchyConfig, parent:PVDElementParent, public defConfig:any) {
      super($parent, attr, normalizer, config, parent, 'hbar');
    }

    get nMarkers() {
      return 1;
    }

    drawIt($r:D3.UpdateSelection, dt:number) {
      super.drawIt($r, dt);
      $r.style("width", (v) => (v.normalized * 100) + "%");
    }
  }
}
