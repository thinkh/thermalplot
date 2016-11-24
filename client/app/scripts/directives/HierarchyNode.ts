/**
 * Created by AK116843 on 18.08.2014.
 */
/// <reference path='../../../tsd.d.ts' />
/*global d3*/
'use strict';

module PVDVisualizations {

  export interface PVDElement {
    $node:D3.Selection;
    relayout(width:number, height:number):void;
    scaleFactor : number[]; //the scale factors of the grid
    setScaleFactor(dim: number, v : number);

    pos(x: number, y: number);

    hide();
    show();
    fadeIn();
    fadeOut();
    isVisible: boolean;
  }

  export interface PVDInnerElement extends PVDElement {
    defConfig:any;
    dataAt(ts: number) : { name : string; value: string}[];
  }

  export interface PVDCachableElement {
    invalidateCache:boolean;
  }

  export interface PVDHierarchyOracle {
    parents(node: PVDModels.Node) : PVDModels.Node[];
    parent(node: PVDModels.Node) : PVDModels.Node;
    hasChildren(node: PVDModels.Node) : boolean;
    children(node: PVDModels.Node) : PVDModels.Node[];
  }

  export interface PVDElementParent {
    relayout(width:number, height:number);
    dirtyLayout();
    focusOn(newroot:PVDModels.Node);
    collapsedChanged(node: PVDHierarchyNode);
    anchorPoint(position?:number[]);

    hierarchy: PVDHierarchyOracle;
  }

  export class PVDHierarchyNode implements PVDElement, PVDElementParent {
    $node:D3.Selection;
    _scaleFactor : number[];
    private _width = 0;
    private _height = 0;
    private _currentChildren : PVDInnerElement[] = []; // currently visible children
    private _allChildrenMap:D3.Map<PVDInnerElement> = d3.map(); // all children ever added to this node
    private timeHighlight: TimeHighlight = null;
    isVisible = true;
    selected = false;
    semiTransparent = false;
    highlighted = false;

    private _defaultAnchorPoint = [0,0];
    private _anchorPoint = [0,0];

    private _collapsed = false;

    private oldActivity = 0;

    private transition:D3.Transition.Transition = null;

    private id = '.hnode' + nextID();

    constructor(public node:PVDModels.Node, public $parent:D3.Selection, private config: PVDHierarchyConfig, private grid:PVDElementParent) {
      if($parent !== undefined) {
        this.$node = $parent.append('div')
          .attr('data-fqname', node.fqIname)
          .classed('hg-node', true)
          .classed('color-'+(this.node.infrastructure.color), true)
          .classed('infra-'+(node.infrastructure.id), true)
          .classed('hg-master', node.master);

        this.hide();
        this.setDefaultScaleFactor(config);

        this.$node
          .on('mouseover' + this.id, () => {
            this.config.selection.hover = this.node;
          })
          .on('mouseout' + this.id, () => {
            this.config.selection.hover = null;
          });

        node.on('changedColor' + this.id, (newColor, oldColor) => {
          this._currentChildren.forEach((c) => {
            if(typeof((<any>c).invalidateCache) !== 'undefined') { // from interface PVDCachableElement
              (<any>c).invalidateCache = true;
            }
          });
        });

        this.config.selection.on('indexPoint' + this.id, (newIndexPoint, oldIndexPoint) => {
          this._currentChildren.forEach((c) => {
            if(typeof((<any>c).invalidateCache) !== 'undefined') { // from interface PVDCachableElement
              (<any>c).invalidateCache = true;
            }
          });
        });

        onDelete(this.$node, () => {
          this.$node.on('mouseover' + this.id, null);
          this.$node.on('mouseout' + this.id, null);
          node.on('changedColor' + this.id, null);
        });
      }
    }

    addTimelineHighlight() {
      if (this.config.mode === 'selection-target' && this.config.datatype === 'stream') {
        this.timeHighlight = new TimeHighlight(this.$node, this.node, this.config, (ts:number) => {
          var r = [];
          return r.concat.apply(r, this._currentChildren.map((c) => c.dataAt(ts)));
        });
        if (this.config.extras.nodeMarginLeft) {
          this.timeHighlight.marginLeft = this.config.extras.nodeMarginLeft * ApplicationConfiguration.zoomFactor;
        }
        if (this.config.extras.nodeMarginRight) {
          this.timeHighlight.marginRight = this.config.extras.nodeMarginRight;
        }
        if (this.config.extras.fixedWidth) {
          this.timeHighlight.fixedWidth = this.config.extras.fixedWidth;
        }
      } else {
        this.timeHighlight = null;
      }
    }

    get hierarchy() {
      return (this.grid === null) ? undefined : this.grid.hierarchy;
    }

