/**
 * Created by Samuel Gratzl on 24.07.2014.
 */
/// <reference path="../../../tsd.d.ts" />

interface IResolvedMapping<T extends PVDModels.IPathElem> {
  infrastructure : PVDModels.Infrastructure;
  node : T;
}

/**
 * provides a mapping service for different hierarchies
 */
class PVDInfrastructureMapper {
  /**
   * a deferred interface for having the mapping loaded
   */
  private ready : ng.IDeferred<PVDInfrastructureMapper>;
  private isReady = false;

  constructor(private pvdInfrastructureLoader: PVDInfrastructureLoader, private $q : ng.IQService, private $log : ng.ILogService) {
    this.ready = $q.defer();
  }

  /**
   * lazy parses this mappings and returns a promise upon result
   * @param data
   * @returns {IPromise<any[]>}
   */
  parse(data : string[]) {
    return this.$q.all(data.map((m) => this.parseEntry(m))).then(() => {
      this.ready.resolve(this);
      this.isReady = true;
      return this.$q.when(this);
    });
  }

  reset() {
    this.ready = this.$q.defer();
    this.isReady = false;
  }

  /**
   * returns a promise when the mappings are loaded
   * @returns {IPromise<PVDInfrastructureMapper>}
   */
  get loaded() {
    return this.ready.promise;
  }

  /**
   * tries to map the given node to the other hierarchy
   * @param node
   * @param target
   * @returns {*}
   */
  private mapImpl<T extends PVDModels.IPathElem>(node: T, target : string) : T[] {
    var source = node.infrastructure;
    if (source.id === target) { //same infrastructure no mapping
      return [node];
    }
    if (node instanceof PVDModels.Node) { //its a node
      return <T[]>(<any>this.mapNodeImpl(<PVDModels.Node>(<any>node), target, source));
    } else if (node instanceof PVDModels.Edge) { //edge case map both ends
      var edge = <PVDModels.Edge>(<any>node),
          srcM = this.mapNodeImpl(edge.src, target, source),
          dstM = this.mapNodeImpl(edge.dst, target, source);
      if (srcM.length === 0 || dstM.length === 0) {
        return [];
      }
      var edges = []; //collect all matching edges
      srcM.forEach((src) => {
        edges.push.apply(edges, src.outgoingEdges().filter((edgem) => dstM.indexOf(edgem.dst) >= 0));
      });
      return edges;
    } else {
      this.$log.warn('invalid path element '+(typeof node)+ ' cant map');
      return [];
    }
  }

  private mapNodeImpl(node : PVDModels.Node, target: string, source : PVDModels.Infrastructure) : PVDModels.Node[] {
    var r = node.getMappings(target);
    if (r.length > 0) { //direct mapping
      return r;
    }
    var l = new Array<PVDModels.Node>();
    this.mapAll(l, node, d3.set([target, source.id]), target);
    return l;
  }

  /**
   * maps a resolved not to a given target node
   * @param node
   * @param target
   * @returns {any}
   */
  mapTo<T extends PVDModels.IPathElem>(node: T, target : string) :  ng.IPromise<T[]> {
    return this.loaded.then(() => this.$q.when(this.mapImpl(node, target)));
  }

  /**
   * maps a resolved not to a given target node it not yet loaded, return the _else value
   * @param node
   * @param target
   * @param _else
   * @returns {T[]}
   */
  mapToUnchecked<T extends PVDModels.IPathElem>(node: T, target : string, _else : T[] = null): T[] {
    if (!this.isReady) {
      return _else;
    }
    return this.mapImpl(node, target);
  }

  /**
   * maps a given path to a given target id
   * @param path
   * @param targetID
   * @returns {IPromise<TResult>|IPromise<ng.IPromise<PVDModels.Node[]>>}
   */
  mapPath<T extends PVDModels.IPathElem>(path : string, targetID : string) : ng.IPromise<T[]> {
    return this.loaded.then(() => this.resolve(path)).then((r : IResolvedMapping<T>)=>{
      return this.$q.when(this.mapImpl(r.node, targetID));
    });
  }
  /**
   * maps a given path to a given target id
   * @param path
   * @param targetID
   * @param _else
   * @returns {PVDModels.IPathElem[]}
   */
  mapPathUnchecked<T extends PVDModels.IPathElem>(path : string, targetID : string, _else : T[] = null): T[] {
    if (!this.isReady) {
      return _else;
    }
    var r : IResolvedMapping<T> = this.resolveUnchecked<T>(path);
    if (!r) {
      return _else;
    }
    return this.mapImpl(r.node, targetID);
  }

  /**
   * if not direct mapping is available then walk over the other hierachies
   * @param r
   * @param act
   * @param excluded
   * @param target
   */
  private mapAll(r : PVDModels.Node[], act : PVDModels.Node, excluded : D3.Set<any>, target: string) {
    var that = this;
    var m = act.getAllMappings();
    if (m.has(target)) {//found mapping
      r.push.apply(r, m.get(target));
      return;
    }
    //check all other mappings and go over two hops
    m.keys().filter((k) => !excluded.has(k)).forEach((k) => {
      var mappings : PVDModels.Node[] = m.get(k);
      excluded.add(k); //avoid back loops
      mappings.forEach((neighbor) => {
        that.mapAll(r, neighbor, excluded, target);
      });
      excluded.remove(k);
    });
  }

