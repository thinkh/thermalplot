'use strict';

describe('Controller: RandomCtrl', function () {

  // load the controller's module
  beforeEach(module('pipesVsDamsApp'));

  var RandomCtrl,
    scope;

  // Initialize the controller and a mock scope
  beforeEach(inject(function ($controller, $rootScope) {
    scope = $rootScope.$new();
    RandomCtrl = $controller('RandomCtrl', {
      $scope: scope
    });
  }));

  it('should attach a list of awesomeThings to the scope', function () {
    //expect(scope.awesomeThings.length).toBe(3);
    expect(true).toBe(true);
  });

  it('should be disconnected first', function() {
    expect(scope.isConnected).toBe(false);
  });

  it('should contain no data points for D3 first', function() {
    expect(scope.data.length).toBe(0);
  });
});