    hasNodeChildren() {
      //collapsed -> no
      //external or real children -> yes
      return !this.collapsed && (this.node.has() || this.node instanceof PVDModels.ExternalNode);
    }

    nodeChildren() {
      return this.collapsed ? [] : this.node.children();
    }

    collapsedChanged(node: PVDHierarchyNode) {

    }

    set collapsed(collapsed:boolean) {
      this._collapsed = collapsed;
      this.oldActivity = 0;
      this.setScaleFactor(0, this.config.effectiveNodeWidth(this.hasNodeChildren()));

      if(this.grid !== null){
        this.grid.collapsedChanged(this);
      }
    }

    get collapsed():boolean {
      return this._collapsed;
    }

    hide() {
      if (!this.isVisible) {
        return
      }
      this.isVisible = false;
      this._currentChildren.forEach((c) => {
        c.hide();
      });

      this.$node.classed('hg-hidden', true);
    }

    show() {
      if (this.isVisible) {
        return
      }
      this.isVisible = true;
      this._currentChildren.forEach((c) => {
        c.show();
      });

      this.$node.classed('hg-hidden', false);
    }

    fadeOut() {
      if (!this.isVisible) {
        return;
      }
      this.isVisible = false;
      this._currentChildren.forEach((c) => {
        c.fadeOut();
      });

      this.$node.transition().style('opacity',0).each('end',function() {
        d3.select(this).classed('hg-hidden', true).style('opacity', null);
      });
    }

    fadeIn() {
      if (this.isVisible) {
        return;
      }
      this.isVisible = true;
      this._currentChildren.forEach((c) => {
        c.fadeIn();
      });

      this.$node
        .classed('hg-hidden', false).style('opacity', 0)
        .transition().duration(this.config.transitionDuration)
        .style('opacity', 1).each('end',function() {
          d3.select(this).style('opacity', null);
        });
    }

    get scaleFactor() {
      return this._scaleFactor;
    }

    setScaleFactor(dim: number, val: number) {
      if (this._scaleFactor[dim] === val) {
        return;
      }
      this._scaleFactor[dim] = val;
      if (dim === 0) {
        this._currentChildren.forEach((c) => c.setScaleFactor(0,val));
      }
    }

    setDefaultScaleFactor(config:PVDHierarchyConfig) {
      var has = this.hasNodeChildren();
      this._scaleFactor = [config.effectiveNodeWidth(has), this._currentChildren.reduce((p:number, c) =>p + c.scaleFactor[1], 0)];
    }

    children(definitions:any[]):void {
      // hide everything first
      this._allChildrenMap.forEach((defId, c) => {
        c.hide();
      });
      this._currentChildren = [];
      //this.$node.selectAll('.hg-node-elem').remove();
      var val = this.scaleFactor[0], defId;

      definitions.forEach((def) => {
        defId = (typeof def === 'object') ? this.generateDefId(def.type, def.attr, def.key) : def;

        if(this._allChildrenMap.has(defId)) {
          this._currentChildren.push(this._allChildrenMap.get(defId));
          this._allChildrenMap.get(defId).show();

          if(typeof def === 'object') {
            this._allChildrenMap.get(defId).defConfig = def.config;
          }

        } else if(typeof def === 'object') {
          this.createFromDefObj(def.type, def.attr, def.config, defId);

        } else {
          this.createFromDescStr(def);
        }
      }, this);

      var acc = 0;
      this._allChildrenMap.forEach((defId, c)=> {
        if(c.isVisible) {
          c.$node.classed('hg-node-elem', true);
          c.setScaleFactor(0,val);
          acc += c.scaleFactor[1];
        } else {
          c.$node.classed('hg-node-elem', false);
          c.setScaleFactor(0,0);
        }
      });
      this.setScaleFactor(1,Math.max(acc,1));
    }

