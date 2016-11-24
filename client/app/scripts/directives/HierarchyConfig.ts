/**
 * Created by Samuel Gratzl on 11.03.2015.
 */

/// <reference path='../../../tsd.d.ts' />
/*global d3*/
'use strict';


module PVDVisualizations {
  export class PVDHierarchyConfig {
    constructor(public animator:PVDAnimator, public selection:PVDDataSelection, public layout:PVDLayoutManager, public mapper:PVDInfrastructureMapper, public targetHierarchy:PVDTargetHierarchy, public changeBorder:PVDChangeBorder, public windowResize:PVDWindowResize) {

    }

    public visConfigId = ''; // name of the infrastructure.visConfig[...]
    public mode = 'selection-target'; // 'selection-target' (default), 'selection-source'
    public datatype = 'stream'; // 'stream' (default), 'static'
    public autoSize = false; // compute width and height automatically
    public orientation = 'horizontal'; // vertical || horizontal (default)s

    public gridWidth:number = 500; //'100%';
    public gridHeight:number = 500;
    private _nodeWidth:number = 5*12;
    private _sliceHeight:number = 20;
    public widthDependentDataRange = true;
    public autoBinWidth:boolean = true; // override automatic bin width computation

    public set sliceHeight(value) {
      this._sliceHeight = value;
    }

    public get sliceHeight() {
      return this._sliceHeight * ApplicationConfiguration.zoomFactor;
    }

    transitionDuration = 500; // in [ms]

    extras : any = {};

    //stream normalizer
    streamNormalizer : INormalizer<number> = new LayoutingAdaptiveNormalizer();

    /**
     * scale to convert an normalized activity value to a width
     **/
    act2width = d3.scale.linear().domain([0,0.3]).rangeRound([0,this._nodeWidth]).clamp(true);

    startTime(w) {
      if (!this.widthDependentDataRange) {
        return this.selection.past;
      }
      return w / this.act2width.range()[1] * this.selection.past;
    }

    effectiveNodeWidth(hasChildren: boolean) {
      return this.act2width(this.autoShrink && this.mode !== 'selection-source' && !hasChildren ? 0 : 1);
    }

    get nodeWidth() {
      return this._nodeWidth * ApplicationConfiguration.zoomFactor;
    }

    set nodeWidth(val : number) {
      this._nodeWidth = val;
      this.act2width.rangeRound([0, val]);
    }

    // shifts data to bin
    dataRange(now:number, width: number) {
      //debugger;
      var s = this.selection;
      var selection = s.getSelection(now);
      if (this.mode === 'selection-source') { //always just a single bin showing the live data
        return {
          now : selection.point,
          start:  selection.point,
          step : createStepper(selection.past),
          zeroTime : selection.point,
          widthTime : selection.point+selection.past,
          skip : 0,
          skipStart : selection.point
        };
      }

      now = selection.point + s.binOffset(selection.point);
      var step = s.stepper, zeroTime = selection.point - this.startTime(width);
      var start = now; //now - (this.nMarkers-1) * step;
      var i = 0, skip = 0;
      var timeRange = Math.min(selection.start, zeroTime);
      while (start > timeRange) {
        if (start > zeroTime) { //if we are out of the visible range
          skip++;
        }
        start = step.prev(start);
        i++;
        if (i > 1000) {
          debugger;
        }
      }
      skip = i - skip;
      return {
        start: start, //start time to query
        step : step, //time step
        now: now, //end time to query
        zeroTime : zeroTime, //time at 0px
        widthTime : selection.point, //time at width px
        skip : skip, //skip the first x entries in the data used for activity only
        skipStart : step.step(start,skip) //the startTime including skipping
      };
    }

    binWidth() {
      if(this.autoBinWidth) {
        return this.mode === 'selection-source' ? this.selection.past : this.selection.binWidth;
      } else {
        return this.selection.past;
      }
    }

    /**
     * there: label, heatmap, heatmap_in, heatmap_out, heatmap_inout, stackedbars_in, stackedbars_out, stream_(d3 line interpolator)_(in|out)
     * @type {string[]}
     */
    public defaultNodeChildren = ['label height:4'];
    public nodeChildren = this.defaultNodeChildren;

    showInNode(hasChildren:boolean, node:PVDModels.Node) {
      if(this.mode !== 'selection-source') {
        return hasChildren ? this.defaultNodeChildren : (node.master ? this.nodeChildren.slice(1) : this.nodeChildren);
      } else if (!hasChildren) {
        return this.nodeChildren;
      }
      return [];
    }

    /**
     * enable auto shrinking of nodes according to activity
     */
    autoShrink = false;
    autoShrinkParents = false;
    /**
     * trigger layout updates on activity change
     */
    triggerActivity = false;

    activityOf(node: PVDModels.Node) {
      //FIMXE compute store and update ActivityManager
      return 1;
    }

    clone() {
      // copy config to overwrite config values in inlayUp
      var c = new PVDHierarchyConfig(this.animator, this.selection, this.layout, this.mapper, this.targetHierarchy, this.changeBorder, this.windowResize);
      for (var i in this) {
        if (i !== 'streamNormalizer' && i !== 'nodeWidth' && i !== 'startTime') {
          c[i] = this[i];
        }
      }
      return c;
    }

    // introduced with ThermalLayout
    useCustomColor = false; // infrastructure color (default) || node.color
  }

  class LayoutingAdaptiveNormalizer implements INormalizer<number> {
    min = 0;
    delta = 0;
    _targetDelta = 0;
    /**
     * after the first normalize operation the adapting is is not accumulated anymore
     * @type {boolean}
     */
    recordingMode : boolean = true;

    normalize(value:any):number {
      var v = +value;
      if (this.delta == 0) { //no range just single values
        return 0;
      }
      //normalize
      v = (v - this.min) / this.delta;
      //clamp
      if (v < 0) {
        v = 0;
      } else if (v > 1) {
        v = 1;
      }
      return v;
    }

    adaptEnd() {
      this.recordingMode = false;
    }

    adapt(values:any[], dt:number) {
      var max = values.length === 0 ? 0 : d3.max(values);
      if (this.recordingMode) {
        //adapt multiple times to the maximum
        this._targetDelta = Math.max(this._targetDelta, max - this.min);
      } else {
        this.recordingMode = true; //next round start from scratch
        this._targetDelta = max - this.min;
      }

      if (this.delta === 0) { //first time
        this.delta = this._targetDelta;
        return;
      } else if (this._targetDelta == this.delta) {
        return; //nothing to adapt
      }
      //FIXME need transition
      this.delta = this._targetDelta;
    }
  }

}
