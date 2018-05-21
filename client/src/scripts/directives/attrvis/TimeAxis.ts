/**
 * Created by Holger Stitz on 06.08.2015.
 */
import * as angular from '@bower_components/angular';
import * as d3 from '@bower_components/d3/d3';
import { PVDHierarchyConfig } from '../HierarchyConfig';
import { PVDElementParent } from '../HierarchyNode';
import { PVDADataAttributeVis } from './AAttributeVis';

'use strict';

export class PVDTimeAxis extends PVDADataAttributeVis {

  private _defaultConfig = {
    'height': 1,
    'marginTop': 6,
    'marginBottom': 6,
    'marginLeft': 36,
    'marginRight': 0,
    'orient': 'top',
    'ticks': 4
  };

  private _defConfig;

  private time: d3.Scale.TimeScale;

  private xAxis;

  constructor($parent: d3.Selection,
    config: PVDHierarchyConfig,
    private parent: PVDElementParent,
    defConfig: any) {
    super($parent, null, null, config, parent, 'attr-time-axis', 'svg');
    this.defConfig = defConfig; // override default config

    this.scaleFactor[1] = this.defConfig.height;
    this.dataMode = 'continuous';

    // add left offset
    //this.scale.range([this.defConfig.marginLeft + this.defConfig.yAxis, this.width - this.defConfig.marginRight]);

    this.time = d3.time.scale.utc();

    this.xAxis = d3.svg.axis()
      .ticks(this.defConfig.ticks)
      .scale(this.time)
      .orient(this.defConfig.orient);

    this.$node.append('g')
      .attr('class', 'x axis');
    //.attr('transform', 'translate(0,' + 45 + ')');
  }

  set defConfig(value: any) {
    this._defConfig = angular.extend({}, this._defaultConfig, value);
    this.checkForChangedDefConfig();
    this.invalidateCache = true;
  }

  get defConfig() {
    return this._defConfig;
  }

  private checkForChangedDefConfig() {
    this.defConfig.marginLeft *= ApplicationConfiguration.zoomFactor;
    //var node:PVDModels.Node = <PVDModels.Node>this.attr.parent;
  }

  layout(dt: number, now: number): any {
    var that = this;
    var s = this.config.selection.getSelection(now); //this.config.dataRange(now, this.config.gridWidth);

    that.time.domain([s.start, s.point + 1]);
  }

  update(dt: number, now: number, data: any) {
    //if (!data) {
    //  return;
    //}
    var def = this.defConfig;

    var h = this.$node.style('height');

    this.time.range([def.marginLeft, this.width - def.marginRight]);
    var $selection = this.$node.select('g.x').call(this.xAxis);

    if (def.orient === 'top') {
      $selection.attr('transform', 'translate(0,' + (parseInt(this.$node.style('height')) - 1) + ')'); // move 1px up for safety
    }
  }
}