    /**
     * DEPRECATED
     * Wrapper method for string notation
     * @param desc
     */
    private createFromDescStr(desc : string) {
      if (desc.match(/label( width:(\d+))?( height:(\d+))?/g)) {
        //this.createLabel(desc, RegExp.$2, RegExp.$4);
        var config = {
          'height': RegExp.$4,
          'width': RegExp.$2,
          'nodeCollapse': true,
          'nodeSelect': true,
          'nodeFocus': true,
          'nodeDrag': true
        };
        this.createFromDefObj('label', '', config);
      } else if (desc.match(/text (.+)/g)) {
        this.createFromDefObj('text', RegExp.$1, {});

      } else if(desc.match(/stackedbar_(min|max|value) (.+)/)) {
        this.createFromDefObj('stackedbar', RegExp.$2, {'type': RegExp.$1}, this.generateDefId('stackedbar', RegExp.$2, RegExp.$1));

      } else if (desc.match(/stackedbars_(in|out) (.+)/g)) {
        this.createFromDefObj('streamgraph', RegExp.$2, {'incoming': (RegExp.$1 === 'in'), 'interpolate': null}, this.generateDefId('streamgraph', RegExp.$2, RegExp.$1));

      } else if (desc.match(/meanminmax (.+)/)) {
        this.createFromDefObj('meanminmax', RegExp.$1, {});

      } else if (desc.match(/categoryhist (.+)/)) {
        this.createFromDefObj('categoryhist', RegExp.$1, {});

      } else if (desc.match(/stockstream_(.*) (.+)/)) {
        this.createFromDefObj('stockstream', RegExp.$2, {'interpolate': RegExp.$1});

      } else if (desc.match(/stream_(.*)_(in|out) (.+)/g)) {
        this.createFromDefObj('streamgraph', RegExp.$3, {'incoming': (RegExp.$2 === 'in'), 'interpolate': RegExp.$1}, this.generateDefId('streamgraph', RegExp.$3, RegExp.$2+'_'+RegExp.$1));

      } else if (desc.match(/stream_(.*) (.+)/)) {
        //this.createHeatMap(desc, RegExp.$2, 'stream', false, RegExp.$1);

      } else if (desc.match(/gradientheatmap (.+)/)) {
        this.createFromDefObj('gradientheatmap', RegExp.$1, {});

      } else if (desc.match(/heatmap_(in|out|inout) (.+)/g)) {
        this.createFromDefObj('conheatmap', RegExp.$2, {'type': RegExp.$1}, this.generateDefId('conheatmap', RegExp.$2, RegExp.$1));

      } else if (desc.match(/heatmap (.+)/)) {
        this.createFromDefObj('heatmap', RegExp.$1, {});

      } else if (desc.match(/trafficlight (.+)/)) {
        this.createFromDefObj('trafficlight', RegExp.$1, {});

      } else if (desc.match(/hbar (.+)/)) {
        this.createFromDefObj('hbar', RegExp.$1, {});

      } else if (desc.match(/composite (.+)/)) {
        this.createFromDefObj('composite', RegExp.$1, {});
      }
    }

    private generateDefId(type:string, attr:string, key = '' ) {
      return type+'_'+attr+(key ? key : '');
    }

    private createFromDefObj(type:string, attr:string, config:any, id = this.generateDefId(type, attr)) {
      //console.log(id, type, attr, JSON.stringify(config));
      switch(type) {
        case 'label':
          this.createLabel(id, attr, config);
          break;
        case 'text':
          this.createDynamicText(id, attr, config);
          break;
        case 'stackedbar':
          this.createStackedBar(id, attr, config);
          break;
        case 'streamgraph':
          this.createStreamGraph(id, attr, config);
          break;
        case 'conheatmap':
          this.createConnectionHeatMap(id, attr, config);
          break;
        case 'stream':
          config.type = 'stream';
          config.incoming = false;
          this.createHeatMap(id, attr, config);
          break;
        case 'meanminmax':
          config.type = 'meanminmax';
          this.createHeatMap(id, attr, config);
          break;
        case 'stockstream':
          config.type = 'stockstream';
          config.incoming = false;
          this.createHeatMap(id, attr, config);
          break;
        case 'doistream':
          config.type = 'doistream';
          config.incoming = false;
          this.createHeatMap(id, attr, config);
          break;
        case 'time-axis':
          this.createTimeAxis(id, config);
          break;
        case 'gradientheatmap':
          config.type = 'gradientheatmap';
          this.createHeatMap(id, attr, config);
          break;
        case 'categoryhist':
          config.type = 'categoryhist';
          this.createHeatMap(id, attr, config);
          break;
        case 'heatmap':
          config.type = 'heat';
          this.createHeatMap(id, attr, config);
          break;
        case 'trafficlight':
          config.type = 'traffic';
          this.createHeatMap(id, attr, config);
          break;
        case 'hbar':
          config.type = 'bar';
          this.createHeatMap(id, attr, config);
          break;
        case 'composite':
          config.type = 'composite';
          config.incoming = false;
          this.createHeatMap(id, attr, config);
          break;
        default:
          console.error('Cannot create node children of type: ' + type);
      }
    }

    private createStackedBar(defId:string, defAttr:string, defConfig:any) {
      var attr:PVDModels.IAttribute<number> = <PVDModels.IAttribute<number>>(this.node.getAttr(defAttr));
      if(attr === undefined) {
        console.warn('attribute "' + defAttr + '" not found for ' + this.node.fqIname);
        return;
      }

      var bar = new PVDStackedBar(this.$node, attr, defConfig.type, this.config, this, defConfig);
      this._currentChildren.push(bar);
      this._allChildrenMap.set(defId, bar);
    }

