/**
 * Created by Holger Stitz on 03.02.2015.
 */
import * as angular from '@bower_components/angular';
import * as d3 from '@bower_components/d3/d3';

export class PVDUseCaseConfig {

  public usecases: d3.Map<any> = d3.map();
  private isLoaded = false;

  constructor() {

  }

  public load($http, success, error) {
    var that = this;

    if (that.isLoaded === false) {
      $http.get('api/all_use_cases').then(function (response) {
        that.isLoaded = true;

        response.data.forEach(function (d) {
          that.usecases.set(d.name, d);
        });

        success(that.usecases);
      }, function (data) {
        console.error('Error loading use cases', data);
        error(data);
      });

    } else {
      success(that.usecases);
    }
  }
}

export default angular.module('services.pvdUseCaseConfig', []).service('pvdUseCaseConfig', PVDUseCaseConfig).name;
