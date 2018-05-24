/**
 * Created by Samuel Gratzl on 24.04.2014.
 */

import * as angular from 'angular';
import * as d3 from 'd3';
import * as $ from 'jquery';
import { parse, Infrastructure } from '../models/Infrastructure';

/**
 * simple service for holding the infrastructure, the infrastructure itself
 */
interface IPVDInfrastructureCallback {
  (infrastructure: Infrastructure): any;
}

export class PVDInfrastructureLoader {

  // cache traits definition to add new nodes with attributes dynamically
  public traits: d3.Map<any> = d3.map({});

  //{ id:string, c:promise }
  private callbacks = [];
  //id->infrastructure
  private _infrastructures: d3.Map<Infrastructure> = d3.map();

  constructor(private $q: angular.IQService) {

  }

  isLoaded(id: string = '') {
    return this._infrastructures.has(id);
  }

  reset() {
    this._infrastructures = d3.map();
  }

  /**
   * return a promise for getting an infrastructure
   * @param id
   * @returns {IPromise<T>}
   */
  get(id: string = ''): angular.IPromise<Infrastructure> {
    var d = this.$q.defer();
    if (this.isLoaded(id)) {
      d.resolve(this._infrastructures.get(id));
    } else if (this._infrastructures.keys().length > 0 && id === '') { //hack first one is default
      d.resolve(this._infrastructures.values()[0]);
    } else {
      this.callbacks.push({ c: d, id: id });
    }
    return <any>d.promise;
  }

  /**
   * returns the given infrastructure else the optional return value
   * @param id - id to load
   * @param _else
   * @returns {Infrastructure}
   */
  getUnchecked(id: string = '', _else: Infrastructure = null) {
    if (this.isLoaded(id)) {
      return this._infrastructures.get(id);
    } else if (this._infrastructures.keys().length > 0 && id === '') {
      return this._infrastructures.values()[0];
    }
    return _else;
  }

  getAllUnchecked(): Infrastructure[] {
    return this._infrastructures.values();
  }

  /**
   * loads the given infrastructure
   * @param uri
   * @returns {JQueryDeferred<T>|JQueryPromise<T>}
   */
  load(uri = '/pvd/app/data/infrastructure.json') {
    return $.getJSON(uri)
      .done((data) => {
        this.parse(data)
      })
      .fail((data) => {
        console.log(data);
      });
  }

  parse(model: any, traits?: any) {
    var infrastructure = parse(model, traits);
    if (!infrastructure) {
      return null;
    }
    this.set(infrastructure, infrastructure.id || '');
    return infrastructure;
  }

  set(model: Infrastructure, id: string) {
    this._infrastructures.set(id, model);


    //call all outstanding callbacks and clear them
    this.callbacks.filter((c) => c.id === id).forEach((c) => c.c.resolve(model));
    this.callbacks = this.callbacks.filter((c) => c.id !== id);

    //hack first one = default
    if (this._infrastructures.keys().length === 1) {
      id = '';
      this.callbacks.filter((c) => c.id === id).forEach((c) => c.c.resolve(model));
      this.callbacks = this.callbacks.filter((c) => c.id !== id);
    }
  }
}
export default angular.module('services.pvdInfrastructureLoader', [])
  .service('pvdInfrastructureLoader', [
    '$q',
    PVDInfrastructureLoader
  ]).name;