    private createLabel(defId:string, defAttr:string, defConfig:any) {
      var label = new LabelElement(this.node, this.$node, this.config, this, defConfig);

      if(defConfig && defConfig.width) {
        label.setScaleFactor(0, parseInt(defConfig.width));
      }
      if(defConfig && defConfig.height) {
        label.setScaleFactor(1, parseInt(defConfig.height));
      }
      this._currentChildren.push(label);
      this._allChildrenMap.set(defId, label);
    }

    private createDynamicText(defId:string, defAttr:string, defConfig:any) {
      var attr:PVDModels.IAttribute<number> = <PVDModels.IAttribute<number>>(this.node.getAttr(defAttr));
      if(attr === undefined) {
        console.warn('attribute "' + defAttr + '" not found for ' + this.node.fqIname);
        return;
      }
      var text = new DynamicTextElement(this.$node, attr, this.config, this, defConfig);
      this._currentChildren.push(text);
      this._allChildrenMap.set(defId, text);
    }

    private createHeatMap(defId:string, defAttr:string, defConfig:any) {
      var type:string = defConfig.type,
          incoming:boolean = defConfig.incoming,
          interpolate:string = defConfig.interpolate;

      var a = this.node.getAttr(defAttr);
      var attrs = [];
      var h = this.hierarchy;
      function traverse(n: PVDModels.Node) {
        var a = n.getAttr(defAttr);
        if (a) {
          attrs.push(a);
        }
        if(h !== undefined) {
          h.children(n).forEach(traverse);
        }
      }
      //collapsed and has children and no direct attribute
      //combine all children
      if (!a && this.collapsed) {
        //create a combination of all children
        this._collapsed = false; //simulate not collapsed for traversal
        traverse(this.node);
        this._collapsed = true;
        if (attrs.length > 0) {
          a = PVDModels.compose(attrs, 'mean', this.node, defAttr);
        }
      }
      if (!a) {
        return;
      }
      var normalizer = createNormalizer(a, false);
      switch(type) {
        case 'bar':
          var bar = new PVDHorizontalBar(this.$node, a, normalizer, this.config, this, defConfig);
          this._currentChildren.push(bar);
          this._allChildrenMap.set(defId, bar);
          break;
        case 'traffic':
          var r = new PVDHeatmap(this.$node, a, normalizer, this.config, this, defConfig);
          var colors = [d3.rgb('green'),d3.rgb('yellow'), d3.rgb('red'), d3.rgb('black')];
          r.colorer = (value) => {
            if (isNaN(value)) { //invalid value
              return d3.rgb("gray");
            }
            return colors[+value];
          };
          this._currentChildren.push(r);
          this._allChildrenMap.set(defId, r);
          break;
        case 'stream':
          var stream = new PVDSingleStream(this.$node, a, normalizer, this.config, this, defConfig);
          this._currentChildren.push(stream);
          this._allChildrenMap.set(defId, stream);
          break;
        case 'stockstream':
          var stockstream = new PVDStockStream(this.$node, a, normalizer, this.config, this, defConfig);
          this._currentChildren.push(stockstream);
          this._allChildrenMap.set(defId, stockstream);
          break;
        case 'meanminmax':
          var meanminmax = new PVDMeanMinMax(this.$node, a, normalizer, this.config, this, defConfig);
          this._currentChildren.push(meanminmax);
          this._allChildrenMap.set(defId, meanminmax);
          break;
        case 'categoryhist':
          var categoryhist = new PVDCategoryStack(this.$node, a, normalizer, this.config, this, defConfig);
          this._currentChildren.push(categoryhist);
          this._allChildrenMap.set(defId, categoryhist);
          break;
        case 'doistream':
          var doistream = new PVDDOIStreamGraph(this.$node, <PVDModels.DOIAttribute>(<any>a), normalizer, this.config, this, defConfig);
          this._currentChildren.push(doistream);
          this._allChildrenMap.set(defId, doistream);
          break;
        case 'composite':
          var composite = new PVDCompositeAttributeHeatmap(this.$node, a, normalizer, this.config, this, defConfig);
          this._currentChildren.push(composite);
          this._allChildrenMap.set(defId, composite);
          break;
        case 'gradientheatmap':
          var gradientheatmap = new PVDGradientHeatmap(this.$node, a, normalizer, this.config, this, defConfig);
          this._currentChildren.push(gradientheatmap);
          this._allChildrenMap.set(defId, gradientheatmap);
          break;
        default:
          var heatmap = new PVDHeatmap(this.$node, a, normalizer, this.config, this, defConfig);
          this._currentChildren.push(heatmap);
          this._allChildrenMap.set(defId, heatmap);
          break;
      }
    }

