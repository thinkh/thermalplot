/**
 * Created by Samuel Gratzl on 16.04.2014.
 */
/// <reference path='../../../tsd.d.ts' />

module PVDModels {

  /**
   * container for attributes
   */
  export class AttributeContainer{
    private _attributes = d3.map();

    getAttr(attr:string):IAttribute<any> {
      return this._attributes.get(attr);
    }

    addAttr(attr:IAttribute<any>):void {
      this._attributes.set(attr.name, attr);
    }

    hasAttr(attr:string):boolean {
      return this._attributes.has(attr);
    }

    attrs():Array<IAttribute<any>> {
      return this._attributes.values();
    }
  }

  export class Node extends AttributeContainer implements IPathElem {
    public title : string;
    private listeners = d3.dispatch('addOutgoingEdge', 'addIncomingEdge', 'addMapping', 'removeMapping', 'addChild', 'removeChild', 'addAttr', 'changedColor');
    private _children : D3.Map<Node> = d3.map();
    private _outgoingEdges : D3.Map<Edge> = d3.map();
    private _incomingEdges : D3.Map<Edge> = d3.map();
    private _color = undefined;

    /**
     * mappings to other hierarchies, format <id,[Node]>
     * @type {Map}
     * @private
     */
    private _mappings : D3.Map<Node[]> = d3.map();

    constructor(public name:string, public alias:string, public parent:Node, private _master = false) {
      super();
      this.title = this.name;
      if (!alias) {
        this.alias = null;
      }
      if (parent) {
        parent.addChild(name, this);
      }
    }

    get master() {
      return this._master;
    }

    get parents() : Node[] {
      var r = this.parent ? this.parent.parents : [];
      r.unshift(this);
      return r;
    }

    get infrastructure():Infrastructure {
      //assert parent isn't null otherwise the root should have overwritten this
      return this.parent.infrastructure;
    }

    get fqname() {
      if (!this.parent)
        return this.name;
      //dns style
      if(this.name.indexOf('.') > -1) {
        return '('+this.name + ').' + this.parent.fqname;
      } else {
        return this.name + '.' + this.parent.fqname;
      }
    }

    get fqIname() {
      return this.infrastructure.id + ':' + this.fqname;
    }

    set color(value) {
      if(value !== this._color) {
        var tmp = this._color;
        this._color = value;
        this.fire('changedColor', value, tmp);
      }
    }

    get color() {
      return this._color;
    }

    on(type:string, listener?) {
      if (arguments.length < 2) {
        return this.listeners.on(type);
      }
      this.listeners.on(type, listener);
      return this;
    }

    private fire(type:string, ...args:any[]) {
      this.listeners[type].apply(this, args);
    }

    get level():number {
      if (!this.parent)
        return 1;

      return this.parent.level + 1;
    }

    toString() {
      return this.fqIname;
    }

    get(child:string):Node {
      return this._children.get(child);
    }

    has(child:string = null):boolean {
      if (child !== null) {
        return this._children.has(child);
      } else {
        return !this._children.empty();
      }
    }

    children(filter = ((value:Node, index:number, array:Node[]) => true)):Node[] {
      return this._children.values().filter(filter);
    }

    is(name:string):boolean {
      return this.name === name;
    }

    find(path:string):Node;

    find(path:string[]):Node;

    find(path):Node {
      if (typeof path === 'string')
        path = path.split('.');
      if (path.length == 0)
        return this;
      var tail = path.pop();
      var next = this.get(tail);
      if (!next) {
        console.warn('cant resolve path: ' + path.join('.') + '.' + tail + '???' + '.' + this.fqIname);
        return null;
      }
      return next.find(path);
    }

    addAttr(attr:IAttribute<any>):void {
      this.fire('addAttr', attr);
      super.addAttr(attr);
    }

    private addChild(name: string, child : Node) {
      this.fire('addChild', child);
      this._children.set(name, child);
    }

