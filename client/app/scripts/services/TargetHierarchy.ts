/**
 * Created by Holger Stitz on 24.10.2014.
 */
/// <reference path='../../../tsd.d.ts' />


class PVDTargetHierarchy {

  public hierarchy = ['s','vm','b'];

  constructor() {}

  public targetFromInfra = (up:boolean, infra:PVDModels.Infrastructure) => {
    var h = this.hierarchy;
    var i = h.indexOf(infra.id);
    if (i < 0) {
      return [];
    }
    return up ? h.slice(0, i).reverse() : h.slice(i + 1);
  };

  public next(id: string) {
    var h = this.hierarchy;
    var i = h.indexOf(id);
    if (i < 0) {
      return null;
    }
    return h[i+1];
  }

  public previous(id: string) {
    var h = this.hierarchy;
    var i = h.indexOf(id);
    if (i < 0) {
      return null;
    }
    return h[i-1];
  }

}

angular.module('pipesVsDamsApp').service('pvdTargetHierarchy', PVDTargetHierarchy);
