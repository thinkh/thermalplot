'use strict';

describe('Controller: InfrastructureCtrl', function () {
  
  // load the controller's module
  beforeEach(module('pipesVsDamsApp'));

  var $rootScope, createController;

  beforeEach(inject(function ($injector) {
    // Get hold of a scope (i.e. the root scope)
    $rootScope = $injector.get('$rootScope');
    // The $controller service is used to create instances of controllers
    var $controller = $injector.get('$controller');

    createController = function () {
      return $controller('InfrastructureCtrl', {
        '$scope': $rootScope
      });
    };
  }));


  afterEach(function () {
  });

});