    outgoingEdges():Edge[] {
      return this._outgoingEdges.values();
    }

    outgoingNodes():Node[] {
      return this.outgoingEdges().map((e) => e.dst);
    }

    addOutgoingEdge(edge:Edge):void {
      this.fire('addOutgoingEdge', edge);
      this._outgoingEdges.set(edge.dst.fqIname, edge);
    }

    getOutgoingEdge(node:Node):Edge;

    getOutgoingEdge(fqname:string):Edge;

    getOutgoingEdge(ref:any):Edge {
      var key = ref.toString();
      if (this._outgoingEdges.has(key)) {
        return this._outgoingEdges.get(key);
      }
      return this.infrastructure.createEdge(this, ref);
    }

    hasOutgoingEdge(node:Node):boolean;

    hasOutgoingEdge(fqname:string):boolean;

    hasOutgoingEdge(ref:any):boolean {
      return this._outgoingEdges.has(ref.toString());
    }

    incomingEdges():Edge[] {
      return this._incomingEdges.values();
    }

    incomingNodes():Node[] {
      return this.incomingEdges().map((e) => e.src);
    }

    addIncomingEdge(edge:Edge):void {
      this.fire('addIncomingEdge', edge);
      this._incomingEdges.set(edge.src.fqIname, edge);
    }

    getIncomingEdge(node:Node):Edge;

    getIncomingEdge(fqname:string):Edge;

    getIncomingEdge(ref:any):Edge {
      var key = ref.toString();
      if (this._incomingEdges.has(key)) {
        return this._incomingEdges.get(key);
      }
      return this.infrastructure.createEdge(ref, this);
    }

    hasIncomingEdge(node:Node):boolean;

    hasIncomingEdge(fqname:string):boolean;

    hasIncomingEdge(ref:any):boolean {
      return this._incomingEdges.has(ref.toString());
    }

    addMapping(id:string, node:Node) {
      this.fire('addMapping', id, node);
      if (!this._mappings.has(id)) {
        this._mappings.set(id, [node]);
      } else {
        this._mappings.get(id).push(node);
      }
    }

    removeMapping(id:string, node:Node) {
      this.fire('removeMapping', id, node);
      if (this._mappings.has(id)) {
        var m = this._mappings.get(id);
        m.splice(m.indexOf(node),1);
      }
    }

    getMappings(id:string):Node[] {
      if (!this._mappings.has(id)) {
        return [];
      }
      return this._mappings.get(id);
    }

    getAllMappings():D3.Map<Node[]> {
      return this._mappings;
    }
  }

  export class ExternalNode extends Node {
    private _infrastructure : Infrastructure;
    private aliases : RegExp;

    constructor(aliases:string) {
      super('external', null, null);
      this.aliases = (aliases) ? new RegExp(aliases) : null;
    }

    get level():number {
      return 0; // external is always level = 0
    }

    /**
     * external can match a bunch of items identified by a wildcard alias
     * @param alias
     * @returns {boolean}
     */
    match(alias: string) : boolean {
      if (!this.aliases) {
        return false;
      }
      return this.aliases.test(alias);
    }

    get infrastructure() : Infrastructure {
      return this._infrastructure;
    }

    set infrastructure(val : Infrastructure) {
      this._infrastructure = val;
    }
  }
  /**
   * special node instance which has the real infrastructure as property
   */
  export class RootNode extends Node {
    private _infrastructure : Infrastructure;

    constructor(name:string, alias:string) {
      super(name, alias, null);
    }

    get infrastructure() :Infrastructure {
      return this._infrastructure;
    }

    set infrastructure(val : Infrastructure) {
      this._infrastructure = val;
    }
  }

  export class Edge extends AttributeContainer implements IPathElem {
    constructor(public src:Node, public dst:Node, addIt = true) {
      super();
      if (addIt) {
        src.addOutgoingEdge(this);
        dst.addIncomingEdge(this);
      }
    }

    get parent() {
      //I'm attached as outgoing to my src, so this is my parent
      return this.src;
    }