    private createConnectionHeatMap(defId:string, defAttr:string, defConfig:any) {
      var select;
      switch(defConfig.type) {
        case 'inout':
          select = (n) => n.outgoingEdges().slice().concat(n.incomingEdges());
          break;
        case 'in':
          select = (n) => n.incomingEdges();
          break;
        case 'out':
          select = (n) => n.outgoingEdges();
          break;
      }
      var attrs = [];
      var h = this.grid.hierarchy;
      function traverse(n: PVDModels.Node) {
        var a = select(n).map((e) => e.getAttr(defAttr));
        attrs.push.apply(attrs,a);
        h.children(n).forEach(traverse);
      }
      if (this.collapsed) {
        this._collapsed = false; //simulate not collapsed for traversal
        traverse(this.node);
        this._collapsed = true;
      } else {
        attrs = select(this.node).map((e) => e.getAttr(defAttr));
      }
      attrs = attrs.filter((e: any) => e);
      if (attrs.length === 0) {
        return;
      }
      var a = PVDModels.compose(attrs, '+', this.node, defAttr);
      var r = new PVDVisualizations.PVDHeatmap(this.$node, a, this.config.streamNormalizer, this.config, this, defConfig);
      this._currentChildren.push(r);
      this._allChildrenMap.set(defId, r);
    }

    private createTimeAxis(defId:string, defConfig:any) {
      var timeAxis = new PVDTimeAxis(this.$node, this.config, this, defConfig);
      this._currentChildren.push(timeAxis);
      this._allChildrenMap.set(defId, timeAxis);
    }

    private createStreamGraph(defId:string, defAttr:string, defConfig:any) {
      var h = this.hierarchy,
        id = (defConfig.incoming ? 'addIncomingEdge' : 'addOutgoingEdge') + this.id + '.streamgraph',
        provider, that = this, listening = [];
      function onAdded(edge: PVDModels.Edge) {
        var a = edge.getAttr(defAttr);
        if (a && provider.onAdded) {
          provider.onAdded(a);
        }
      }
      function list() {
        var attrs = [];
        function traverse(n: PVDModels.Node) {
          var a = (defConfig.incoming ? n.incomingEdges() : n.outgoingEdges()).map((edge) => edge.getAttr(defAttr));
          attrs.push.apply(attrs, a);
          if(h !== undefined) {
            h.children(n).forEach(traverse);
          }
        }
        if (that.collapsed) {
          that._collapsed = false; //simulate not collapsed for traversal
          traverse(that.node);
          that._collapsed = true;
        } else {
          attrs = (defConfig.incoming ? that.node.incomingEdges() : that.node.outgoingEdges()).map((edge) => edge.getAttr(defAttr));
        }

        attrs = attrs.filter((x : any) => x);
        return attrs;
      }

      function traverse(n: PVDModels.Node) {
        listening.push(n);
        n.on(id, onAdded);
        onDelete(that.$node, () => {
          n.on(id, null);
        });
        if(h !== undefined) {
          h.children(n).forEach(traverse);
        }
      }
      if (that.collapsed) {
        that._collapsed = false; //simulate not collapsed for traversal
        traverse(that.node);
        that._collapsed = true;
      } else {
        listening.push(that.node);
        that.node.on(id, onAdded);
        onDelete(that.$node, () => {
          that.node.on(id, null);
        });
      }

      provider = {
         name: defAttr,
         attrs : list,
         onAdded : null,
         deleted : function() {
           listening.forEach((n) => {
             n.on(id, null);
           });
        }
      };
      var type : any = defConfig.interpolate ? PVDVisualizations.PVDStreamGraph : PVDVisualizations.PVDStackedBars;
      var r = new type(this.$node, this.node, provider, this.config, this.collapsed, this, defConfig);
      this._currentChildren.push(r);
      this._allChildrenMap.set(defId, r);
    }

    position() {
      return {
        x : PVDHierarchyUpInlay.fromPx(this.$node.style('left')),
        y : PVDHierarchyUpInlay.fromPx(this.$node.style('top'))
      };
    }

    pos(x: number, y: number) {
      this.$node.style('top', y + 'px').style('left', x + 'px');
    }

    get width() {
      return this._width;
    }

    get height() {
      return this._height;
    }

    transformTo(x:number, y:number, width:number, height:number, endCb?) {
      this.transition = this.$node
        .transition().duration(0.75*this.config.transitionDuration)
        .style('top', y + 'px').style('left', x + 'px')
        .style('width', width + 'px').style('height', height + 'px')
        .each('end', () => {
          if(endCb !== undefined) {
            endCb();
          }
          this.transition = null;
        });
    }

