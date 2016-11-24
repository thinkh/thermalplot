/**
 * Created by AK116843 on 18.08.2014.
 */
/// <reference path='../../../../tsd.d.ts' />
/*global d3*/
'use strict';

module PVDVisualizations {

  function distanceOf(o : PVDModels.Node, nodep: PVDModels.Node[], collapsed: boolean, to? : PVDModels.Node[]) {
    var node = nodep[nodep.length-1];
    if (o instanceof PVDModels.ExternalNode || o === node) { //skip external and self loops and if a to is given all not to
      return -1;
    }
    if (to && to.indexOf(o) < 0) {
      return -1;
    }
    var d, op = o.parents;
    if (!collapsed || op.indexOf(node) < 0) { //target is not a child of myself when I'm collapsed
      var r = PVDModels.findLeastCommonAncestor(nodep, op); //compute common ancestor and distance
      if (!r.found) { //not shared skip
        return -1;
      }
      d = r.di + r.si; //compute distance
    } else { //assume self is a child of my, os it is just internal communication
      d = 0;
    }
    return d;
  }
  /**
   * groups the given attributes by their edge distance from either source or target, depending on incoming state
   * @param attrs
   * @param incoming a list of distances as composite sum attributes
   */
  function groupByDistance(nodep: PVDModels.Node[], collapsed: boolean, attrs:PVDModels.IAttribute<number>[], incoming: boolean, to? : PVDModels.Node[]) {
    //convert to other node
    var node = nodep[nodep.length-1];
    var other = incoming ? ((attr) => (<PVDModels.Edge><any>attr.parent).src) : ((attr) => (<PVDModels.Edge><any>attr.parent).dst);
    var distances = new Array<PVDModels.IAttribute<number>>();

    attrs.forEach((attr) => {
      var d = distanceOf(other(attr), nodep, collapsed, to);
      if (d < 0) {
        return;
      }
      var old = distances[d]; //add and increment
      if (!old) {
        distances[d] = PVDModels.compose([attr],'+',node,'dist-'+d);
      } else {
        (<any>old).attrs.push(attr);
      }
    });
    /*distances = distances.map((d) => {
      if (d && (<any>d).attrs.length === 1) { //a a composite with just one attribute remove the composite wrapper
        return (<any>d).attrs[0];
      } else {
        return d;
      }
    });*/
    {
      var externals = attrs.filter((a) => other(a) instanceof PVDModels.ExternalNode);
      distances[-1] = externals.length <= 1 ? externals[0] : <PVDModels.IAttribute<number>>PVDModels.compose(externals,'+',node,'dist-external');
    }
    return distances;
  }

  export interface IAttributeProvider {
    name: string;
    attrs() : PVDModels.IAttribute<number>[];
    onAdded : (attr: PVDModels.IAttribute<number>) => void;
    deleted();
  }

  export class PVDAStreamGraph implements IAnimateable, PVDElement {
    $node:D3.Selection;
    _scaleFactor = [1,3];
    private $scaleGroup:D3.Selection;
    private normalizer:INormalizer<number>;

    private attrDistances : PVDModels.IAttribute<number>[];
    private bb = new PVDLayouts.PVDLayoutDimensions();

    private wasAllZero = 0;
    protected scale = d3.scale.linear();

    private node: PVDModels.Node;
    name: String;
    private lastData = [];

    private _defaultConfig = {
      'bindtype': '',
      'data': 'values', // values || frequencies
      'incoming': false,
      'interpolate': 'basis'
    };

    private _defConfig;