    get parents() {
      var r = <IPathElem[]>this.parent.parents;
      r.unshift(this);
      return r;
    }

    get infrastructure() {
      return this.src.infrastructure;
    }

    get name() {
      return this.src.name + '-' + this.dst.name;
    }

    get alias() {
      return null;
    }

    toString() {
      return this.fqIname;
    }

    get fqname() {
      return this.src.fqname + '-' + this.dst.fqname;
    }

    get fqIname() {
      return this.src.infrastructure.id + ':' + this.src.fqname + '-' + this.dst.infrastructure.id + ':' + this.dst.fqname;
    }
  }

  /**
   * model of an infrastructure with a root node and external node
   */
  export class Infrastructure {
    edgeInitializers:Array<(edge:Edge) => any> = [];

    public oids:string[] = [];
    public color:string = "";
    public visConfig:any = {};
    public dynamicRangeAttr = [];

    private listeners = d3.dispatch('addNode');

    constructor(public name:string, public root:RootNode, public external:ExternalNode, public version:string = '0.0.1', public id:string = '', private edgeFactory:(src:Node, dst:Node) => Edge = () => null) {
      root.infrastructure = this;
      external.infrastructure = this;
    }

    on(type:string, listener?) {
      if (arguments.length < 2) {
        return this.listeners.on(type);
      }
      this.listeners.on(type, listener);
      return this;
    }

    private fire(type:string, ...args:any[]) {
      this.listeners[type].apply(this, args);
    }

    /**
     * Dummy function to trigger event
     */
    addNode(node:Node):Node {
      this.fire('addNode', node);
      return node;
    }


    findNode(path:string):Node;

    findNode(path:string[]):Node;

    findNode(path):Node {
      if (typeof path === 'string') {
        // split at '.', but not inside parentheses; e.g., "(my-node.de).parent.com"
        path = path.split(/\((.*?)\)|\.(\w*)/gi).filter((s) => (s !== undefined && s !== ''));
      }
      if (path.length == 0)
        return null;
      var tail = path.pop();
      if(tail.indexOf('(') > -1) {
        tail = tail.replace('(', '').replace(')', '');
      }
      if (this.external.is(tail))
        return this.external;
      if (this.root.is(tail))
        return this.root.find(path);
      console.warn('cant resolve path: ' + path);
      return null;
    }

    findEdge(path:string):Edge;

    findEdge(src:string, dst:string):Edge;

    findEdge(path, dst?:string):Edge {
      var src;
      if (typeof path === 'string' && !dst) {
        path = path.split('-');
        if (path.length != 2) {
          console.warn('invalid path: ' + path.join('-'));
          return null;
        }
        src = path[0];
        dst = path[1];
      }
      var srcNode = this.findNode(src);
      if (!srcNode) {
        console.warn('invalid path: ' + path.join('-') + ' invalid source node');
        return null; //invalid
      }
      var edge = srcNode.getOutgoingEdge(dst);
      if (!edge) {
        console.warn('invalid path: ' + path.join('-') + ' invalid dst node or no edge defined');
      }
      return edge;
    }

    findAttr(path:string):IAttribute<any>;

    findAttr(path:string[], attr:string):IAttribute<any>;

    findAttr(path, attr?:string):IAttribute<any> {
      if (typeof path === 'string') {
        path = path.split('#');
        if (path.length !== 2) {
          console.warn('invalid path: ' + path.join('#'));
          return null;
        }
        attr = path[1];
        path = path[0];
      }
      var parent:AttributeContainer = this.find(path);
      var r = parent ? parent.getAttr(attr) : null;
      if (!r) {
        if (parent)
          console.warn('invalid attribute in path: ' + path + ' ' + attr);
        else
          console.warn('invalid path: ' + path);
      }
      return r;
    }

    find(path:string):any {
      if (path.indexOf('#') > 0)
        return this.findAttr(path);
      if (path.indexOf('-') > 0)
        return this.findEdge(path);
      return this.findNode(path);
    }