    get activity() {
      return this.config.activityOf(this.node);
    }

    autoShrink() {
      var act = this.activity;
      if (d3.round(this.oldActivity,2) === d3.round(act,3)) {
        return;
      }
      this.oldActivity = act;
      this.setScaleFactor(0, this.config.act2width(act));
    }

    dirtyLayout() {
      if (this.config.autoShrink) {
        //this.autoShrink();
        this.grid.dirtyLayout();

      } else if(this.grid !== null && this.config.triggerActivity) {
        this.grid.dirtyLayout();
      }
    }

    focusOn(node: PVDModels.Node) {
      if(this.grid !== null) {
        this.grid.focusOn(node);
      }
    }

    relayout(width:number, height:number):void {
      //width = (isNaN(width)) ? PVDHierarchyUpInlay.fromPx(this.$node.style('width')) : width;
      //height = (isNaN(height)) ? PVDHierarchyUpInlay.fromPx(this.$node.style('height')) : height;
      //width = width || PVDHierarchyUpInlay.fromPx(this.$node.style('width'));
      //height = height || PVDHierarchyUpInlay.fromPx(this.$node.style('height'));

      if(this.node.color) {
        if(this.config.useCustomColor) {
          this.$node
            .classed('color-'+(this.node.infrastructure.color), false)
            .style('background-color', this.node.color)
            .style('color', idealTextColor(this.node.color));
        } else {
          this.$node
            .classed('color-'+(this.node.infrastructure.color), true)
            .style('background-color', null)
            .style('color', null);
        }
      }

      if (width === 0 || height === 0) {
        this.$node
          .style('width', 0 + 'px')
          .style('height', 0 + 'px')
          .style('display', 'none');
        return;
      } else {
        this.$node.style('display', null);
      }

      this.$node.style('width', width + 'px').style('height', height + 'px');

      this._width = width;
      this._height = height;

      //accumulate the scale factors
      var wc = 0, hc = 0, c = 0;
      this._allChildrenMap.forEach((desc, x) => {
        if(x.isVisible === false) { return; }
        wc += x.scaleFactor[0];
        hc += x.scaleFactor[1];
      });
      //uniformly distribute them
      //width /= wc; // same width for every element, because the children are stacked upon and not next to each other
      height /= hc;

      this._allChildrenMap.forEach((desc, x) => {
        if(x.isVisible === false) { return; }
        x.pos(0, height * c);
        c += x.scaleFactor[1];
        x.relayout(width, height * x.scaleFactor[1])
      });
    }

    anchorPoint(position?:number[]) {
      // get
      if(position === undefined) {
        return this._anchorPoint;
      // set
      } else if(position.length === 2) {
        this._anchorPoint = position;
      // reset
      } else {
        this._anchorPoint = this._defaultAnchorPoint.slice();
      }
    }
  }

  class DynamicTextElement implements IAnimateable, PVDInnerElement {
    $node:D3.Selection;
    $text:D3.Selection;
    scaleFactor = [1, 4];

    constructor(private $parent : D3.Selection, private attr, private config : PVDHierarchyConfig, private nodeEl:PVDHierarchyNode, public defConfig:any) {
      this.$node = $parent.append('div').classed('hg-dtext', true);
      this.$text = this.$node.append('span').text(attr.name);

      config.animator.push(this); // @see this.show()
      //when my node is removed from the dom unregister the service
      onDelete(this.$node, () => {
        config.animator.remove(this);
      });
    }

    setScaleFactor(dim: number, val: number) {
      this.scaleFactor[dim] = val;
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

    dataAt(ts: number) {
      return [];
    }

    get isVisible() {
      return this.$node[0][0].className.indexOf('hg-hidden') === -1;
    }

    pos(x: number, y: number) {
      this.$node.style({top: y + 'px', left: x + 'px'});
    }

    relayout(width:number, height:number):void {
      //this.$text.classed('hg-hidden', this.textWidth > width);

      this.$node.style({width: width + 'px', height: height + 'px', 'line-height': height + 'px'});
    }

    layout(dt:number, now:number):any {

    }

    update(dt:number, now:number, layouted:any):void {
      var data = this.attr.values(now, now, dt);
      this.$text.text(data);
    }
  }

  class LabelElement implements PVDInnerElement {
    private _defaultConfig = {
      'height': 1,
      'width': 1,
      'template': '{{name}}',
      'nodeCollapse': false,
      'nodeSelect': false,
      'nodeFocus': false,
      'nodeDrag': false
    };

    private _defConfig;

    $node : D3.Selection;
    $text : D3.Selection;
    $collapse : D3.Selection;
    scaleFactor = [1,2];

