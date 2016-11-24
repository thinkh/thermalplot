/**
 * Created by Holger Stitz on 03.02.2015.
 */
/// <reference path='../../../tsd.d.ts' />

class PVDUseCaseConfig {

  public usecases:D3.Map<any> = d3.map();
  private isLoaded = false;

  constructor() {

  }

  public load($http, success, error) {
    var that = this;

    if(that.isLoaded === false) {
      $http.get('all_use_cases').then(function (response) {
        that.isLoaded = true;

        response.data.forEach(function(d) {
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

angular.module('pipesVsDamsApp').service('pvdUseCaseConfig', PVDUseCaseConfig);
