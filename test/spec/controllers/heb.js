'use strict';

describe('Controller: HebCtrl', function () {

  // load the controller's module
  beforeEach(module('pipesVsDamsApp'));

  var HebCtrl,
    scope;

  // Initialize the controller and a mock scope
  beforeEach(inject(function ($controller, $rootScope) {
    scope = $rootScope.$new();
    HebCtrl = $controller('HebCtrl', {
      $scope: scope
    });
  }));

  it('should attach a list of awesomeThings to the scope', function () {
    expect(scope.awesomeThings.length).toBe(3);
  });
});
