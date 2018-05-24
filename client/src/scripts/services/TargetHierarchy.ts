/**
 * Created by Holger Stitz on 24.10.2014.
 */
import * as angular from 'angular';
import { Infrastructure } from "../models/Infrastructure";

export class PVDTargetHierarchy {

  public hierarchy = ['s', 'vm', 'b'];

  constructor() { }

  public targetFromInfra = (up: boolean, infra: Infrastructure) => {
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
    return h[i + 1];
  }

  public previous(id: string) {
    var h = this.hierarchy;
    var i = h.indexOf(id);
    if (i < 0) {
      return null;
    }
    return h[i - 1];
  }

}

export default angular.module('services.pvdTargetHierarchy', [])
  .service('pvdTargetHierarchy', [
    PVDTargetHierarchy
  ]).name;