    /**
     * return a list of all nodes
     * @returns {PVDModels.Node[]}
     */
    nodes():Node[] {
      function flatten(root:Node, r:Node[] = new Array<Node>()):Node[] {
        r.push(root);
        root.children().forEach((child) => flatten(child, r));
        return r;
      }

      var r = flatten(this.root);
      r.push(this.external);
      return r;
    }

    /**
     * return all edges
     * @param nodes optional list of nodes to consider
     * @returns {PVDModels.Edge[]}
     */
    edges(nodes:Node[] = this.nodes()):Edge[] {
      var r = new Array<Edge>();
      nodes.forEach((node) => r.push.apply(r, node.outgoingEdges()));
      return r;
    }


    createEdge(src:Node, dst:string);
    createEdge(src:string, dst:Node);
    createEdge(src:Node, dst:Node);
    createEdge(src:any, dst:any):Edge {
      var s = src instanceof Node ? (<Node>src) : this.findNode(src.toString());
      var d = dst instanceof Node ? (<Node>dst) : this.findNode(dst.toString());
      //create edge on the fly
      var r = this.edgeFactory(s, d);
      if (r) {
        this.edgeInitializers.forEach((init) => init(r));
        s.addOutgoingEdge(r);
        d.addIncomingEdge(r);
      }
      return r;
    }

    /**
     * calls the given function for each attribute
     */
    forEachAttr(func:(attr:IAttribute<any>) => void) {
      function traverseImpl(node:PVDModels.Node) {
        node.attrs().forEach(func);
        node.outgoingEdges().forEach((edge) => {
          edge.attrs().forEach(func)
        });
        node.children().forEach(traverseImpl);
      }

      traverseImpl(this.external);
      traverseImpl(this.root);
    }

    /**
     * clears all data in all attributes
     **/
    public clearAttributes(from = Number.NEGATIVE_INFINITY, to = Number.POSITIVE_INFINITY) {
      this.forEachAttr(attr => attr.clear(from, to));
    }
    public lockInAttributes(ts: number) {
      this.forEachAttr(attr => attr.lock(ts));
    }
    public unlockInAttributes(ts: number) {
      this.forEachAttr(attr => attr.unlock(ts));
    }
    public lockAndSetIndexTS(ts: number) {
      this.forEachAttr(attr => {
        if(attr instanceof DeltaIndexAttribute) {
          (<DeltaIndexAttribute>attr).setIndexTS(ts);
        }
        attr.lock(ts);
      });
    }

    /**
     * Looks for attributes that are NumberAttribute with enabled dynamicRange property.
     * Finds the min and max value in the defined time window and sets this to every attribute of the same type.
     */
    public updateDynamicRangeAttr(from, to) {
      var dRangeAttr:D3.Map<NumberAttribute[]> = d3.map(),
          dRangeExtent:D3.Map<number[]> = d3.map();

      // find attributes for dynamic range and get the global min and max
      this.forEachAttr(attr => {
        if(attr.isNormalizeAble && (<NumberAttribute>attr).dynamicRange !== undefined && (<NumberAttribute>attr).dynamicRange === true) {
          if(dRangeAttr.has(attr.name) === false) {
            dRangeAttr.set(attr.name, []);
            dRangeExtent.set(attr.name, []);
          }
          dRangeAttr.get(attr.name).push(<NumberAttribute>attr);
          dRangeExtent.set(attr.name, d3.extent(dRangeExtent.get(attr.name).concat((<NumberAttribute>attr).rangeFromData(from, to))));
        }
      });
      //console.log(dRangeExtent);
      dRangeAttr.forEach((name, attrs) => {
        attrs.forEach((attr) => {
          if(dRangeExtent.get(name)[0] !== undefined && dRangeExtent.get(name)[0] !== Number.NEGATIVE_INFINITY) {
            attr.min = dRangeExtent.get(name)[0];
          }
          if(dRangeExtent.get(name)[1] !== undefined && dRangeExtent.get(name)[1] !== Number.POSITIVE_INFINITY) {
            attr.max = dRangeExtent.get(name)[1];
          }
        });
      });
    }
  }