  /**
   * parses the data entry
   * @param m
   * @returns {IPromise<TResult>|IPromise<undefined>}
   */
  private parseEntry(m:any) {
    var a;
    var b;
    // if message as string (e.g. "p:node1.server.com-vm:node2.virtual.com");
    if(typeof m === 'string') {
      var match = /(.*)-(.*)/.exec(m);
      a = match[1];
      b = match[2];

    // if message as array (e.g. ["p:node1.server.com","vm:node2.virtual.com"]);
    } else {
      a = m[0];
      b = m[1];
    }

    //resolve both
    return this.$q.all([this.resolve(a), this.resolve(b)]).then((mappings) => {
      var ar : IResolvedMapping<PVDModels.Node> = mappings[0];
      var br : IResolvedMapping<PVDModels.Node> = mappings[1];
      if (!ar.node) {
        this.$log.warn('invalid mapping '+m+' cant resolve left node');
        return;
      }
      if (!br.node) {
        this.$log.warn('invalid mapping '+m+' cant resolve right node');
        return;
      }
      //store the mapping
      ar.node.addMapping(br.infrastructure.id, br.node);
      br.node.addMapping(ar.infrastructure.id, ar.node);
    }, (error) => {
      this.$log.warn('cant resolve mapping '+m,error);
    });
  }

  /**
   * dumps the mappings between the two given infrastructure ids
   * @param source the source infrastructure
   * @param target the target infrastructure
   * @returns {Array}
   */
  dump(source: string, target: string) {
    var r = [];
    function dumpMapping(node: PVDModels.Node) {
      var prefix = node.fqIname+'-';
      node.getMappings(target).forEach((other) => {
        r.push(prefix+other.fqIname);
      });
      node.children().forEach(dumpMapping);
    }
    var inf = this.pvdInfrastructureLoader.getUnchecked(source);
    if (inf) {
      dumpMapping(inf.external);
      dumpMapping(inf.root);
    }
    return r;
  }

  /**
   * resolve a given path via infrastructure and return a promise
   * @param a
   * @returns {IPromise<IResolvedMapping>}
   */
  private resolve<T extends PVDModels.IPathElem>(m : string) : ng.IPromise<IResolvedMapping<T>> {
    var split = PVDModels.splitInfrastructure(m);
    return this.pvdInfrastructureLoader.get(split.id).then((infrastructure) => {
      return this.$q.when({
        infrastructure : infrastructure,
        node : infrastructure.find(split.path)
      });
    });
  }

  private resolveUnchecked<T extends PVDModels.IPathElem>(m : string, _else: IResolvedMapping<T> = null) : IResolvedMapping<T> {
    var split = PVDModels.splitInfrastructure(m);
    var infrastructure = this.pvdInfrastructureLoader.getUnchecked(split.id);
    return infrastructure ? {
        infrastructure : infrastructure,
        node : infrastructure.find(split.path)
      } : _else;
  }

  private mapAttributes(node:PVDModels.AttributeContainer, mapping:PVDModels.AttributeContainer[], attributes:string[], reduce = '+') {
    var added = [];
    attributes.forEach((attribute) => {
      var mapped = mapping.map((m) => m.getAttr(attribute)).filter((m) => typeof m !== 'undefined');
      var r:PVDModels.IAttribute<any> = null;
      if (mapped.length === 1) {
        //single mapping just a redirect
        r = PVDModels.redirect(mapped[0], <any>node);
      } else if (mapped.length > 1) { //composite case
        r = PVDModels.compose(mapped, reduce, <any>node, attribute);
      }
      if (r) {
        node.addAttr(r);
        added.push(r);
      }
    });
    return added;
  }

  /**
   * similar to mapNodeAttribute but the resolution is take place on the fly
   * @param sourceID
   * @param targetID
   * @param attributes
   * @param reduce
   * @returns {IPromise<TResult>|IPromise<undefined>}
   */
  mapDynamicNodeAttribute(sourceID:string, targetID:string, attributes:string[], reduce = '+') {
    var $q = this.$q;
    var that = this;
    $q.all([this.loaded, this.pvdInfrastructureLoader.get(targetID)]).then((data) => {
      var target = data[1];
      var nodes = target.nodes();
      nodes.map((node) => { //for all nodes
        attributes.forEach((attribute) => {
          var access = function () {
            var mapped = that.mapImpl(node, sourceID);
            return mapped.map((m) => m.getAttr(attribute)).filter((m) => typeof m !== 'undefined');
          };
          var a = PVDModels.composeF(access, reduce, <any>node, attribute);
          node.addAttr(a);
        });
      });
    });
  }

  /**
   * similar to mapEdgeAttribute but the resolution is take place on the fly
   * @param sourceID
   * @param targetID
   * @param attributes
   * @param reduce
   * @returns {IPromise<TResult>|IPromise<undefined>}
   */
  mapDynamicEdgeAttribute(sourceID:string, targetID:string, attributes:string[], reduce = '+') {
    var $q = this.$q;
    var that = this;
    $q.all([this.loaded, this.pvdInfrastructureLoader.get(targetID)]).then((data) => {
      var target = data[1];
      var addDynamicAttributes = (edge) => { //for all nodes
        attributes.forEach((attribute) => {
          var access = function () {
            var mapped = that.mapImpl(edge, sourceID);
            if (!mapped) {
              debugger;
              mapped = that.mapImpl(edge, sourceID);
            }
            return mapped.map((m) => m.getAttr(attribute)).filter((m) => typeof m !== 'undefined');
          };
          var a = PVDModels.composeF(access, reduce, <any>edge, attribute);
          edge.addAttr(a);
        });
      };
      target.edges().forEach(addDynamicAttributes);
      target.edgeInitializers.push(addDynamicAttributes);
    });
  }
}


angular.module('pipesVsDamsApp').service('pvdInfrastructureMapper', PVDInfrastructureMapper);