    constructor(private node:PVDModels.Node, private $parent : D3.Selection, private config : PVDHierarchyConfig, private nodeEl:PVDHierarchyNode, defConfig:any) {
      this.defConfig = defConfig; // override default config

      this.$node = $parent.append('div').classed('hg-label', true);
      this.addLabel();

      this.addNodeCollapse();
      this.addNodeDrag();
      this.addNodeSelect();
      this.addNodeFocus();
    }

    set defConfig(value:any) {
      this._defConfig = angular.extend({}, this._defaultConfig, value);
    }

    get defConfig() {
      return this._defConfig;
    }

    private addLabel() {
      var that = this;

      var text = that.defConfig.template;
      text = text.replace('{{name}}', that.node.name);
      text = text.replace('{{title}}', that.node.title);
      text = text.replace('{{alias}}', that.node.alias);

      that.$text = that.$node.append('span').text(text);
      that.$node.call(PVDVisualizations.tooltip(text));
      //that.textWidth = that.$text[0][0].offsetWidth;
    }

    private addNodeCollapse() {
      var that = this;
      if(that.defConfig.nodeCollapse === false) { return; }

      if(that.nodeEl.hasNodeChildren() || that.nodeEl.collapsed) {
        that.$collapse = that.$node.append('i')
          .classed('fa',true)
          .classed('fa-chevron-down', that.nodeEl.collapsed)
          .classed('fa-chevron-up', !that.nodeEl.collapsed)
          .on('click', function() {
            that.nodeEl.collapsed = !that.nodeEl.collapsed;
            d3.select(this)
              .classed('fa-chevron-down', !that.nodeEl.collapsed)
              .classed('fa-chevron-up', that.nodeEl.collapsed)
          });
      }
    }

    private addNodeDrag() {
      var that = this;
      if(that.defConfig.nodeDrag === false) { return; }

      var dragStarted = false,
        dragged = false;

      var dragListener = d3.behavior.drag()
        .on('dragstart', function(d) {
          if(that.node.has() ||
            that.node === that.node.infrastructure.root ||
            that.node === that.node.infrastructure.external) {
            return;
          }
          dragStarted = true;
          dragged = false;
          // it's important that we suppress the mouseover event on the node being dragged. Otherwise it will absorb the mouseover event and the underlying node will not detect it d3.select(this).attr('pointer-events', 'none');
          d3.event.sourceEvent.stopPropagation();
          that.config.selection.dragStart(that.node);
        })
        .on('drag', function(d) {
          if(that.node.has() ||
            that.node === that.node.infrastructure.root ||
            that.node === that.node.infrastructure.external) {
            return;
          }
          if (dragStarted) {
            dragged = true;
            that.config.selection.drag(that.node);
          }
          //console.log('drag', d3.event.sourceEvent.clientX, d3.event.sourceEvent.clientY);
        })
        .on('dragend', function(d) {
          if(that.node.has() ||
            that.node === that.node.infrastructure.root ||
            that.node === that.node.infrastructure.external) {
            return;
          }

          dragStarted = false;
          if(dragged) {
            dragged = false;
            that.config.selection.dragEnd(that.node);
          }
          //console.log('dragend', d3.event.sourceEvent.clientX, d3.event.sourceEvent.clientY);
        });

      that.$node.call(dragListener);
    }

    private addNodeSelect() {
      var that = this;
      if(that.defConfig.nodeSelect === false) { return; }

      that.$node.on('click', () => {
        d3.event.stopPropagation();

        // exclude external and intermediate nodes
        if(that.node.has() || that.node === that.node.infrastructure.external) { return; }

        //multi selection
        var additive = (<any>d3.event).ctrlKey || (<any>d3.event).shiftKey;
        var is = that.config.selection.isSelected(that.node);
        if (is) {
          if (additive) {
            that.config.selection.removeFromSelection(that.node);
          } else {
            that.config.selection.clearSelection();
          }
        } else if (additive) {
          that.config.selection.addToSelection(that.node);
        } else {
          that.config.selection.selection = that.node;
        }
      });
    }

    private addNodeFocus() {
      var that = this;
      if(that.defConfig.nodeFocus === false) { return; }

      that.$node.on('dblclick', () => {
        d3.event.stopPropagation();

        // exclude external and leaves
        if(!that.node.has() || that.node === that.node.infrastructure.external) { return; }

        that.nodeEl.focusOn(that.node);
      });
    }

    setScaleFactor(dim: number, val: number) {
      this.scaleFactor[dim] = val;
    }

    hide() {
      this.$node.classed('hg-hidden', true);
    }

    show() {
      this.$node.classed('hg-hidden', false);
    }

    fadeIn() {
      this.show();
    }