  function parseAttribute(name:string, attrConfig:any, parent:IPathElem):IAttribute<any> {
    var type:string = (typeof attrConfig === 'string') ? attrConfig : attrConfig.type;
    var alias:string = null;
    if (typeof attrConfig !== 'string' && attrConfig.name) {
      name = attrConfig.name;
    }
    if (typeof attrConfig !== 'string' && attrConfig.alias) {
      alias = attrConfig.alias;
    }
    switch (type) {
      case 'float':
      {
        var min = Number.NEGATIVE_INFINITY;
        if(attrConfig.min !== undefined) {
          min = attrConfig.min;
        } else if(attrConfig.range && attrConfig.range.length === 2) {
          min = attrConfig.range[0];
        }
        var max = Number.POSITIVE_INFINITY;
        if(attrConfig.max !== undefined) {
          max = attrConfig.max;
        } else if(attrConfig.range && attrConfig.range.length === 2) {
          max = attrConfig.range[1];
        }
        return new NumberAttribute(name, alias, parent, min, max, attrConfig.value, attrConfig.unit, attrConfig.invert, attrConfig.dynamicRange);
      }
      case 'float_calc':
      {
        var min = Number.NEGATIVE_INFINITY;
        if(attrConfig.min !== undefined) {
          min = attrConfig.min;
        } else if(attrConfig.range && attrConfig.range.length === 2) {
          min = attrConfig.range[0];
        }
        var max = Number.POSITIVE_INFINITY;
        if(attrConfig.max !== undefined) {
          max = attrConfig.max;
        } else if(attrConfig.range && attrConfig.range.length === 2) {
          max = attrConfig.range[1];
        }

        var formula = '';

        if(attrConfig.formula !== undefined) {
          formula = attrConfig.formula;
        }

        // NumberAttribute with formula for calculation
        // Note: all attributes must have the same timestamp
        return new NumberCalcAttribute(name, alias, parent, min, max, attrConfig.value, attrConfig.unit, attrConfig.invert, attrConfig.formula);
      }
      case 'categorical':
      {
        var categories:string[] = attrConfig.categories;
        return new CategoricalAttribute(name, alias, parent, categories, attrConfig.ordinal ? true : false);
      }
      case 'int':
      case 'long': // TODO Create new LongAttribute class for this type
      {
        var min = Number.NEGATIVE_INFINITY;
        if(attrConfig.min !== undefined) {
          min = attrConfig.min;
        } else if(attrConfig.range) {
          min = attrConfig.range[0];
        }
        var max = Number.POSITIVE_INFINITY;
        if(attrConfig.max !== undefined) {
          max = attrConfig.max;
        } else if(attrConfig.range && attrConfig.range.length > 1) {
          max = attrConfig.range[1];
        }
        return new IntAttribute(name, alias, parent, min, max, attrConfig.value, attrConfig.unit, attrConfig.invert);
      }
      case 'natural_int':
        var max = Number.POSITIVE_INFINITY;
        if(attrConfig.max !== undefined) {
          max = attrConfig.max;
        } else if(attrConfig.range && attrConfig.range.length > 1) {
          max = attrConfig.range[1];
        }
        return new IntAttribute(name, alias, parent, 0, max, attrConfig.value, attrConfig.unit, attrConfig.invert);
      case 'frequency': //special type, which bins all between values by counting them together
        var max = Number.POSITIVE_INFINITY;
        if(attrConfig.max !== undefined) {
          max = attrConfig.max;
        } else if(attrConfig.range && attrConfig.range.length > 1) {
          max = attrConfig.range[1];
        }
        var r = new IntAttribute(name, alias, parent, 0, max, attrConfig.value, attrConfig.unit, attrConfig.invert);
        r.binner = d3.sum;
        return r;
      case 'counter':
        return new CounterAttribute(name, alias, parent);
      case 'string':
        return new StringAttribute(name, alias, parent);
      case 'composite':
        var oca = new ObjectCompositeAttribute(parent, name, alias),
          par = (<PVDModels.Node>parent);
        attrConfig.attributes.forEach((attrStr) => {
          if(par.hasAttr(attrStr)) {
            oca.attrs.push(par.getAttr(attrStr));
          } else {
            console.warn('attribute ' + attrStr + ' is not defined before the composite attribute ' + name);
          }
        });
        return oca;
      case 'constant':
        return new ConstantAttribute<any>(name, alias, parent, attrConfig.invert);
      case 'delta_index':
        return new DeltaIndexAttribute(name, alias, parent, attrConfig.attr, attrConfig.invert, attrConfig.range);
      case 'delta_index_percentage':
        return new DeltaIndexPercentageAttribute(name, alias, parent, attrConfig.attr, attrConfig.invert, attrConfig.range);
      case 'doi':
        return new DOIAttribute(name, alias, parent, undefined, attrConfig.invert);
      default:
      {
        console.warn('invalid attribute type: ' + type + ' using string as default');
        return new StringAttribute(name, alias, parent);
      }
    }
  }