    constructor(public $parent:D3.Selection,
                node : PVDModels.Node,
                attrs: IAttributeProvider,
                protected config: PVDHierarchyConfig,
                collapsed: boolean,
                private parent: PVDElementParent,
                defConfig:any) {

      this.defConfig = defConfig; // override default config

      this.node = node;
      this.name = attrs.name;
      this.$node = $parent.append('svg').attr('class','streamgraph attr-'+this.name+' '+(this.defConfig.incoming?'in':'out'));
      this.$scaleGroup = this.$node.append('g');
      this.normalizer = config.streamNormalizer; //createNormalizer(attrs[0], false);

      var nodep = this.node.parents;
      var to : PVDModels.Node[] = null, update = () => {
        this.attrDistances = groupByDistance(nodep, collapsed, attrs.attrs(), this.defConfig.incoming, to);
      };
      attrs.onAdded = update;
      update();

      var id = 'selectall.streamgraph_'+PVDVisualizations.nextID();
      config.selection.on(id, (new_: PVDModels.Node, all: PVDModels.Node[]) => {
        var inf = node.infrastructure;
        all = all.filter((s) => s.infrastructure === inf);
        if (all.length == 1 && all.indexOf(node) < 0) { //something selected and not itself
          to = all;
        } else {
          to = null;
        }
        update();
        this.wasAllZero = 0;
      });
      config.animator.push(this); // @see this.show()
      //when my node is removed from the dom unregister the service
      onDelete(this.$node, () => {
        config.selection.on(id, null);
        config.animator.remove(this);
        attrs.deleted();
      });
    }

    set defConfig(value:any) {
      this._defConfig = angular.extend({}, this._defaultConfig, value);
    }

    get defConfig() {
      return this._defConfig;
    }

    hide() {
      this.$node.classed('hg-hidden', true);
      this.config.animator.remove(this);
    }

    show() {
      this.$node.classed('hg-hidden', false);
      this.config.animator.push(this);
    }

    fadeIn() {
      this.show();
    }

    fadeOut() {
      this.hide();
    }

    get isVisible() {
      return this.$node[0][0].className.baseVal.indexOf('hg-hidden') === -1;
    }

    get scaleFactor() {
      return this._scaleFactor;
    }

    setScaleFactor(dim: number, val: number) {
      this._scaleFactor[dim] = val;
    }

    private normalize(v:number):number {
      var r = this.normalizer.normalize(v);
      if (isNaN(r) || r < 0) {
        r = 0;
      }
      return r;
    }

    relayout(width:number, height:number):void {
      this.$node.style({
        'width': width + 'px',
        'height': height + 'px'
      });
      this.bb.width = width;
      this.bb.height = height;
      this.updateTransform();
    }

    private updateTransform() {
      this.$node.style({
        top: this.bb.y+'px',
        left: this.bb.x+'px'
      });
      if (this.bb.width > 0 && this.bb.height > 0) {
        this.$scaleGroup.attr('transform', (this.defConfig.incoming ? '' : 'translate(0,' + this.bb.height + ')')); //+this.bb.height+')');
        this.scale.range([0,this.bb.width]);
      }
      /*this.$node.attr('transform','translate('+this.bb.x+','+(this.bb.y+(!this.incoming?-this.bb.height: 0))+')scale('+this.bb.width/this.nMarkers+','+this.bb.height+')');*/
    }

    pos(x: number, y: number) {
      this.bb.x = x;
      this.bb.y = y;
      this.updateTransform();
    }

    private rebind(now:number, dt:number) {
      var d = this.config.dataRange(now, this.bb.width);
      this.scale.domain([d.zeroTime, d.widthTime]);
      now = d.now;
      var start = d.start, step = d.step, data = [];
      var pushData = (attr, i) => {
        if (!attr || attr.areNoValuesThere(start, now, step,false)) {
          return;
        }

        if(this.defConfig.data === 'frequencies') {
          data.push({
            name: 'dist-'+i,
            values: attr.frequencies(start, now, step).map((v) => { return { v: v, v0: v } }),
          });

        } else {
          data.push({
            name: 'dist-'+i,
            values: attr.values(start, now, step, false).map((v) => { return { v: v, v0: v } }),
          });
        }
      };
      this.attrDistances.forEach(pushData);
      if (this.attrDistances[-1]) {
        pushData(this.attrDistances[-1],'external');
      }

      //update to stacked version
      //data = this.stack(data);
      //my stack
      for(var i = 1; i < data.length; ++i) {
        var prev = data[i-1];
        var act = data[i];
        act.values.forEach((v,i)=> {
          v.v += prev.values[i].v;
        })
      }
      //adapt to the fully stacked ones
      var all = data.length > 0 ? data[data.length-1].values.map((v) => v.v) : [];

      this.normalizer.adapt(all, dt);

      data.forEach((dv) => dv.values.splice(0,d.skip));
      return {
        start: d.skipStart,
        data : data,
        step : step.step(now)
      };
    }