    fadeOut() {
      this.hide();
    }

    dataAt(ts: number) {
      return [];
    }

    get isVisible() {
      return this.$node[0][0].className.indexOf('hg-hidden') === -1;
    }

    pos(x: number, y: number) {
      this.$node.style({top: y + 'px', left: x + 'px'});
    }

    relayout(width:number, height:number):void {
      //this.$text.classed('hg-hidden', this.textWidth > width);

      this.$node.style({width: width + 'px', height: height + 'px', 'line-height': height + 'px'});
    }
  }

  class TimeHighlight implements IAnimateable {
    private $node : D3.Selection;
    private name : string;
    private lastx : number;
    marginLeft = 0;
    marginRight = 0;
    fixedWidth = -1;

    constructor($parent : D3.Selection, node : PVDModels.Node, private config: PVDHierarchyConfig, private dataFor : (ts: number) => {name: string; value:string}[]) {
      this.$node = $parent.append('div').classed('hg-timehighlight',true);
      this.name = node.name;
      var t = PVDVisualizations.tooltip();

      var inner = this.$node.append('div');

      var lastTS = null;

      this.$node
        .on('mouseenter', () => {
          d3.event.stopPropagation();
          var ts = this.toTS(this.lastx = (<any>d3.event).pageX);
          this.config.selection.hoverTime = ts ? ts.ts : -1;
          lastTS = null;
          if (ts) {
            lastTS = ts;
            t.mouseover(this.createTooltip(ts.ts));
            inner.style({
              left: ts.x+'px',
              width: ((this.fixedWidth > 0) ? this.fixedWidth : ts.bin) + 'px',
              display: 'block'});
          }
          config.animator.push(this);
        })
        .on('mousemove', () => {
          d3.event.stopPropagation();
          var ts = this.toTS(this.lastx = (<any>d3.event).pageX);
          this.config.selection.hoverTime = ts ? ts.ts : -1;
          if (ts) {
            if(lastTS === null) {
              t.mouseover(this.createTooltip(ts.ts));
            }
            lastTS = ts;
            t.update(this.createTooltip(ts.ts));
            inner.style({
              left: ts.x+'px',
              width: ((this.fixedWidth > 0) ? this.fixedWidth : ts.bin) + 'px',
              display: 'block'});
            t.mousemove();
          } else {
            t.mouseout();
            lastTS = null;
            this.config.selection.hoverTime = -1;
            inner.style('display',null);
          }
        })
        .on('mouseleave', () => {
          d3.event.stopPropagation();
          t.mouseout();
          lastTS = null;
          this.config.selection.hoverTime = -1;
          inner.style('display',null);
          config.animator.remove(this);
        });
      onDelete(this.$node,() => {
        //just in case
        config.animator.remove(this);
      });
    }

    layout(dt:number, now: number) {

    }

    update(dt:number, now:number, layouted : any) {
      var ts = this.toTS(this.lastx);
      if (ts) {
        PVDVisualizations.tooltip().update(this.createTooltip(ts.ts));
      }
    }

    private toRelative(pageX: number) {
      var $this = $(this.$node.node());
      var pos = $this.offset();
      var x = pageX - pos.left;
      return x;
    }

    private toTS(pageX : number) {
      var $this = $(this.$node.node());
      var x = this.toRelative(pageX);
      var w = $this.width();
      if (x < this.marginLeft || x > (w-this.marginRight)) {
        return null;
      }
      var d = this.config.dataRange(this.config.animator.now, w);
      var s = d3.scale.linear().domain([d.zeroTime, d.widthTime]).range([this.marginLeft, w-this.marginRight]);
      var ts = s.invert(x);
      var tsbin = d.start;
      while (d.step.step(tsbin) < ts) {
        tsbin = d.step.step(tsbin);
      }
      var binWidth = s(d.zeroTime+this.config.binWidth());
      return {
        ts: tsbin,
        bin : binWidth - this.marginLeft,
        x : s(tsbin)
      };
    }

    private createTooltip(ts: number) {
      var data = this.dataFor(ts);
      var dateFormat = d3.time.format.utc('%a, %Y-%m-%d %H:%M:%S UTC');

      var r = ["<table class='statusinfo'><caption>"];
      r.push(this.name);
      r.push(' @ ');
      r.push(dateFormat(new Date(ts)));
      r.push("</caption><thead><tr><th>Attribute</th><th>Value</th></tr></thead><tbody>");
      data.forEach((d) => {
        r.push("<tr><th>");
        r.push(d.name);
        r.push("</th><td>");
        r.push(d.value);
        r.push("</td></tr>\n");
      });
      r.push("</tbody></table>");
      return r.join('');
    }
  }
}