  function parseAttributes(config:any, container:AttributeContainer, parent:IPathElem) {
    d3.map(config.attributes).forEach((key, value) => {
      var a = parseAttribute(key, value, parent);
      container.addAttr(a);
    })
  }

  /**
   * Add the `traits` parameter to `config.traits`
   */
  function inlineTraits(config:any, traits:D3.Map<any>):void {
    if (!config.traits || config.traits.length === 0) return; //no traits defined
    //map to traits objects or dummy ones
    var tt = config.traits.map((t:string):any => {
      var r = traits.get(t);
      r = r || {};
      return r;
    });
    //convert to $.extend(true=deepCopy, target, traits, original)
    tt.unshift(config);
    tt.unshift(true);
    tt.push(config);
    $.extend.apply(this, tt);
    delete config.traits; //remove traits
  }

  function replaceTemplate(val: any, i: number, vars: any) : any {
    if (typeof val === 'string') {
      //replace all {d3 format} entries by the given number
      return val.replace(/\{.*\}/g, (match:string):string => {
        if (match.length == 2) {
          return '' + i;
        }
        if (match.match(/\{(.+):(.*)\}/)) { //named match
          var key = RegExp.$1;
          var format = RegExp.$2;
          return d3.format(format)(vars[key]);
        } else {
          return d3.format(match.slice(1, -2))(i);
        }
      });
    } else if ($.isPlainObject(val)) { //recursive
      var r = {};
      d3.entries(val).forEach((entry : any) => {
        r[entry.key] = replaceTemplate(entry.value, i, vars);
      });
      return r;
    } else if (Array.isArray(val)) { //array version
      return val.map((entry) => replaceTemplate(entry,i, vars));
    } else {
      return val;
    }
  }

  export function parseNode(name:string, nodeConfig:any, parent:Node, traits:D3.Map<any>):Node {
    inlineTraits(nodeConfig, traits);
    if (nodeConfig.name) {
      name = nodeConfig.name;
    }

    // meta node tag
    if (name.match(/__repeat.*/) && nodeConfig.hasOwnProperty('range') && nodeConfig.hasOwnProperty('template')) {
      var range : number[] = nodeConfig.range || [0,10,1];
      var step = range.length < 3 ? 1 : range[2];
      var template = nodeConfig.template;
      var vars = nodeConfig.vars || {};
      vars['i'] = 0;
      var vari = {};
      for(var i = range[0]; i <= range[1]; i += step) {
        vari = {};
        d3.entries(vars).forEach((entry) => {
          vari[entry.key] = entry.value + i;
        })
        var bi = replaceTemplate(template, i, vari);
        parseNode(bi.name, bi, parent, traits);
      }
      return null;

    // standard node tag
    } else {
      var node:Node = parent === null ? new RootNode(name, nodeConfig.alias) : new Node(name, nodeConfig.alias, parent, nodeConfig.master === true);
      if (nodeConfig.title) {
        node.title = nodeConfig.title;
      }
      parseAttributes(nodeConfig, node, node);
      //support arrays and objects
      if (Array.isArray(nodeConfig.children)) {
        nodeConfig.children.forEach((child) => parseNode(child.name, child, node, traits));
      } else {
        d3.map(nodeConfig.children).forEach((name, child) => parseNode(name, child, node, traits));
      }
      return node;
    }
  }