    dataAt(ts: number) {
      return this.lastData.map((dist) => {
        var li = dist.values.filter((v) => v.i === ts);
        var l = (this.defConfig.incoming ? 'in ' : 'out ')+this.name+ ' (';
        if (dist.name === 'dist-external') {
          l = l + 'ext'
        } else {
          l = l + 'd=' + dist.name.substr(5);
        }
        return {
          name : l+')',
          value: d3.round(li.length > 0 ? li[0].v : 0,3).toString()
        };
      })
    }

    private rebindRest(start: number, data : any[], step: number) {
      var d2 = data.map((d) => {
        return {
          name: d.name,
          values: d.values.map((v, i: number) => {
            v.p = this.normalize(v.v)*this.bb.height;
            v.i = start + i * step;
            v.x = i;
            return v;
          })};
      });
      this.lastData = d2;
      d2 = d2.reverse();
      //console.log(start,d2.map(d => d.n));
      //key is the normalized time
      return this.$scaleGroup.selectAll(this.defConfig.bindtype).data(d2);
    }

    layout(dt:number, now: number) : any {
      //do everything till the normalization is needed
      return this.rebind(now, dt);
    }

    update(dt:number, now:number, layoutResult : any) {
      this.normalizer.adaptEnd();
      if (this.bb.width <= 0 || this.bb.height <= 0) {
        return;
      }
      //do the rest
      var $r = this.rebindRest(layoutResult.start, layoutResult.data, layoutResult.step);
      this.draw($r, dt);
    }

    draw($r:D3.UpdateSelection, dt:number) {
    }
  }

  export class PVDStreamGraph extends PVDAStreamGraph {
    private line = d3.svg.line(); // linear || basis

    constructor($parent:D3.Selection, node : PVDModels.Node, attrs:IAttributeProvider, config: PVDHierarchyConfig, collapsed: boolean, parent: PVDElementParent, public defConfig:any) {
      super($parent, node, attrs, config, collapsed, parent, defConfig);
      this.defConfig.bindtype = 'path';

      this.line.interpolate(this.defConfig.interpolate);
      this.line.x((d) => this.scale(d.i));
      if (this.defConfig.incoming) {
        this.line.y((d) => d.p);
      } else {
        this.line.y((d) => -d.p);
      }
    }

    draw($r:D3.UpdateSelection, dt:number) {
      super.draw($r, dt);

      var line = (d) => {
        //var r = this.line(d.values).substr(1);
        return 'M0,0 L'+this.line(d.values).substr(1)+' L'+this.scale.range()[1]+',0 Z';
      };
      $r.enter()
        .append('path');
      $r.exit()
        .remove();
      //class by distance
      $r.attr('class',(d) => d.name);

      $r.attr('d', line);
    }
  }

  export class PVDStackedBars extends PVDAStreamGraph {
    private factor: number;

    constructor($parent:D3.Selection, node : PVDModels.Node, attrs:IAttributeProvider, config: PVDHierarchyConfig, collapsed: boolean, parent: PVDElementParent, public defConfig:any) {
      super($parent, node, attrs, config, collapsed, parent, defConfig);
      this.defConfig.bindtype = 'g';
      this.factor = (this.defConfig.incoming) ? 1 : -1;
    }

    draw($r:D3.UpdateSelection, dt:number) {
      super.draw($r, dt);

      var that = this;
      var binWidth = this.scale(this.scale.domain()[0]+this.config.binWidth());
      $r.enter()
        .append('g');
      $r.exit()
        .remove();
      //class by distance
      $r.attr('class',(d) => d.name);
      $r.each(function (d) {
        var $this = d3.select(this);
        var $rects = $this.selectAll('rect').data(d.values);
        $rects.enter().append('rect');
        $rects.attr({
          x : (d) => that.scale(d.i),
          y : (d) => ((that.factor < 0) ? -d.p : 0),
          width: binWidth,
          height: (d) => d.p
        });
        $rects.exit().remove();
      });
    }
  }

}
