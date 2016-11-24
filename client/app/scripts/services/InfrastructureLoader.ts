/**
 * Created by Samuel Gratzl on 24.04.2014.
 */

/// <reference path="../../../tsd.d.ts" />

/**
 * simple service for holding the infrastructure, the infrastructure itself
 */
interface IPVDInfrastructureCallback {
  (infrastructure : PVDModels.Infrastructure):any;
}

class PVDInfrastructureLoader {

  // cache traits definition to add new nodes with attributes dynamically
  public traits:D3.Map<any> = d3.map({});

  //{ id:string, c:promise }
  private callbacks = [];
  //id->infrastructure
  private _infrastructures : D3.Map<PVDModels.Infrastructure> = d3.map();

  constructor(private $q: ng.IQService) {

  }

  isLoaded(id : string = '') {
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
  get(id: string = '') : ng.IPromise<PVDModels.Infrastructure> {
    var d = this.$q.defer();
    if (this.isLoaded(id)) {
      d.resolve(this._infrastructures.get(id));
    } else if (this._infrastructures.keys().length > 0 && id === '') { //hack first one is default
      d.resolve(this._infrastructures.values()[0]);
    } else {
      this.callbacks.push({ c : d, id: id});
    }
    return d.promise;
  }

  /**
   * returns the given infrastructure else the optional return value
   * @param id - id to load
   * @param _else
   * @returns {PVDModels.Infrastructure}
   */
  getUnchecked(id : string = '', _else : PVDModels.Infrastructure = null) {
    if (this.isLoaded(id)) {
      return this._infrastructures.get(id);
    } else if (this._infrastructures.keys().length > 0 && id === '') {
      return this._infrastructures.values()[0];
    }
    return _else;
  }

  getAllUnchecked() : PVDModels.Infrastructure[] {
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

  parse(model: any, traits?:any) {
    var infrastructure = PVDModels.parse(model, traits);
    if (!infrastructure) {
      return null;
    }
    this.set(infrastructure, infrastructure.id || '');
    return infrastructure;
  }

  set(model : PVDModels.Infrastructure, id : string) {
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
angular.module('pipesVsDamsApp').service('pvdInfrastructureLoader', PVDInfrastructureLoader);