  export class EdgeFactory {
    constructor(private config:any, private src:RegExp, private dst:RegExp) {

    }

    match(src:Node, dst:Node) {
      return src.fqIname.match(this.src) && dst.fqIname.match(this.dst);
    }

    create(src:Node, dst:Node) {
      if (!this.match(src, dst)) {
        return null;
      }
      if (src === dst && !this.config.selfLoops) {
        return null;
      }
      var edge = new Edge(src, dst, false);
      parseAttributes(this.config, edge, edge);
      return edge;
    }
  }

  function parseEdge(edgeConfig:any, nodes:D3.Map<any>, traits:D3.Map<any>, lazyEdges : EdgeFactory[]) {
    //convert path to regex:
    inlineTraits(edgeConfig, traits);
    function filterNodes(reg:string) {
      var r = new RegExp(reg, 'i');
      return nodes.entries().filter((entry) => (<any>entry).key.match(r)).map((entry) => (<any>entry).value);
    }

    var bi = edgeConfig.bidirectional === true;
    function createEdge(src, dst) {
      var edge = new Edge(src, dst);
      parseAttributes(edgeConfig, edge, edge);
      if (bi) {
        edge = new Edge(dst, src);
        parseAttributes(edgeConfig, edge, edge);
      }
    }
    if (edgeConfig.hierarchical) { //create edges in all hierarchy levels
      var noparent = [];
      nodes.values().forEach((node) => {
        if (node.parent) {
          createEdge(node, node.parent);
        } else {
          noparent.push(node);
        }
      });
      //create external to root link
      noparent.forEach((node, i) => {
        noparent.slice(i+1).forEach((node2) => {
          createEdge(node, node2);
        })
      });
    } else if (edgeConfig.lazy === true) {
      lazyEdges.push(new EdgeFactory(edgeConfig, new RegExp(edgeConfig.src, 'i'), new RegExp(edgeConfig.dst, 'i')));
    } else {
      var srcNodes = filterNodes(edgeConfig.src);
      if (srcNodes.length == 0) {
        console.warn('invalid edgeconfig.src expression: no matching found: ' + edgeConfig.src);
        return;
      }
      var dstNodes = filterNodes(edgeConfig.dst);
      if (dstNodes.length == 0) {
        console.warn('invalid edgeconfig.dst expression: no matching found: ' + edgeConfig.dst);
        return;
      }
      srcNodes.forEach((src) => {
        dstNodes.forEach((dst) => {
          if (src !== dst || edgeConfig.selfLoops) { //no self loops
            createEdge(src, dst);
          }
        });
      });
    }
  }

  function parseEdges(edgeConfigs:any[], nodes:Node[], traits:D3.Map<any>, lazyEdges: EdgeFactory[]):void {
    var lookup = d3.map();
    nodes.forEach((node) => {
      lookup.set(node.fqIname, node)
    });
    edgeConfigs.forEach((i) => parseEdge(i, lookup, traits, lazyEdges));
  }

  function parseExternal(externalConfig:any) {
    var aliases = (externalConfig) ? externalConfig.aliases : null;
    return new ExternalNode(aliases);
  }

  /**
   * parses the given infrastructure configuration file
   * @param config
   * @returns {PVDModels.Infrastructure}
   */
  export function parse(config:any, traits?:any):Infrastructure {
    // override the external traits.json (`traits`) with the infrastructure.json (`config.traits`) one
    //var traits2 = angular.extend({}, traits, config.traits);
    var root = parseNode('root', config.root, null, traits);
    var external = parseExternal(config.external);
    var factory = new Array<EdgeFactory>();

    function createLazyEdge(src : Node, dst: Node) {
      var i,f, e;
      for(i = 0; i < factory.length; ++i) {
        f = factory[i];
        e = f.create(src, dst);
        if (e) {
          return e;
        }
      }
      return null;
    }
    var r = new Infrastructure(config.name, <RootNode>root, external, config.version, config.id || '', createLazyEdge);
    r.color = config.color || "";
    r.oids = config.oids || [];
    r.visConfig = config.visConfig || {};
    parseEdges(config.edges, r.nodes(), traits, factory);
    return r;
  }

  /**
   * splits the given fqIname into its two components
   * @param path
   * @returns {*}
   */
  export function splitInfrastructure(path: string) {
    var match = /(.*):(.*)/.exec(path);
    if (match.length === 0) { //no dedicated infrastructure
      return { id: '', path: path};
    }
    return { id: match[1], path: match[2]};
  }

  export function findLeastCommonAncestor(sparents : PVDModels.Node[], dparents: PVDModels.Node[]) {
    var i:number = sparents.length-1,j:number = dparents.length-1 ,p: PVDModels.Node = null;
    //while the ends are the same
    while(i >= 0 && j >= 0 && sparents[i] === dparents[j]) {
      i--;
      j--;
    }
    return {
      found : i < sparents.length-1,
      lcancestor : sparents[i+1],
      si : i+1,
      di : j+1
    }
  }

  export function distance(a: PVDModels.Node, b: PVDModels.Node) {
    if (a === b) {
      return 0;
    }
    var r = findLeastCommonAncestor(a.parents, b.parents);
    return r.found ? (r.si + r.di) : -1;
  }

  /**
   * returns a string with just a dash and underline as special character
   * @param fqname
   * @returns {string}
   */
  export function converToCSSClass(fqname:String) {
    return fqname.replace(/[!\'#$%&'\(\)\*\+,\.\/:;<=>\?\@\[\\\]\^`\{\|\}~]/g, '-');
  }

  export class GraphRoute {
    /**
     * path from src to lca
     */
    srcPath : Node[];
    /**
     * path from src to lca
     */
    dstPath : Node[];
    /**
     * least common ancestor (lca)
     * @type {Node}
     */
    lcancestor: Node = null;

    private partOf : D3.Set<Node> = d3.set();

    constructor(public src: Node, public dst: Node) {
      if (src === dst) { //same node
        this.srcPath = [src];
        this.dstPath = [dst];
        this.lcancestor = src;
      } else {
        this.srcPath = src.parents;
        this.dstPath = dst.parents;
        var r = findLeastCommonAncestor(this.srcPath, this.dstPath);
        if (r.found) {
          this.lcancestor = r.lcancestor;
          this.srcPath = this.srcPath.slice(0, r.si+1); //should include the root
          this.dstPath = this.dstPath.slice(0, r.di+1);
        }
      }
      if (!this.lcancestor) {
        console.error('cant match to nodes, not even the root');
      }
      this.srcPath.forEach((n) => this.partOf.add(n));
      this.dstPath.forEach((n) => this.partOf.add(n));
    }

    /**
     * filter function used for node.children to filter just the relevant ones
     * @param cur
     * @returns {boolean}
     */
    filter(cur: Node) {
      return this.partOf.has(cur);
    }
  }

  /**
   * finds and returns the graph route between the two nodes
   * @param src
   * @param dst
   * @returns {PVDModels.GraphRoute}
   */
  export function graphRoute(src: Node, dst: Node) {
    return new GraphRoute(src, dst);
  }
}
